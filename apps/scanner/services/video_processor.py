"""
Turns the video of a cloned page into HLS in OUR storage, so the clone is light (it only fetches the few seconds being watched, like YouTube
or VTurb do) and does not depend on the original site staying up.

Three sources are handled:
  - a plain file (.mp4, .webm, .mov): downloaded straight to DISK (never into memory), cut into ~6 s .ts pieces. When the video is already
    H.264 + AAC (almost every VSL) the pieces are cut WITHOUT re-encoding (seconds, no quality loss); anything else is re-encoded once to 720p.
  - an HLS stream (.m3u8, also the one sniffed behind a VTurb / Panda / Wistia player): manifest and every piece are mirrored, the
    addresses inside the manifest rewritten, the key of an encrypted stream mirrored too.
  - embeds (YouTube, Vimeo, Wistia iframe pages) are NOT downloaded: those services do not hand out the file (and their terms forbid it); the clone keeps its light
    facade player in front of the embed.

Every failure returns None and the caller keeps the old behaviour: a video problem never stops a clone.
"""
import asyncio
import json
import os
import re
import shutil
import tempfile
from urllib.parse import urljoin, urlsplit

import httpx
from loguru import logger

from services.asset_uploader import AssetUploader, _BROWSER_USER_AGENT

MAX_SOURCE_BYTES = 2 * 1024 ** 3          # 2 GB: a two-hour VSL is usually 0.5 - 1.5 GB
MAX_HLS_BYTES = 2 * 1024 ** 3
MAX_SEGMENTS = 6000
SEGMENT_SECONDS = 6
TRANSCODE_TIMEOUT = 25 * 60
COPY_TIMEOUT = 15 * 60
CONTENT_TYPES = {".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t", ".m4s": "video/iso.segment", ".mp4": "video/mp4", ".key": "application/octet-stream", ".aac": "audio/aac", ".vtt": "text/vtt"}
VIDEO_FILE = re.compile(r"\.(mp4|webm|mov|m4v)(\?|#|$)", re.I)


def is_hls_url(url: str) -> bool:
    return bool(re.search(r"\.m3u8(\?|#|$)", url or "", re.I))


def is_video_file(url: str) -> bool:
    return bool(VIDEO_FILE.search(url or ""))


def _ctype(name: str) -> str:
    return CONTENT_TYPES.get(os.path.splitext(name.split("?")[0])[1].lower(), "application/octet-stream")


