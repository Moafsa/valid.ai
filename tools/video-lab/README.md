# Video lab

How a page's video becomes light HLS in OUR storage (`apps/scanner/services/video_processor.py`, wired in `scan_orchestrator._hls_for`):

| source | what happens |
|---|---|
| `.mp4` / `.mov` already H.264 + AAC (almost every VSL) | downloaded to disk (never into memory), cut into ~6 s `.ts` pieces **without re-encoding** (seconds) |
| other codecs (`.webm`, HEVC...) | re-encoded once to 720p H.264/AAC, then cut (up to 25 min of ffmpeg, else the old behaviour) |
| `.m3u8` (also the one sniffed behind a VTurb/Panda/Wistia player, or an hls.js player on a bare `<video>`) | manifest and every piece copied, addresses rewritten, AES key / fMP4 init file copied too |
| YouTube / Vimeo / Wistia iframe pages | **not downloaded** (those services do not hand out the file); the clone keeps its light facade player |

Anything that fails returns None and the clone goes on with the old behaviour. Limits: 2 GB per video, 6000 pieces, at most 3 players converted per page.

- `test_video_processor.py`: the processor on four real sources against the real storage (`docker exec -i funnelai_scanner python - < test_video_processor.py`).
- `clone_vsl.py [vsl_mp4 vsl_webm vsl_hls]`: clones the fixtures (`tools/site-lab/www/vsl_*`, media in `www/media`) with the real scanner and checks the stored page.
- `play_check.py <base> name:projectId:slug ...`: opens the clones in a browser and checks the playlist/pieces come from our storage, no whole mp4, the player and the buy button are there.

Test-environment limit: Playwright's Chromium cannot play H.264, so playback was verified with VP9 fMP4 HLS (`vsl_hls`); for the H.264 cases the check is the network (playlist + only the first pieces, all from our storage). The encrypted TS fixture (`vsl_hlsenc`) is covered by the processor test only (a clone of it stalls the behaviour probe in that browser because hls.js can never decode it).

## Many videos, hidden buttons, odd players (2026-10-10)

Found on a real site (a Lovable app: `<youtube-video>` web component + a click-to-play layer + a buy button that shows when the video reaches 3:00). Before: the clone had a dead custom element and no button. Now (`gen_fixtures.py` writes one page per situation, `check_situations.py` clones them with the real scanner and checks the result):

| situation | fixture | what the clone does |
|---|---|---|
| web-component player (`youtube-video`, `lite-youtube`, `vimeo-video`, `wistia-player`, `mux-player`, any element with a frame/`<video>` in its shadow root) | `vsl_ytcomp`, `vsl_components` | the host gets its size/address written by the capture (`data-vai-vhost/box/embed/vsrc`), `video_embed._host_players` turns it into the light player |
| click-to-play layer laid over the video | `vsl_ytcomp`, `vsl_native_pitch`, `vsl_cover_text` | marked `data-vai-cover`, removed (our player has its own cover); a layer with words is kept in funnels (the walker may press it) |
| button shown when the video reaches a second | `vsl_ytcomp`, `vsl_native_pitch`, `vsl_native_nodur`, `vsl_multi` | `MEDIA_TIME_PROBE_JS`: the media element is told the video is at second F (currentTime + `timeupdate`, no waiting), F grows, what shows up is tagged `data-vai-pitch-at`. Also runs inside the funnel walker (first screen with media). Works with unknown duration (900 s cap) |
| button shown by a timer | `vsl_multi`, `vsl_timer` | an untouched second copy of the page decides timer vs video (`CLOCK_WATCH_JS`); long `setTimeout`s are shortened for the capture but their real delay is remembered (`data-vai-when` -> `data-vai-delay`) |
| several videos on a page | `vsl_multi`, `vsl_iframes` | every video/frame becomes its own player; ~20 video hosts recognised (Wistia, Panda, Bunny, Vidalytics, Cloudflare, JW, Brightcove, Vimeo, YouTube...) |
| video that only gets its address on scroll, `<source>` children | `vsl_lazy` | converted to HLS after the scroll |
| relative addresses (`/media/film.mp4`) | all | resolved against the page's site before conversion |

In the clone the player tells the page where an embedded video is: YouTube (`infoDelivery` messages, `enablejsapi=1`) and Vimeo (`timeupdate`) frames report their position as `vai:video-time`, so a pitch button comes up at the right moment; a frame that says nothing is timed from the tap. `reveal_check.py` checks that in a browser (hidden, hidden before the second, shown after).
Limits: DASH (`.mpd`) streams are not converted; a pitch tied to a player API that is not read from the element (`player.getCurrentTime()` of a library that does not expose it on the element) is not seen; YouTube/Vimeo/Wistia files are never downloaded.
