import asyncio, sys, re, os, json, urllib.request
from playwright.async_api import async_playwright
orig_url, pid, tag = sys.argv[1], sys.argv[2], sys.argv[3]
only = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
TIMES = [150, 600, 1500, 3200]
def clone_html(slug):
    return urllib.request.urlopen(f"http://web:3000/projects/{pid}/p/{slug}").read().decode()
def control_texts(html):
    """text of the first answer/button that moves on, and of the continue button (if answers only select)."""
    def txt(frag): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', frag)).strip()
    sel = re.search(r'<(\w+)[^>]*data-vai-select[^>]*>(.*?)</\1>', html, re.S)
    nxt = re.search(r'<(\w+)[^>]*data-vai-next="[^"]+"[^>]*>(.*?)</\1>', html, re.S)
    href = re.search(r'<(\w+)[^>]*data-vai-href="[^"]+"[^>]*>(.*?)</\1>', html, re.S)
    return (txt(sel.group(2)) if sel else None, txt(nxt.group(2)) if nxt else (txt(href.group(2)) if href else None))
async def main():
    os.makedirs('/tmp/shots/twin', exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        octx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True)
        cctx = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True)
        async def route(r, req):
            if req.resource_type == 'document' and req.frame.parent_frame is None and 'web:3000' not in req.url and orig_url.split('/')[2] not in req.url:
                await r.abort(); return
            if req.method != 'GET' and req.resource_type in ('xhr','fetch'):
                await r.fulfill(status=200, content_type='application/json', body='{}'); return
            await r.continue_()
        await octx.route('**/*', route)
        op = await octx.new_page(); cp = await cctx.new_page()
        await op.goto(orig_url, wait_until='load')
        k = 0
        while True:
            slug = 'home' if k == 0 else f'etapa-{k+1}'
            try: html = clone_html(slug)
            except Exception: print('no more clone pages at', slug); break
            sel_text, next_text = control_texts(html)
            # --- frames
            if only is None or k in only:
                t_arrive = None
                await cp.goto(f"http://web:3000/projects/{pid}/p/{slug}", wait_until='commit')
                import time; t0 = time.time()
                for ms in TIMES:
                    await asyncio.sleep(max(0, ms/1000 - (time.time()-t0)))
                    await cp.screenshot(path=f'/tmp/shots/twin/{tag}_{k}_clone_{ms}.png')
            # original: frames are taken relative to the click that brought us here (k>0), or load (k=0)
            # (already advanced below in the previous loop iteration)
            if next_text is None and sel_text is None:
                print(f'step {k}: end (no control)'); break
            # --- advance the original
            async def click_text(t):
                core = re.sub(r'[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F]', '', t).strip()[:28] or t
                loc = op.locator('button:visible, a:visible, [role=button]:visible').filter(has_text=re.compile(re.escape(core), re.I))
                n = await loc.count()
                for i in range(n):
                    el = loc.nth(i)
                    try:
                        if await el.is_enabled():
                            await el.click(timeout=3000); return True
                    except Exception: pass
                return False
            import time
            if sel_text:
                if not await click_text(sel_text): print('orig: could not click', sel_text[:30]); break
                await op.wait_for_timeout(500)
            if next_text:
                try:
                    await op.locator('button:visible, a:visible, [role=button]:visible').filter(has_text=re.compile(re.escape(re.sub(r'[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F]', '', next_text).strip()[:28] or next_text), re.I)).first.wait_for(state='visible', timeout=45000)
                except Exception: print('orig: control never showed', next_text[:30]); break
                t0 = time.time()
                if not await click_text(next_text): print('orig: could not click', next_text[:30]); break
                if only is None or (k+1) in only:
                    for ms in TIMES:
                        await asyncio.sleep(max(0, ms/1000 - (time.time()-t0)))
                        await op.screenshot(path=f'/tmp/shots/twin/{tag}_{k+1}_orig_{ms}.png')
                else:
                    await op.wait_for_timeout(1200)
            k += 1
            if k > 40: break
            if re.match(r'^\w+://', next_text or '') : break
        print('steps compared:', k)
        await b.close()
asyncio.run(main())
