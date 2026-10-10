import asyncio, json, sys
from playwright.async_api import async_playwright
import sys
ALL = json.load(open('/tmp/steps_data.json'))
data = ALL[sys.argv[3]]

PAGE = """<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://unpkg.com/grapesjs@0.23.6/dist/css/grapes.min.css"></head>
<body style="margin:0"><div id="gjs" style="height:900px"></div></body></html>"""

JS = r"""
async ([data, deviceWidth, extraCfg]) => {
  const shell = data.shell, blocks = data.blocks, pageCss = data.css;
  // ---- verbatim from visual-editor.tsx (types stripped) ----
  const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const SAFE_TAG = /^[a-z][a-z0-9-]*$/, SAFE_ATTR = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
  const attrString = attrs => Object.entries(attrs ?? {}).filter(([n]) => SAFE_ATTR.test(n) && !/^on/i.test(n)).map(([n, v]) => ` ${n}="${escAttr(String(v))}"`).join('');
  function stampBlockId(html, id) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const root = Array.from(tpl.content.children).find(el => !['STYLE','LINK','SCRIPT'].includes(el.tagName));
    if (root && !root.hasAttribute('data-vai-block-id')) root.setAttribute('data-vai-block-id', id);
    return tpl.innerHTML;
  }
  const editor = grapesjs.init({ container: '#gjs', height: '900px', fromElement: false, storageManager: false, panels: { defaults: [] },
    protectedCss: '', canvas: {}, selectorManager: { componentFirst: true }, ...extraCfg,
    deviceManager: { devices: [ { name: 'Desktop', width: '1440px' }, { name: 'Mobile', width: '375px', widthMedia: '575px' } ] } });
  editor.on('load', () => {
    const doc = editor.Canvas.getDocument();
    Object.entries(shell.html ?? {}).forEach(([k, v]) => { try { doc.documentElement.setAttribute(k, v) } catch {} });
    Object.entries(shell.body ?? {}).forEach(([k, v]) => { try { doc.body.setAttribute(k, v) } catch {} });
    (shell.fontLinks ?? []).forEach(href => { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l); });
    const st = doc.createElement('style'); st.textContent = (pageCss || ''); doc.head.appendChild(st);
  });
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const wrappers = (shell.wrappers ?? []).filter(w => SAFE_TAG.test(w.tag));
  const open = wrappers.map(w => `<${w.tag}${attrString(w.attrs)}>`).join('');
  const close = [...wrappers].reverse().map(w => `</${w.tag}>`).join('');
  const inner = sorted.map(b => (b.generatedHtml ? stampBlockId(b.generatedHtml, b.id) : '')).join('');
  editor.setComponents(open + inner + close);
  editor.on('load', () => {});
  await new Promise(r => setTimeout(r, 2500));
  { const avail = document.getElementById('gjs').clientWidth - 0; editor.Canvas.setZoom(Math.min(100, Math.floor(((avail - 0) / 1440) * 100))); await new Promise(r => setTimeout(r, 800)); }
  if (deviceWidth) { editor.setDevice('Mobile'); await new Promise(r => setTimeout(r, 1500)); }

  // ---- save (verbatim logic) ----
  let container = editor.getWrapper();
  for (let depth = 0; shell && depth < wrappers.length; depth++) { const first = container.components().at(0); if (!first) break; container = first; }
  const topLevel = container.components();
  const out = [];
  topLevel.forEach((comp, index) => {
    const attrs = comp.getAttributes();
    let scopedCss = (editor.getCss({ component: comp }) || '').trim();
    out.push({ id: attrs['data-vai-block-id'], cssLen: scopedCss.length, htmlLen: comp.toHTML().length });
  });
  // text fidelity: block textContent before vs after GrapesJS (whitespace included)
  const norm = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content.textContent; };
  let textDiff = 0, firstDiff = null;
  topLevel.forEach((comp, i) => {
    const before = norm(sorted[i] ? sorted[i].generatedHtml : '');
    const after = norm(comp.toHTML());
    if (before.replace(/\s+/g,' ').trim() !== after.replace(/\s+/g,' ').trim() || before.length !== after.length) { textDiff++; if (!firstDiff) firstDiff = { i, b: before.length, a: after.length }; }
  });
  const ATTRS = ['data-vai-select','data-vai-sel=','data-vai-n=','data-vai-next','data-vai-delay','data-vai-toggle-btn','data-vai-toggle-panel','data-vai-open-display'];
  const attrReport = {};
  const joinedBefore = sorted.map(b => b.generatedHtml).join('');
  let joinedAfter = ''; topLevel.forEach(c => { joinedAfter += c.toHTML(); });
  ATTRS.forEach(a => { attrReport[a] = [joinedBefore.split(a).length - 1, joinedAfter.split(a).length - 1]; });
  const styleAttrBefore = sorted.reduce((a, b) => a + ((b.generatedHtml || '').match(/ style="/g) || []).length, 0);
  let styleAttrAfter = 0; topLevel.forEach(c => { styleAttrAfter += (c.toHTML().match(/ style="/g) || []).length; });
  const frameDoc = editor.Canvas.getDocument();
  const heroImgs = [...frameDoc.images].slice(1, 6).map(i => { const r = i.getBoundingClientRect(); const cs = frameDoc.defaultView.getComputedStyle(i); return [Math.round(r.width), Math.round(r.height), cs.opacity, cs.visibility, i.complete && i.naturalWidth > 0]; });
  const frame = { sw: frameDoc.documentElement.scrollWidth, sh: frameDoc.documentElement.scrollHeight, imgs: frameDoc.images.length,
                  htmlClass: frameDoc.documentElement.className.slice(0, 60), headings: frameDoc.querySelectorAll('h1,h2,h3').length };
  return { attrReport, textDiff, firstDiff, styleAttrBefore, styleAttrAfter, heroImgs, blocksIn: sorted.length, blocksOut: out.length, ids: out.slice(0,3), frame, totalOutHtml: out.reduce((a, b) => a + b.htmlLen, 0), totalCss: out.reduce((a, b) => a + b.cssLen, 0) };
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for vw, label in [(None, 'desktop')]:
            pg = await b.new_page(viewport={"width": 1440, "height": 900})
            await pg.goto("file:///tmp/editor_rt.html")
            await pg.add_script_tag(url="https://unpkg.com/grapesjs@0.23.6/dist/grapes.min.js")
            res = await pg.evaluate(JS, [data, vw, json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}])
            print(label, json.dumps(res))
            if label == 'desktop':
                await pg.screenshot(path="/tmp/shots/editor_rt_%s.png" % (sys.argv[2] if len(sys.argv) > 2 else "base"))
            await pg.close()
        await b.close()
asyncio.run(main())
