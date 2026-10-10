import asyncio
from playwright.async_api import async_playwright
SRC = "https://cdn.converteai.net/67e85dbc-b2e3-40fc-902c-2a77fb0bd693/6a8fc28500ef7d01152634e7/main.m3u8"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await (await b.new_context()).new_page()
        pg.on('response', lambda r: print('  RESP', r.status, r.url[:150], r.headers.get('content-type')) if 'converteai' in r.url else None)
        pg.on('requestfailed', lambda r: print('  REQFAIL', r.url[:130], r.failure))
        await pg.goto("http://web:3000/vai-player.js")
        await pg.add_script_tag(url="https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js")
        res = await pg.evaluate("""async (src) => {
          const log = []; const v = document.createElement('video'); v.muted = true; v.playsInline = true; document.body.appendChild(v);
          const hls = new Hls({ debug: false });
          Object.values(Hls.Events).forEach(ev => hls.on(ev, (e, d) => { if (!/BUFFER_|FRAG_PARSING|LEVEL_PTS|FRAG_BUFFERED|FRAG_LOAD_EMERGENCY|STREAM_STATE|INIT_PTS|CUES|SUBTITLE|AUDIO_TRACK|MANIFEST_LOADING|KEY_LOADING|FRAG_DECRYPTED|FPS_DROP|DESTROYING|MEDIA_DETACH/.test(ev)) log.push(ev.replace('hls','') + (d && d.details ? ' ' + d.details : '') + (d && d.type ? ' ' + d.type : '') + (d && d.fatal ? ' FATAL' : '')); }));
          hls.loadSource(src); hls.attachMedia(v);
          v.play().catch(e => log.push('play() rejected: ' + e.message));
          await new Promise(r => setTimeout(r, 9000));
          return { log: log.slice(0, 30), rs: v.readyState, t: v.currentTime, dur: v.duration, err: v.error && v.error.message };
        }""", SRC)
        print(res)
        await b.close()
asyncio.run(main())
