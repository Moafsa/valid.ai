// Plans (limits, subscription state, enforcement) and pixels (config, privacy of risky code, ingestion without duplicates, goals, rendering)
// against the real database, with temporary accounts that are removed at the end.
import { db } from '@funnelai/db'
import { PublishError, publishProject } from '@/lib/publish'
import { DEFAULT_PLANS, entitlementsOf, featureGate, gate, listPlans, planCardLines, publicPlans, stateOf, clearPlanCache, usageOf } from '@/lib/plans'
import { assignPlan } from '@/lib/plans-admin'
import { detectProject, ingestPixels, pixelConfigFor, pixelOverview, runtimeForViewer, savePixelSettings, forgetPixels } from '@/lib/pixels-server'
import { readPixelSettings, vendorName, defaultMap } from '@/lib/pixels'
import { renderClonePage } from '@/lib/clone-document'

let failures = 0
const ok = (c: any, what: string, extra: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${!c && extra !== '' ? '   -> ' + JSON.stringify(extra).slice(0, 300) : ''}`); if (!c) failures++ }
const stamp = Date.now()
const made: string[] = []
async function account(planKey: string, extra: Record<string, unknown> = {}) {
  const w = await db.workspace.create({ data: { clerkOrgId: `test_plans_${stamp}_${made.length}`, name: `TEST plans ${made.length}`, slug: `test-plans-${stamp}-${made.length}`, planKey, subscriptionStatus: planKey === 'FREE' ? 'none' : 'active', ...extra } as any })
  made.push(w.id)
  return w
}
async function project(workspaceId: string, name: string, status: 'PUBLISHED' | 'READY', blocks: any[] = [], slug?: string) {
  const p = await db.project.create({ data: { workspaceId, name, sourceUrl: 'https://exemplo.com/x', status, slug: slug ?? (status === 'PUBLISHED' ? `test-px-${stamp}-${Math.random().toString(36).slice(2, 7)}` : null) } })
  await db.page.create({ data: { projectId: p.id, name: 'Home', slug: 'home', order: 0, blocks: blocks as any } })
  if (status === 'PUBLISHED') await db.publishedPage.create({ data: { projectId: p.id, pageSlug: 'home', name: 'Home', order: 0, blocks: blocks as any } })
  return p
}

async function main() {
  try {
    // ───────── the plans themselves ─────────
    clearPlanCache()
    const plans = await listPlans()
    const by = Object.fromEntries(plans.map(p => [p.key, p]))
    ok(['FREE', 'BASIC', 'PRO', 'SCALE', 'UNLIMITED'].every(k => by[k]), 'the built-in plans exist', Object.keys(by))
    ok(by.BASIC.priceCents === 9700 && by.PRO.priceCents === 24700 && by.SCALE.priceCents === 59700, 'prices: 97, 247 and 597')
    ok(by.BASIC.limits.pages === 2 && by.PRO.limits.pages === 8 && by.SCALE.limits.pages === 20, 'active pages: 2, 8 and 20', [by.BASIC.limits.pages, by.PRO.limits.pages, by.SCALE.limits.pages])
    ok(by.PRO.highlight && !by.BASIC.highlight && !by.SCALE.highlight, 'Pro is the recommended one')
    ok(Object.values(by.UNLIMITED.limits).every(v => v === null) && Object.values(by.UNLIMITED.features).every(Boolean) && !by.UNLIMITED.visible, 'the hidden plan is unlimited with everything on and is not public')
    const pub = await publicPlans()
    ok(pub.map(p => p.key).join() === 'BASIC,PRO,SCALE', 'the pricing page shows Basic, Pro and Scale in price order', pub.map(p => p.key))
    const lines = planCardLines(by.BASIC)
    for (const t of ['Até 2 páginas ativas', 'Suporte prioritário', 'Identificação de cloaker', 'Componentes interativos', 'Pixel e scripts de rastreamento']) ok(lines.includes(t), `Basic card says "${t}"`, lines)
    ok(!lines.some(l => /ilimitad/i.test(l)), 'the card promises nothing unlimited')

    // ───────── subscription state ─────────
    const day = 86400_000
    const acct = (status: string, until: number | null) => ({ planKey: 'BASIC', subscriptionStatus: status, planUntil: until === null ? null : new Date(Date.now() + until * day) })
    ok(stateOf(by.BASIC, acct('active', null)).state === 'ok', 'paid without a due date (courtesy): ok')
    ok(stateOf(by.BASIC, acct('active', 5)).state === 'ok', 'paid, due in 5 days: ok')
    ok(stateOf(by.BASIC, acct('active', -1)).state === 'grace', 'due yesterday: grace')
    ok(stateOf(by.BASIC, acct('active', -5)).state === 'lapsed', 'due 5 days ago: lapsed')
    ok(stateOf(by.BASIC, acct('past_due', -1)).state === 'grace' && stateOf(by.BASIC, acct('past_due', -9)).state === 'lapsed', 'past due: grace then lapsed')
    ok(stateOf(by.BASIC, acct('canceled', 3)).state === 'ok' && stateOf(by.BASIC, acct('canceled', -1)).state === 'lapsed', 'canceled: valid until the paid date')
    ok(stateOf(by.BASIC, acct('none', null)).state === 'lapsed', 'a paid plan with no payment confirmed counts as the free plan')
    ok(stateOf(by.UNLIMITED, { planKey: 'UNLIMITED', subscriptionStatus: 'none', planUntil: null }).state === 'ok', 'the unlimited plan never lapses')
    const lapsed = await entitlementsOf(acct('active', -10))
    ok(lapsed.effective.key === 'FREE' && lapsed.limits.pages === by.FREE.limits.pages && !lapsed.features.cloaker && !!lapsed.message, 'a lapsed account gets the free plan limits and a message', lapsed.state)

    // ───────── limits ─────────
    const basic = await account('BASIC')
    await project(basic.id, 'A', 'PUBLISHED'); await project(basic.id, 'B', 'PUBLISHED')
    const g2 = await gate(basic, 'pages')
    ok(!g2.ok && /2 páginas ativas/.test((g2 as any).message), 'Basic with 2 live pages cannot publish a third', g2)
    const third = await project(basic.id, 'C', 'READY')
    let blocked: any = null
    try { await publishProject(third.id, `test-px-${stamp}-third`) } catch (e) { blocked = e }
    ok(blocked instanceof PublishError && blocked.status === 403, 'publishProject refuses the third page with a clear message', blocked?.message)
    const live = await db.project.findFirst({ where: { workspaceId: basic.id, status: 'PUBLISHED' } })
    let again = true
    try { await publishProject(live!.id) } catch { again = false }
    ok(again, 'republishing a page that is already live is always allowed')
    await assignPlan(basic.id, { planKey: 'PRO' })
    const afterPro = await db.workspace.findUnique({ where: { id: basic.id } })
    ok((await gate(afterPro!, 'pages')).ok, 'moving the account to Pro frees the room at once (limit 8)')
    await assignPlan(basic.id, { planKey: 'UNLIMITED' })
    const unl = await db.workspace.findUnique({ where: { id: basic.id } })
    ok(unl!.planKey === 'UNLIMITED' && (await gate(unl!, 'pages', 9999)).ok && (await gate(unl!, 'clones', 9999)).ok && (await gate(unl!, 'aiCalls', 9999)).ok && (await featureGate(unl!, 'cloaker')).ok, 'the hidden unlimited plan lets everything through')
    const free = await account('FREE')
    ok(!(await featureGate(free, 'cloaker')).ok && !(await featureGate(free, 'pixels')).ok, 'the free plan has no cloaker detector and no pixels')
    ok((await featureGate(basic, 'cloaker')).ok === true, 'Basic has the cloaker detector (it is unlimited now, so also true)')
    for (let i = 0; i < (by.FREE.limits.clones ?? 3); i++) await project(free.id, `F${i}`, 'READY')
    const cl = await gate(free, 'clones')
    ok(!cl.ok && /clonagens por mês/.test((cl as any).message), 'the free plan stops at its monthly clones', cl)
    const usage = await usageOf(free.id, { storage: false })
    ok(usage.clones === (by.FREE.limits.clones ?? 3) && usage.pages === 0, 'usage is counted per account', usage)
    // AI usage
    await db.aiUsageLog.createMany({ data: Array.from({ length: 20 }, () => ({ workspaceId: free.id, operation: 'editor_ai', model: 'x', provider: 'x' })) })
    const ai = await gate(free, 'aiCalls')
    ok(!ai.ok, 'the monthly AI uses are counted and stop at the limit', ai)
    await db.aiUsageLog.create({ data: { workspaceId: free.id, operation: 'cloaker', model: 'probe', provider: 'internal' } })
    ok((await usageOf(free.id, { storage: false })).aiCalls === 20, 'the cloaker rate-limit rows are not "AI uses"')

    // ───────── pixels: what a page is handed ─────────
    const pxA = await account('PRO')
    const html = '<div><form action="/x"><input type="email" name="email"><button type="submit">Enviar</button></form><a href="https://pay.hotmart.com/X?off=1" class="btn">Comprar</a><video src="a.mp4"></video><button class="cta">Quero</button></div>'
    const proj = await project(pxA.id, 'Pixel', 'PUBLISHED', [{ id: 'b1', order: 0, generatedHtml: html }])
    await db.page.create({ data: { projectId: proj.id, name: 'Obrigado pela compra', slug: 'obrigado', order: 1, blocks: [] as any } })
    await db.projectTracking.createMany({ data: [
      { projectId: proj.id, type: 'META_PIXEL', pixelId: '123456789012345', config: {} as any },
      { projectId: proj.id, type: 'GOOGLE_ANALYTICS', pixelId: 'not-a-ga-id', config: {} as any },
      { projectId: proj.id, type: 'TIKTOK_PIXEL', pixelId: 'C1ABCDE2FGHI3JKL4MNO', config: {} as any, isActive: false },
      { projectId: proj.id, type: 'GTM', pixelId: 'GTM-ABCD123', config: {} as any },
      { projectId: proj.id, type: 'CUSTOM', pixelId: null, config: { label: 'Kwai', code: '<script>window.k=1</script></script><b>' } as any },
    ] })
    forgetPixels(proj.id)
    const cfg = await pixelConfigFor(proj.id)
    ok(cfg && cfg.integrations.map(i => i.type).sort().join() === 'CUSTOM,GTM,META_PIXEL', 'only active integrations with a valid id are handed over', cfg?.integrations.map(i => i.type))
    ok(cfg && cfg.events.some(e => e.id === 'pageview') && !cfg.events.some(e => e.id === 'purchase'), 'only the events that are on go to the page (purchase is off until a page is chosen)', cfg?.events.map(e => e.id))
    ok(JSON.stringify(runtimeForViewer(cfg, null)?.integrations.map(i => i.type).sort()) === JSON.stringify(['CUSTOM', 'GTM', 'META_PIXEL']), 'a stranger gets all of them')
    ok(JSON.stringify(runtimeForViewer(cfg, 'vai_admin=abc')?.integrations.map(i => i.type)) === JSON.stringify(['META_PIXEL']), 'the administrator never gets code the customer controls (GTM, custom)')
    ok(JSON.stringify(runtimeForViewer(cfg, 'x=1; __client_uat=1760000000; __session=eyJ')?.integrations.map(i => i.type)) === JSON.stringify(['META_PIXEL']), 'nor does a signed-in customer')
    ok(runtimeForViewer(cfg, '__client_uat=0')?.integrations.length === 3, 'a signed-out cookie (client_uat=0) is a stranger')

    // the document that is served
    const res = await renderClonePage({ by: 'published', projectSlug: proj.slug! }, { ua: 'Mozilla/5.0 Chrome', cookie: null, headers: new Headers({ host: 'be-vallid.com' }), method: 'GET', href: `https://be-vallid.com/s/${proj.slug}` })
    const doc = await res.text()
    ok(doc.includes('window.__VAI_PX=') && doc.includes('/vai-e.js') && doc.indexOf('/vai-runtime.js') < doc.indexOf('/vai-e.js'), 'the published page carries the pixel config and loads vai-e.js after the runtime')
    ok(!/<\/script><b>/.test(doc.split('window.__VAI_PX=')[1].split('</script>')[0]), 'a custom script containing </script> cannot break out of the config')
    const adminRes = await renderClonePage({ by: 'published', projectSlug: proj.slug! }, { ua: 'Mozilla/5.0 Chrome', cookie: 'vai_admin=1', headers: new Headers({ host: 'be-vallid.com' }), method: 'GET', href: `https://be-vallid.com/s/${proj.slug}` })
    const adminDoc = await adminRes.text()
    ok(adminDoc.includes('META_PIXEL') && !adminDoc.includes('GTM-ABCD123') && !adminDoc.includes('window.k=1'), 'the page served to the administrator has no GTM and no custom script')
    const prevRes = await renderClonePage({ by: 'published', projectSlug: proj.slug! }, { ua: 'Mozilla/5.0 Chrome', preview: true, headers: new Headers(), method: 'GET', href: `https://be-vallid.com/s/${proj.slug}?vai_preview=1` })
    ok(!(await prevRes.text()).includes('__VAI_PX'), 'a thumbnail gets no pixels')
    await assignPlan(pxA.id, { planKey: 'PRO', status: 'past_due', until: new Date(Date.now() - 10 * day) })
    forgetPixels(proj.id)
    ok((await pixelConfigFor(proj.id)) === null, 'a lapsed subscription turns the pixels off (the page keeps working)')
    await assignPlan(pxA.id, { planKey: 'PRO' })
    forgetPixels(proj.id)
    ok((await pixelConfigFor(proj.id)) !== null, 'and back on when it is paid again')

    // ───────── pixels: what pages report ─────────
    const ids = Object.fromEntries((await db.projectTracking.findMany({ where: { projectId: proj.id } })).map(t => [t.type, t.id]))
    const batch = (e: any[], test = false) => ({ px: 1 as const, p: proj.id, s: 'sid_test_1', test, e })
    await ingestPixels(batch([
      { i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'PageView', k: 'pageview', s: 'home', st: 'fired', dd: 'pv|home' },
      { i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'Lead', k: 'lead', s: 'home', st: 'sent', dd: 'lead|home' },
      { i: 'META_PIXEL', tid: 'nope', n: 'Lead', k: 'lead', st: 'sent', dd: 'x' },
      { i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'Hack', k: 'not_an_event', st: 'sent', dd: 'y' },
      { i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'Bad', k: 'lead', st: 'whatever', dd: 'z' },
    ]), '1.2.3.4')
    await ingestPixels(batch([{ i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'PageView', k: 'pageview', s: 'home', st: 'sent', dd: 'pv|home' }, { i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'Lead', k: 'lead', s: 'home', st: 'sent', dd: 'lead|home' }]), '1.2.3.4')
    await ingestPixels(batch([{ i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'PageView', k: 'pageview', s: 'home', st: 'blocked', dd: 'pv|home' }]), '1.2.3.4')
    const rows = await db.pixelEvent.findMany({ where: { projectId: proj.id } })
    ok(rows.length === 2, 'unknown integrations, unknown events and bad states are ignored; repeats do not add rows', rows.map(r => [r.key, r.state]))
    ok(rows.find(r => r.key === 'pageview')?.state === 'sent', 'a better state replaces a worse one (fired -> sent) and a worse one never replaces it (blocked ignored)')
    // revenue is counted once even when two pixels told about the same purchase
    await db.projectTracking.update({ where: { id: ids.GTM }, data: { isActive: true } })
    await savePixelSettings(proj.id, { consent: { required: false, respectDnt: true, text: 'x' }, currency: 'BRL', events: [{ id: 'purchase', kind: 'purchase', name: 'Compra', on: true, trigger: { type: 'page', match: 'obrigado' }, value: 97, goal: true }] })
    await ingestPixels(batch([
      { i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'Purchase', k: 'purchase', s: 'obrigado', v: 97, c: 'BRL', st: 'sent', dd: 'purchase|obrigado' },
      { i: 'GTM', tid: ids.GTM, n: 'vai_purchase', k: 'purchase', s: 'obrigado', v: 97, c: 'BRL', st: 'sent', dd: 'purchase|obrigado' },
    ]), '1.2.3.5')
    await ingestPixels(batch([{ i: 'META_PIXEL', tid: ids.META_PIXEL, n: 'Purchase', k: 'purchase', s: 'obrigado', v: 97, c: 'BRL', st: 'sent', dd: 'purchase|obrigado' }], true), '1.2.3.6')
    const ov = await pixelOverview(proj.id, 30)
    ok(ov.revenue.total === 97 && ov.revenue.purchases === 1, 'revenue counts a purchase once across pixels and ignores test runs', ov.revenue)
    ok(!ov.recent.some(r => r.test && ov.stats.some(s => s.key === 'purchase' && s.count > 2)), 'test events stay out of the numbers')
    // goals follow the event
    const after = await db.project.findUnique({ where: { id: proj.id }, select: { analyticsSettings: true } })
    const goals = ((after?.analyticsSettings as any)?.goals || []) as any[]
    ok(goals.some(g => g.id === 'px_purchase' && g.type === 'page' && g.value === 'obrigado' && g.conversion), 'a purchase event counted as conversion becomes a goal of the project (Métricas, funnel)', goals)
    await savePixelSettings(proj.id, { consent: { required: false, respectDnt: true, text: 'x' }, currency: 'BRL', events: [{ id: 'purchase', kind: 'purchase', name: 'Compra', on: false, trigger: { type: 'page', match: 'obrigado' }, goal: true }] })
    const off = await db.project.findUnique({ where: { id: proj.id }, select: { analyticsSettings: true } })
    ok(!(((off?.analyticsSettings as any)?.goals || []) as any[]).some(g => g.id === 'px_purchase'), 'switching the event off removes its goal')

    // ───────── what the pages contain ─────────
    const det = await detectProject(proj.id)
    ok(det.forms >= 1 && det.checkoutLinks === 1 && det.checkoutHosts.includes('pay.hotmart.com') && det.videos >= 1 && det.ctas >= 2 && det.thanks.some(t => t.slug === 'obrigado'), 'the tab finds the form, the checkout link, the video, the buttons and the thank-you step', det)

    // ───────── settings and names ─────────
    const s = readPixelSettings({ events: [{ id: 'c_abc123', kind: 'custom', name: 'X', on: true, trigger: { type: 'click', match: 'Quero' }, goal: true }, { id: 'bad id', kind: 'custom', name: 'Y' }] })
    ok(s.events.length === 7 && s.events.some(e => e.id === 'c_abc123') && !s.events.some(e => e.id === 'bad id'), 'settings keep the built-in events and only well-formed custom ones', s.events.map(e => e.id))
    ok(vendorName('META_PIXEL', { id: 'lead', kind: 'lead', name: 'Lead' }) === 'Lead' && vendorName('GOOGLE_ANALYTICS', { id: 'lead', kind: 'lead', name: 'Lead' }) === 'generate_lead' && vendorName('TIKTOK_PIXEL', { id: 'checkout', kind: 'checkout', name: 'c' }) === 'InitiateCheckout', 'each platform gets its own name for the same event')
    ok(defaultMap('GOOGLE_TAG', s.events).pageview.on === false && defaultMap('GOOGLE_TAG', s.events).lead.on === true, 'Google Ads starts with the conversion events only')
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: made } } })
    await db.aiUsageLog.deleteMany({ where: { workspaceId: { in: made } } })
  }
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures ? 1 : 0)
}
main().catch(async e => { console.error(e); await db.workspace.deleteMany({ where: { id: { in: made } } }).catch(() => {}); process.exit(1) })
