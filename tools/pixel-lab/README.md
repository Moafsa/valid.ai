# Pixel lab

`pixel_e2e.py` runs the real `apps/web/public/vai-e.js` and the real `vai-runtime.js` in Chromium, on a fake page, with the vendors' servers
(Meta, Google, TikTok, GTM) answered by small fakes that send the same request the real libraries send. It checks:

- each integration gets the right event, once (no duplicates from clicks, repeated leads, repeated page announcements)
- the state reported is honest: `sent` only when the request was seen, `unconfirmed` when a library loads but sends nothing, `blocked` when it does not load, `skipped` without consent / with Do Not Track
- the page keeps working with every vendor blocked, with a broken config, without the runtime
- consent bar, Do Not Track, test mode (`?vai_pxtest=1`, flagged batches, panel), owner visits and thumbnails fire nothing

```sh
docker run --rm -v /opt/funnelai/apps/web/public:/web/public:ro -v /opt/funnelai/tools/pixel-lab:/lab funnelai-scanner python /lab/pixel_e2e.py
```

The server side (config handed to the page, risky code kept away from signed-in people, ingestion, revenue counted once, goals) is in
`tools/analytics-lab/plans_pixels.ts` (run by `run_all.sh`). Note: `navigator.webdriver` robots are ignored by the runtime on purpose; the test opens the page with `?vai_test=1`.