class VideoProcessor:
    def __init__(self, uploader: AssetUploader, project_id: str):
        self.up = uploader
        self.project_id = project_id
        self._sem = asyncio.Semaphore(8)

    async def to_hls(self, url: str, label: str, referer: str | None = None) -> dict | None:
        """Returns {"url": playlist address in our storage, "mode": copy|transcode|mirror, "seconds": duration or None, "bytes": size} or None."""
        if not url.startswith(("http://", "https://")):
            return None
        prefix = f"projects/{self.project_id}/videos/{label}"
        try:
            if is_hls_url(url):
                return await self._mirror_hls(url, prefix, referer)
            return await self._convert_file(url, prefix, referer)
        except Exception as e:
            logger.warning(f"video to HLS failed for {url[:120]}: {e!r}")
            return None

    # ───────────── a file ─────────────
    async def _convert_file(self, url: str, prefix: str, referer: str | None) -> dict | None:
        if not shutil.which("ffmpeg"):
            logger.warning("ffmpeg is not installed: the video stays a plain file")
            return None
        work = tempfile.mkdtemp(prefix="vai_vid_")
        try:
            src = os.path.join(work, "source")
            size = await self._download(url, src, referer)
            if not size:
                return None
            return await self._hls_from_source(src, work, prefix)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    async def from_file(self, src: str, prefix: str, poster: bool = True) -> dict | None:
        """A video the owner uploaded in the editor (already on disk): same HLS pieces, plus a poster picture.
        Returns {"url", "poster", "mode", "seconds", "width", "height", "bytes"} or None when it is not a playable video."""
        if not shutil.which("ffmpeg"):
            logger.warning("ffmpeg is not installed: cannot prepare the uploaded video")
            return None
        work = tempfile.mkdtemp(prefix="vai_up_")
        try:
            return await self._hls_from_source(src, work, prefix, poster=poster)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    async def _hls_from_source(self, src: str, work: str, prefix: str, poster: bool = False) -> dict | None:
        info = await self._probe(src)
        if not info or not info.get("video"):
            return None
        out = os.path.join(work, "hls")
        os.makedirs(out)
        can_copy = info["video"] == "h264" and info.get("audio") in (None, "aac", "mp3")
        mode = "copy" if can_copy else "transcode"
        ok = await self._ffmpeg_hls(src, out, mode, info)
        if not ok and can_copy:                      # a stream that does not cut cleanly without re-encoding
            shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
            mode = "transcode"
            ok = await self._ffmpeg_hls(src, out, mode, info)
        if not ok:
            return None
        poster_url = None
        if poster:
            pic = os.path.join(work, "poster.jpg")
            at = "1" if (info.get("duration") or 0) > 3 else "0"
            proc = await asyncio.create_subprocess_exec("ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-ss", at, "-i", src, "-frames:v", "1", "-vf", "scale=-2:'min(720,ih)'", "-q:v", "4", pic, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            try:
                await asyncio.wait_for(proc.communicate(), timeout=60)
            except asyncio.TimeoutError:
                proc.kill()
            if os.path.exists(pic) and os.path.getsize(pic) > 0:
                await self.up.put_file(f"{prefix}/poster.jpg", pic, "image/jpeg")
                poster_url = f"{self.up_base()}/{prefix}/poster.jpg"
        total = await self._upload_dir(out, prefix)
        if total is None:
            return None
        return {"url": f"{self.up_base()}/{prefix}/index.m3u8", "poster": poster_url, "mode": mode, "seconds": info.get("duration"), "width": info.get("width"), "height": info.get("height"), "bytes": total}

    def up_base(self) -> str:
        from config import settings
        return settings.CDN_URL

    async def _download(self, url: str, dest: str, referer: str | None) -> int:
        headers = {"User-Agent": _BROWSER_USER_AGENT}
        if referer:
            headers["Referer"] = referer
        got = 0
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=20), follow_redirects=True, headers=headers) as c:
            async with c.stream("GET", url) as r:
                r.raise_for_status()
                declared = int(r.headers.get("content-length") or 0)
                if declared > MAX_SOURCE_BYTES:
                    logger.warning(f"video is {declared} bytes, over the limit: left as it is")
                    return 0
                with open(dest, "wb") as f:
                    async for chunk in r.aiter_bytes(1024 * 256):
                        got += len(chunk)
                        if got > MAX_SOURCE_BYTES:
                            logger.warning("video grew past the limit: left as it is")
                            return 0
                        f.write(chunk)
        return got

    async def _probe(self, path: str) -> dict | None:
        proc = await asyncio.create_subprocess_exec("ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        out, _ = await proc.communicate()
        try:
            j = json.loads(out or b"{}")
        except Exception:
            return None
        v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video" and s.get("codec_name") not in ("mjpeg", "png")), None)
        a = next((s for s in j.get("streams", []) if s.get("codec_type") == "audio"), None)
        dur = None
        try:
            dur = float((j.get("format") or {}).get("duration") or (v or {}).get("duration"))
        except Exception:
            pass
        return {"video": (v or {}).get("codec_name"), "audio": (a or {}).get("codec_name") if a else None, "width": int((v or {}).get("width") or 0), "height": int((v or {}).get("height") or 0), "duration": dur}

    async def _ffmpeg_hls(self, src: str, out: str, mode: str, info: dict) -> bool:
        base = ["nice", "-n", "10", "ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", src, "-map", "0:v:0", "-map", "0:a:0?"]
        if mode == "copy":
            codec = ["-c", "copy"]
            limit = COPY_TIMEOUT
        else:
            vf = "scale=-2:'min(720,ih)'"
            codec = ["-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})", "-c:a", "aac", "-b:a", "128k", "-ac", "2"]
            limit = TRANSCODE_TIMEOUT
        cmd = base + codec + ["-f", "hls", "-hls_time", str(SEGMENT_SECONDS), "-hls_list_size", "0", "-hls_playlist_type", "vod", "-hls_segment_filename", os.path.join(out, "seg_%05d.ts"), os.path.join(out, "index.m3u8")]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        try:
            _, err = await asyncio.wait_for(proc.communicate(), timeout=limit)
        except asyncio.TimeoutError:
            proc.kill()
            logger.warning(f"ffmpeg ({mode}) took more than {limit}s: giving up on HLS for this video")
            return False
        if proc.returncode != 0 or not os.path.exists(os.path.join(out, "index.m3u8")):
            logger.warning(f"ffmpeg ({mode}) failed: {(err or b'')[-300:].decode(errors='ignore')}")
            return False
        return True

    async def _upload_dir(self, folder: str, prefix: str) -> int | None:
        names = sorted(os.listdir(folder))
        if not names or "index.m3u8" not in names or len(names) > MAX_SEGMENTS:
            return None
        total = 0

        async def one(name: str):
            nonlocal total
            path = os.path.join(folder, name)
            async with self._sem:
                await self.up.put_file(f"{prefix}/{name}", path, _ctype(name))
            total += os.path.getsize(path)

        # the playlist goes last: it only exists publicly once every piece it names is there
        await asyncio.gather(*[one(n) for n in names if n != "index.m3u8"])
        await one("index.m3u8")
        return total

    # ───────────── a stream ─────────────
    async def _fetch(self, c: httpx.AsyncClient, url: str) -> bytes:
        r = await c.get(url)
        r.raise_for_status()
        return r.content

    async def _mirror_hls(self, url: str, prefix: str, referer: str | None) -> dict | None:
        headers = {"User-Agent": _BROWSER_USER_AGENT}
        if referer:
            headers["Referer"] = referer
        async with httpx.AsyncClient(timeout=httpx.Timeout(40, connect=20), follow_redirects=True, headers=headers) as c:
            text = (await self._fetch(c, url)).decode("utf-8", "ignore")
            if "#EXTM3U" not in text:
                return None
            media_url = url
            if "#EXT-X-STREAM-INF" in text:
                # a master playlist: the best quality that is still light (a phone does not need more than ~1080p)
                best, best_bw = None, -1
                lines = text.splitlines()
                for i, line in enumerate(lines):
                    if line.startswith("#EXT-X-STREAM-INF"):
                        bw = int((re.search(r"BANDWIDTH=(\d+)", line) or [0, 0])[1] or 0)
                        h = int((re.search(r"RESOLUTION=\d+x(\d+)", line) or [0, 0])[1] or 0)
                        nxt = next((l.strip() for l in lines[i + 1:] if l.strip() and not l.startswith("#")), None)
                        if nxt and (h == 0 or h <= 1080) and bw > best_bw:
                            best, best_bw = nxt, bw
                if not best:
                    return None
                media_url = urljoin(url, best)
                text = (await self._fetch(c, media_url)).decode("utf-8", "ignore")
                if "#EXTINF" not in text:
                    return None
            # every address the playlist needs: pieces, the key of an encrypted stream, the init file of fragmented MP4
            out_lines, jobs = [], []
            n = 0
            seconds = 0.0
            for line in text.splitlines():
                st = line.strip()
                if st.startswith("#EXT-X-KEY") or st.startswith("#EXT-X-MAP"):
                    m = re.search(r'URI="([^"]+)"', st)
                    if m:
                        n += 1
                        name = f"aux_{n:03d}{os.path.splitext(urlsplit(m.group(1)).path)[1] or '.bin'}"
                        jobs.append((urljoin(media_url, m.group(1)), name))
                        line = line.replace(m.group(1), name)
                    out_lines.append(line)
                elif st and not st.startswith("#"):
                    n += 1
                    ext = os.path.splitext(urlsplit(st).path)[1].lower()
                    name = f"seg_{n:05d}{ext if ext in ('.ts', '.m4s', '.mp4', '.aac') else '.ts'}"
                    jobs.append((urljoin(media_url, st), name))
                    out_lines.append(name)
                else:
                    if st.startswith("#EXTINF:"):
                        try:
                            seconds += float(st[8:].split(",")[0])
                        except Exception:
                            pass
                    out_lines.append(line)
            if not jobs or len(jobs) > MAX_SEGMENTS:
                return None
            total = 0
            failed = False

            async def piece(src: str, name: str):
                nonlocal total, failed
                if failed:
                    return
                async with self._sem:
                    try:
                        body = await self._fetch(c, src)
                        total += len(body)
                        if total > MAX_HLS_BYTES:
                            failed = True
                            return
                        await self.up.put_object(f"{prefix}/{name}", body, _ctype(name))
                    except Exception as e:
                        failed = True
                        logger.warning(f"HLS piece failed {src[:100]}: {e!r}")

            await asyncio.gather(*[piece(u, nme) for u, nme in jobs])
            if failed:
                return None
            await self.up.put_object(f"{prefix}/index.m3u8", ("\n".join(out_lines) + "\n").encode(), "application/vnd.apple.mpegurl")
            return {"url": f"{self.up_base()}/{prefix}/index.m3u8", "mode": "mirror", "seconds": seconds or None, "bytes": total}
