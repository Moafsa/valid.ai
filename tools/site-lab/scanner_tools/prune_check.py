import asyncio, sys, json, re
from playwright.async_api import async_playwright
pid = sys.argv[1]
slugs = sys.argv[2].split(',')
pruned_css = open(sys.argv[3]).read()
widths = [390, 1280]
PROPS = ['display','position','width','height','color','backgroundColor','backgroundImage','fontSize','fontWeight','fontFamily','lineHeight','marginTop','marginBottom','marginLeft','marginRight','paddingTop','paddingBottom','paddingLeft','paddingRight','borderTopWidth','borderRadius','opacity','visibility','transform','flexDirection','justifyContent','alignItems','gap','textAlign','overflow','zIndex','boxShadow','cursor']
JS = """(props) => {
  const out = [];
  const els = [...document.querySelectorAll('body *')].slice(0, 1500);
  for (const el of els) {
    const cs = getComputedStyle(el);
    out.push(props.map(p => cs[p]).join('|'));
  }
  return out;
}"""
async def snap(b, url, w, css_override):
    ctx = await b.new_context(viewport={"width": w, "height": 900 if w > 600 else 844})
    pg = await ctx.new_page()
    if css_override is not None:
        async def route(r, req):
            if '/css/' in req.url and req.url.endswith('.css'):
                await r.fulfill(status=200, content_type='text/css', body=css_override)
            else:
                await r.continue_()
        await ctx.route('**/*', route)
    await pg.goto(url, wait_until='load')
    await pg.wait_for_timeout(2500)
    res = await pg.evaluate(JS, PROPS)
    await ctx.close()
    return res
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        tot_diff = 0; tot = 0
        for slug in slugs:
            for w in widths:
                url = f"http://web:3000/projects/{pid}/p/{slug}"
                a = await snap(b, url, w, None)
                c = await snap(b, url, w, pruned_css)
                n = min(len(a), len(c))
                diffs = [i for i in range(n) if a[i] != c[i]]
                tot += n; tot_diff += len(diffs) + abs(len(a) - len(c))
                flag = 'OK ' if not diffs and len(a) == len(c) else 'DIFF'
                print(f"{flag} {slug:10} w={w:5} elements={len(a)}/{len(c)} diffs={len(diffs)}", flush=True)
                for i in diffs[:2]:
                    ap, cp = a[i].split('|'), c[i].split('|')
                    print('      el#%d' % i, {PROPS[k]: (ap[k][:30], cp[k][:30]) for k in range(len(PROPS)) if ap[k] != cp[k]})
        print('TOTAL elements', tot, 'diffs', tot_diff)
        await b.close()
asyncio.run(main())
