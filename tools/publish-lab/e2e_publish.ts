// Edit -> Publicar -> public address, end to end:
//   1. a project cloned by the scanner (a real one, copied) is edited the way the editor saves it
//   2. nothing is public until Publicar
//   3. Publicar freezes exactly that version at /s/<slug>: only the cloned page, no editor, no dashboard
//   4. editing again does NOT change the public site; publishing again does
//   5. a page deleted in the editor disappears from the public site after the next publish; "tirar do ar" answers 404
// The first half runs the real lib/publish.ts and lib/clone-document.ts against the database; the second half asks
// the running web server over HTTP (WEB=http://web:3000), the way a visitor would.
import { db } from '@funnelai/db'
import { publishProject, unpublishProject, hasUnpublishedChanges } from '@/lib/publish'
import { renderClonePage, cssHash } from '@/lib/clone-document'

const WEB = process.env.WEB || 'http://web:3000'
let failures = 0
const ok = (cond: any, what: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${!cond && extra ? '  -> ' + extra : ''}`); if (!cond) failures++ }
const text = async (res: Response) => ({ status: res.status, body: await res.text(), headers: res.headers })

// things that only exist in the editor / dashboard, never in a visitor's page
const EDITOR_MARKERS = ['gjs-', 'grapesjs', '__vaiEditor', 'ed-modal', 'ed-rail', '/_next/', 'dashboard', 'Clerk', 'clerk', '← Voltar']

async function main() {
  const srcId = process.env.SRC_PROJECT
  const workspace = await db.workspace.findFirst({ where: { id: 'lab_workspace_internal' } }) ?? (await db.workspace.findFirst())
  if (!workspace) throw new Error('no workspace to attach the test project to')

  // ── a real cloned project, copied ──
  const src = srcId
    ? await db.project.findUnique({ where: { id: srcId }, include: { pages: { orderBy: { order: 'asc' } } } })
    : await db.project.findFirst({ where: { name: { startsWith: 'TEST site_' }, status: 'READY', pages: { some: {} } }, include: { pages: { orderBy: { order: 'asc' } } }, orderBy: { createdAt: 'desc' } })
  if (!src || src.pages.length === 0) throw new Error('no cloned project to copy')
  const tag = Date.now().toString(36)
  const slug = `e2e-${tag}`
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: `E2E publish ${tag}`, sourceUrl: src.sourceUrl, status: 'READY' } })
  const pageIds: Record<string, string> = {}
  for (const p of src.pages.slice(0, 3)) {
    const row = await db.page.create({ data: { projectId: project.id, name: p.name, slug: p.slug, order: p.order, blocks: p.blocks as any, customCss: p.customCss, shell: (p.shell ?? undefined) as any } })
    pageIds[p.slug] = row.id
  }
  // a funnel has more than one page: make sure there are at least two, linked the way the scanner links them
  if (Object.keys(pageIds).length < 2) {
    const row = await db.page.create({ data: { projectId: project.id, name: 'Obrigado', slug: 'obrigado', order: 1, blocks: [{ id: 'ob', type: 'custom-html', order: 0, generatedHtml: '<section><h2>Obrigado pela compra</h2><p>Segunda página do funil.</p></section>' }] as any } })
    pageIds['obrigado'] = row.id
    const home = await db.page.findUnique({ where: { id: pageIds[Object.keys(pageIds)[0]] } })
    const blocks = JSON.parse(JSON.stringify(home!.blocks)) as any[]
    blocks.push({ id: 'lnk', type: 'custom-html', order: blocks.length, generatedHtml: `<div><a id="e2e-next" href="/projects/${project.id}/p/obrigado">Ir para o obrigado</a></div>` })
    await db.page.update({ where: { id: home!.id }, data: { blocks: blocks as any } })
  }
  const slugs = Object.keys(pageIds)
  const first = slugs[0]
  console.log(`project ${project.id} with ${slugs.length} page(s): ${slugs.join(', ')}  (copy of ${src.name})`)

  // the editor saves the whole blocks array: put a visible, unique marker into the first block that has a heading/paragraph
  const mark = (page: { blocks: any }, marker: string) => {
    const blocks = JSON.parse(JSON.stringify(page.blocks)) as any[]
    for (const b of blocks) {
      const h = String(b.generatedHtml || '')
      const m = h.match(/(<(h[1-6]|p|span|a|button)\b[^>]*>)([^<>]{3,})(<\/\2>)/i)
      if (m) { b.generatedHtml = h.replace(m[0], `${m[1]}${marker}${m[4]}`); return blocks }
    }
    blocks[0].generatedHtml = `<h1>${marker}</h1>` + (blocks[0].generatedHtml || '')
    return blocks
  }
  const editorSave = async (marker: string) => {
    const page = await db.page.findUnique({ where: { id: pageIds[first] } })
    await db.page.update({ where: { id: pageIds[first] }, data: { blocks: mark(page as any, marker) as any } })
  }

  try {
    // 1. edit (as the editor does) — nothing public yet
    const EDIT_1 = `Texto editado UM ${tag}`
    await editorSave(EDIT_1)
    let pub = await text(await renderClonePage({ by: 'published', projectSlug: slug }))
    ok(pub.status === 404, 'before Publicar the public address answers 404')
    const draft = await text(await renderClonePage({ by: 'id', projectId: project.id, pageSlug: first }))
    ok(draft.status === 200 && draft.body.includes(EDIT_1), 'the working copy (preview route) shows the edit')
    ok((draft.headers.get('x-robots-tag') || '').includes('noindex'), 'the working copy is kept out of search engines')

    // 2. Publicar
    const r = await publishProject(project.id, slug)
    ok(r.slug === slug && r.pages === slugs.length, `Publicar froze ${r.pages} page(s) at /s/${r.slug}`)
    pub = await text(await renderClonePage({ by: 'published', projectSlug: slug }))
    ok(pub.status === 200, 'the public address answers 200', String(pub.status))
    ok(pub.body.includes(EDIT_1), 'the visible edit made in the editor is on the public page')
    ok(!EDITOR_MARKERS.some(m => pub.body.includes(m)), 'no editor / dashboard markup on the public page', EDITOR_MARKERS.filter(m => pub.body.includes(m)).join(','))
    ok(!pub.body.includes(`/projects/${project.id}/p/`), 'internal links stay under the public address (no link to the working copy)')
    ok(/<meta name="viewport"/.test(pub.body) && /<link rel="stylesheet" href="\/projects\/[^"]+\/css\/[a-f0-9]{16}\.css">|<style id="vai-page-css">/.test(pub.body), 'viewport + stylesheet of the original are there')
    ok(!(pub.headers.get('x-robots-tag') || '').includes('noindex'), 'the public site may be indexed')
    ok(!(await hasUnpublishedChanges(project.id)), 'nothing pending right after publishing')
    if (slugs[1]) {
      const second = await text(await renderClonePage({ by: 'published', projectSlug: slug, pageSlug: slugs[1] }))
      ok(second.status === 200, `second page /s/${slug}/${slugs[1]} is public too`)
    }

    // 3. edit again: the public site must NOT move
    await new Promise(r => setTimeout(r, 30))
    const EDIT_2 = `Texto editado DOIS ${tag}`
    await editorSave(EDIT_2)
    ok(await hasUnpublishedChanges(project.id), 'the dashboard can tell there are unpublished changes')
    pub = await text(await renderClonePage({ by: 'published', projectSlug: slug }))
    ok(pub.body.includes(EDIT_1) && !pub.body.includes(EDIT_2), 'editing after publishing does not change the public site')
    const draft2 = await text(await renderClonePage({ by: 'id', projectId: project.id, pageSlug: first }))
    ok(draft2.body.includes(EDIT_2), 'the working copy has the new edit')
    const httpMid = await fetch(`${WEB}/s/${slug}`).then(text).catch(() => null)
    if (httpMid) ok(httpMid.status === 200 && httpMid.body.includes(EDIT_1) && !httpMid.body.includes(EDIT_2), 'HTTP: the live public site still shows the published version while the editor moved on', `status ${httpMid.status}`)
    const link = pub.body.match(/id="e2e-next"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*id="e2e-next"/)
    if (link) ok((link[1] || link[2]) === `/s/${slug}/obrigado`, 'the link between pages points at the public address', link[1] || link[2])

    // 4. Publicar again: the public site follows
    await publishProject(project.id)
    pub = await text(await renderClonePage({ by: 'published', projectSlug: slug }))
    ok(pub.body.includes(EDIT_2) && !pub.body.includes(EDIT_1), 'publishing again replaces the public version with the new one')

    // 5. the same address, over HTTP, as a visitor
    const http = await fetch(`${WEB}/s/${slug}`, { redirect: 'manual' }).then(text).catch((e: any) => ({ status: 0, body: String(e), headers: new Headers() }))
    ok(http.status === 200, `GET ${WEB}/s/${slug} -> 200`, String(http.status))
    if (http.status === 200) {
      ok(http.body.includes(EDIT_2), 'HTTP: the published page carries the latest edit')
      ok(!EDITOR_MARKERS.some(m => http.body.includes(m)), 'HTTP: no editor / dashboard markup', EDITOR_MARKERS.filter(m => http.body.includes(m)).join(','))
      const css = http.body.match(/href="(\/projects\/[^"]+\/css\/[a-f0-9]{16}\.css)"/)
      if (css) {
        const c = await fetch(`${WEB}${css[1]}`)
        ok(c.status === 200 && (c.headers.get('content-type') || '').includes('text/css'), 'HTTP: the original stylesheet is served', String(c.status))
      }
      const asPhone = await fetch(`${WEB}/s/${slug}`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' } }).then(text)
      ok(asPhone.status === 200, 'HTTP: a phone gets the page too')
      const viaSub = await fetch(`${WEB}/`, { headers: { "x-forwarded-host": `${slug}.be-vallid.com` } }).then(text).catch(() => null)
      ok(!!viaSub && viaSub.status === 200 && viaSub.body.includes(EDIT_2), `HTTP: ${slug}.be-vallid.com (subdomain) serves the same site`, String(viaSub?.status))
      if (viaSub && viaSub.status === 200) {
        ok(!viaSub.body.includes(`/s/${slug}/`) && !viaSub.body.includes(`/projects/${project.id}/p/`), 'HTTP: on its own subdomain the links are relative to the root of the site')
        const sub2 = slugs[1] ? await fetch(`${WEB}/${slugs[1]}`, { headers: { 'x-forwarded-host': `${slug}.be-vallid.com` } }).then(text).catch(() => null) : null
        if (sub2) ok(sub2.status === 200, `HTTP: ${slug}.be-vallid.com/${slugs[1]} (second page) answers`, String(sub2.status))
        const dash = await fetch(`${WEB}/api/projects`, { headers: { 'x-forwarded-host': `${slug}.be-vallid.com` } }).then(text).catch(() => null)
        ok(!!dash && dash.status === 404, 'HTTP: the dashboard API does not exist on a published site\'s subdomain', String(dash?.status))
      }
    }

    // 6. a page removed in the editor leaves the public site after the next publish
    if (slugs[1]) {
      await db.page.delete({ where: { id: pageIds[slugs[1]] } })
      let still = await text(await renderClonePage({ by: 'published', projectSlug: slug, pageSlug: slugs[1] }))
      ok(still.status === 200, 'a page deleted in the editor stays public until the next publish')
      await publishProject(project.id)
      still = await text(await renderClonePage({ by: 'published', projectSlug: slug, pageSlug: slugs[1] }))
      ok(still.status === 404, 'after publishing again the deleted page is gone from the public site')
    }

    // 7. tirar do ar
    await unpublishProject(project.id)
    pub = await text(await renderClonePage({ by: 'published', projectSlug: slug }))
    ok(pub.status === 404, 'Tirar do ar: the address answers 404 again')
    const stillThere = await db.page.count({ where: { projectId: project.id } })
    ok(stillThere >= 1, 'the editor pages are untouched by taking the site down')

    // 8. slug rules
    await publishProject(project.id, slug)
    const other = await db.project.create({ data: { workspaceId: workspace.id, name: `E2E other ${tag}`, sourceUrl: src.sourceUrl, status: 'READY' } })
    await db.page.create({ data: { projectId: other.id, name: 'x', slug: 'home', order: 0, blocks: [{ id: 'b', type: 'custom-html', order: 0, generatedHtml: '<p>x</p>' }] as any } })
    let clash = ''
    try { await publishProject(other.id, slug) } catch (e: any) { clash = e.message }
    ok(/em uso/.test(clash), 'two projects cannot publish at the same address', clash)
    await db.project.delete({ where: { id: other.id } })
  } finally {
    await db.project.delete({ where: { id: project.id } }).catch(() => {})
  }
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error('ERROR', e); process.exit(2) })
