import asyncio, sys, json
from playwright.async_api import async_playwright
url = sys.argv[1]
JS_INSTALL = """
() => {
  window.__frames = []; window.__t0 = performance.now(); window.__seen = new WeakMap(); let idc = 0;
  const sample = () => {
    const t = performance.now() - window.__t0;
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      let rec = window.__seen.get(el);
      if (!rec) { rec = { id: ++idc, tag: el.tagName, cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 50), first: t, series: [] }; window.__seen.set(el, rec); window.__list = (window.__list||[]); window.__list.push(rec); }
      const last = rec.series[rec.series.length - 1];
      const cur = cs.opacity + '|' + cs.transform;
      if (!last || last[1] !== cur) rec.series.push([Math.round(t), cur]);
    });
    if (t < 2500) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width":390,"height":844})).new_page()
        await pg.goto(url, wait_until="networkidle"); await pg.wait_for_timeout(2500)
        btns = await pg.query_selector_all("[data-vai-next]")
        print('buttons:', [ (await x.inner_text()).strip()[:25] for x in btns][:6])
        await pg.evaluate(JS_INSTALL)
        await btns[0].click()
        await pg.wait_for_timeout(3000)
        res = await pg.evaluate("""() => (window.__list||[]).filter(r => r.series.length > 1 && r.first > 30).map(r => ({tag: r.tag, cls: r.cls, first: Math.round(r.first), n: r.series.length, from: r.series[0][1].slice(0,60), to: r.series[r.series.length-1][1].slice(0,60), dur: r.series[r.series.length-1][0] - r.series[0][0]}))""")
        print('elements with animated opacity/transform after click:', len(res))
        for r in res[:14]: print('  ', r)
        await b.close()
asyncio.run(main())
