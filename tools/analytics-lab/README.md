# Analytics center lab (Métricas)

Proves that the numbers of the Métricas center are the numbers of what visitors really did.

    tools/analytics-lab/run_all.sh        # ~6 min, needs web + postgres up and the fixture server (see below)

What it does
1. `setup.ts` creates + publishes a TEST project (VSL page with a 60s video, a button, a form, a box that does not respond, a B version, a thank-you page).
2. `traffic.py` opens it with 46 real Chromium visitors: Facebook campaign A/B on phones, Google organic on desktop, direct bounces; each watches the video up to a known second, presses the button, fills the form, hammers something, clicks a checkout link, or returns later. It writes `out/truth.json`.
3. `verify.ts` runs the real lib queries and compares them with the truth (sessions, visitors, source/campaign/device/country, conversions, leads tied to visits, rage/dead clicks, click map, scroll map, video retention at each second, retention by campaign, journey, recordings stored, insights).
4. `exp_setup.ts` + `ab.py` + `verify_ab.ts`: an A/B test (headline) with 24 visitors; the same visitor must get the same version on both visits, results must match what each side did.
5. `serve_api.ts` serves the REAL analytics route handlers (no Clerk) so `tools/ui-lab/tests/analytics_ui.py` can screenshot every screen (light, dark, phone) with the real data into `tools/ui-lab/shots/analytics_*.png`.

Needs: fixture server `cd tools/site-lab/www && python3 -m http.server 8099 --bind 0.0.0.0` (the video is `www/vsl.webm`, linked as `site-lab/www/analytics`; recreate it with ffmpeg inside a throwaway `node:20-slim` container: `testsrc2` 640x360, 60s, `libvpx`, no audio).
Server-side bot detection flags a default Playwright user agent (HeadlessChrome): always set a real `user_agent`; use `?vai_test=1` so the page script does not skip robots.
