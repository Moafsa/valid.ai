// Compares what the analytics queries say with what the simulated visitors really did (truth.json from traffic.py).
//   ./run.sh verify.ts /an/out/truth.json   (the file is read from the lab's own folder)
import { readFileSync } from 'node:fs'
import { db } from '@funnelai/db'
import { parseFilters } from '@/lib/analytics/filters'
import { breakdown, pagesTable, sessionsList, totals } from '@/lib/analytics/queries'
import { abandonment, clickMap, frictions, scrollMap } from '@/lib/analytics/behaviour'
import { retention, retentionBy, videoList } from '@/lib/analytics/video'
import { journey } from '@/lib/analytics/funnel'
import { buildSnapshot } from '@/lib/analytics/snapshot'
import { buildInsights } from '@/lib/analytics/insights'
import { audience } from '@/lib/analytics/audience'

let failures = 0
const ok = (cond: any, what: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${!cond && extra ? '   -> ' + extra : ''}`); if (!cond) failures++ }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

async function main() {
  const truth = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const projectId: string = truth.state.projectId
  const V: any[] = truth.visitors.filter((v: any) => v.ok)
  const f = { ...parseFilters(new URLSearchParams('period=24h')), mode: 'published' as const }
  console.log(`project ${projectId}: ${V.length} simulated visitors`)

  const t = await totals(projectId, f)
  const extraSessions = V.filter(v => v.returning).length
  ok(t.sessions === V.length + extraSessions, `sessions = visitors + second visits (${V.length}+${extraSessions})`, `got ${t.sessions}`)
  ok(t.visitors === V.length, `distinct visitors = ${V.length}`, `got ${t.visitors}`)
  ok(t.newVisitors === V.length, 'every visitor was new at their first visit', `got ${t.newVisitors}`)

  const bySrc = Object.fromEntries((await breakdown(projectId, f, 'source')).map(r => [r.key, r]))
  const cnt = (fn: (v: any) => boolean) => V.filter(fn).length
  ok(bySrc.facebook?.sessions === cnt(v => v.source === 'facebook'), `facebook sessions = ${cnt(v => v.source === 'facebook')}`, JSON.stringify(bySrc.facebook?.sessions))
  ok(bySrc.google?.sessions === cnt(v => v.source === 'google') + extraSessions, `google sessions = ${cnt(v => v.source === 'google') + extraSessions} (organic, with the second visits)`, JSON.stringify(bySrc.google?.sessions))
  ok(bySrc.direct?.sessions === cnt(v => v.source === 'direct'), `direct sessions = ${cnt(v => v.source === 'direct')}`, JSON.stringify(bySrc.direct?.sessions))

  const byCamp = Object.fromEntries((await breakdown(projectId, f, 'campaign')).map(r => [r.key, r]))
  ok(byCamp.campA?.sessions === cnt(v => v.campaign === 'campA'), `campaign A sessions = ${cnt(v => v.campaign === 'campA')}`, JSON.stringify(byCamp.campA?.sessions))
  ok(byCamp.campB?.sessions === cnt(v => v.campaign === 'campB'), `campaign B sessions = ${cnt(v => v.campaign === 'campB')}`, JSON.stringify(byCamp.campB?.sessions))

  const byDev = Object.fromEntries((await breakdown(projectId, f, 'device')).map(r => [r.key, r]))
  ok(byDev.mobile?.sessions === cnt(v => v.device === 'mobile'), `mobile sessions = ${cnt(v => v.device === 'mobile')}`, JSON.stringify(byDev.mobile?.sessions))
  ok(byDev.desktop?.sessions === cnt(v => v.device === 'desktop') + extraSessions, `desktop sessions = ${cnt(v => v.device === 'desktop') + extraSessions}`, JSON.stringify(byDev.desktop?.sessions))

  const byCountry = Object.fromEntries((await breakdown(projectId, f, 'country')).map(r => [r.key, r]))
  for (const c of ['BR', 'US', 'PT']) {
    const want = cnt(v => v.country === c) + (c === 'US' ? extraSessions : 0)
    ok(byCountry[c]?.sessions === want, `country ${c} sessions = ${want}`, JSON.stringify(byCountry[c]?.sessions))
  }
  const byBrowser = (await breakdown(projectId, f, 'browser')).map(r => r.key)
  ok(byBrowser.includes('Safari') && byBrowser.includes('Chrome'), 'browsers recognised (Safari, Chrome)', byBrowser.join(','))

  // visitors whose browser blocks the script or its reports: the server wrote their entry itself
  const blocked = V.filter(v => v.block)
  const insta = bySrc.instagram
  ok(insta?.sessions === blocked.length, `instagram (blocked tracker) sessions = ${blocked.length}`, JSON.stringify(insta?.sessions))
  ok(byCamp.campC?.sessions === blocked.length, `campaign C (blocked tracker) sessions = ${blocked.length}`, JSON.stringify(byCamp.campC?.sessions))
  ok(t.jsSessions === t.sessions - blocked.length, `only the blocked visits lack the page's own report (${t.sessions - blocked.length} of ${t.sessions} reported)`, `got ${t.jsSessions}`)
  const bRows = await db.analyticsSession.findMany({ where: { projectId, campaign: undefined as any, utmCampaign: 'campC' } as any })
  ok(bRows.length === blocked.length && bRows.every((r: any) => r.country === 'BR' && r.device === 'mobile' && r.browser && r.os && r.channel === 'social'), 'a blocked visit still has country, device, browser and channel', JSON.stringify(bRows[0] && { c: bRows[0].country, d: bRows[0].device, b: bRows[0].browser, ch: bRows[0].channel }))
  const bPress = blocked.filter(v => v.press_cta).length
  ok(bRows.filter((r: any) => r.pageCount >= 2).length === bPress, `a funnel step opened by a blocked visitor is counted too (${bPress})`, String(bRows.map((r: any) => r.pageCount)))

  // conversions: a lead, or a click on the way to the checkout
  // a funnel step's button saves the visit as a lead too (that is how the runtime always worked), so pressing the CTA is a lead
  const isLead = (v: any) => v.fill_lead || v.press_cta
  const conv = cnt(v => isLead(v) || v.checkout)
  ok(t.conversions === conv, `conversions = ${conv} (lead, button of the funnel, or checkout click)`, `got ${t.conversions}`)
  ok(t.leads === cnt(isLead), `leads tied to visits = ${cnt(isLead)}`, `got ${t.leads}`)
  const leadRows = await db.lead.findMany({ where: { projectId } })
  ok(leadRows.length === cnt(isLead) && leadRows.every((l: any) => l.sessionId && l.visitorId), 'every lead remembers its visit and visitor', `${leadRows.length} leads`)
  ok(leadRows.every((l: any) => l.utmParams && ['facebook', 'google', 'instagram'].includes(l.utmParams.source) && l.country && l.device), 'every lead carries source, country and device of its visit', JSON.stringify(leadRows.find((l: any) => !(l.utmParams && l.utmParams.source))?.utmParams))

  // pages
  const withNext = cnt(v => v.press_cta)
  const pages = Object.fromEntries((await pagesTable(projectId, f)).map(r => [r.slug, r]))
  ok(pages.home?.sessions === V.length + extraSessions, `page home seen in ${V.length + extraSessions} visits`, JSON.stringify(pages.home?.sessions))
  ok((pages.obrigado?.sessions ?? 0) === withNext, `thank-you page reached by ${withNext} (steps swapped in place count as pages)`, JSON.stringify(pages.obrigado?.sessions))

  // behaviour
  const fr = await frictions(projectId, f)
  ok(fr.rageSessions === cnt(v => v.rage), `sessions with repeated clicks = ${cnt(v => v.rage)}`, `got ${fr.rageSessions}`)
  ok(fr.deadSessions >= cnt(v => v.dead && !v.rage) && fr.deadSessions <= cnt(v => v.dead || v.rage), `sessions with a click that got no answer ≈ ${cnt(v => v.dead)}`, `got ${fr.deadSessions}`)
  const cm = await clickMap(projectId, f, 'home', 'mobile')
  ok(cm.total > 0 && cm.elements.length > 0, `click map of the page has data (${cm.total} clicks, ${cm.elements.length} elements)`)
  const cta = cm.elements.find(e => /Quero comprar|Garantir/.test(e.text || ''))
  ok(!!cta, 'the main button shows up among the most clicked elements')
  const sm = await scrollMap(projectId, f, 'home', 'desktop')
  ok(sm.views > 0 && sm.reach[0] >= sm.reach[9], `scroll map: ${sm.views} page views, reach 10%=${sm.reach[0]}% 100%=${sm.reach[9]}%`)
  const ab = await abandonment(projectId, f)
  ok(ab.some(a => a.slug === 'home'), 'abandonment points computed for the home page')

  // video
  const videos = await videoList(projectId, f)
  const vid = videos.find(v => !v.embedded)
  const starters = V.filter(v => v.watch_to != null)
  ok(!!vid, 'the video is listed')
  if (vid) {
    ok(vid.plays === starters.length, `video: ${starters.length} pressed play`, `got ${vid.plays}`)
    ok(vid.seen >= vid.plays && vid.seen <= V.length + extraSessions, `video: seen by ${vid.seen} visits (play rate ${vid.playRate}%)`)
    const r = await retention(projectId, f, vid.src)
    ok(!!r && r.starters === starters.length, 'retention measured over the people who started', `${r?.starters}`)
    if (r) {
      const at = (s: number) => r.curve.find(c => c.s === s)?.pct ?? -1
      const expect = (s: number) => Math.round((starters.filter(v => v.watch_to >= s).length / starters.length) * 1000) / 10
      for (const s of [5, 15, 30, 45, 58]) ok(near(at(s), expect(s), 7.5), `retention at ${s}s: ${at(s)}% (expected about ${expect(s)}%)`)
      ok(near(at(0), 100, 0.1), 'everyone is there at second 0 (100%)', `got ${at(0)}`)
      ok(r.drops.length > 0, `drop points found (${r.drops.map(d => `${d.from}-${d.to}s -${d.lost}%`).join(', ')})`)
      ok(r.byWatched.some(b => b.sessions > 0), 'conversion by how much was watched is computed')
      const bySource = await retentionBy(projectId, f, vid.src, 'campaign', r.duration)
      const rowA = bySource.find(x => x.key === 'campA'), rowB = bySource.find(x => x.key === 'campB')
      const exp30 = (c: string) => {
        const s = starters.filter(v => v.campaign === c)
        return Math.round((s.filter(v => v.watch_to >= 30).length / s.length) * 1000) / 10
      }
      const m30 = (row: any) => row?.marks.find((m: any) => m.label === '30s')?.pct
      ok(rowA && rowB && near(m30(rowA), exp30('campA'), 8), `campaign A: ${m30(rowA)}% reach 30s (expected ${exp30('campA')}%)`)
      ok(rowA && rowB && near(m30(rowB), exp30('campB'), 8), `campaign B: ${m30(rowB)}% reach 30s (expected ${exp30('campB')}%)`)
      ok(rowA && rowB && m30(rowB) > m30(rowA), 'the comparison says campaign B holds the audience better, as it did')
    }
  }

  // journey
  const j = await journey(projectId, f)
  ok(j.steps[0].count === t.sessions && j.steps[j.steps.length - 1].count === t.conversions, `journey goes from ${j.steps[0].count} visits to ${j.steps[j.steps.length - 1].count} conversions`)
  ok(j.steps.every(s => s.count <= j.steps[0].count), 'no funnel stage has more people than there were visits')

  // sessions list + recordings
  const list = await sessionsList(projectId, f, { size: 100 })
  ok(list.total === t.sessions, 'sessions list agrees with the totals', `${list.total}`)
  const rec = await db.recording.count({ where: { projectId } })
  ok(rec > 0, `session recordings stored: ${rec}`)

  // who the people are
  const aud = await audience(projectId, f)
  const model = (b: string, m: string) => aud.models.find(x => x.brand === b && x.model.includes(m))?.sessions || 0
  ok(model('Apple', 'iPhone 12/13/14') === cnt(v => v.persona === 'fb_A'), `iPhones recognised by the size of the screen: ${cnt(v => v.persona === 'fb_A')}`, JSON.stringify(aud.models.slice(0, 5)))
  ok(model('Google', 'Pixel 8') === cnt(v => v.persona === 'fb_B'), `a Pixel 8 is a Pixel 8: ${cnt(v => v.persona === 'fb_B')}`, JSON.stringify(aud.models.slice(0, 6)))
  ok(model('Samsung', 'Galaxy A54') === blocked.length, `a Samsung code becomes the phone's name (Galaxy A54): ${blocked.length}`, JSON.stringify(aud.models))
  const ig = aud.inApp.find(a => a.key === 'Instagram')
  ok(ig?.sessions === blocked.length, `visits opened inside the Instagram app are told apart (${blocked.length})`, JSON.stringify(aud.inApp))
  ok(aud.speed.measured >= Math.floor(V.length * 0.5) && aud.speed.lcp.p50 > 0, `real page speed was measured for ${aud.speed.measured} visits (median ${aud.speed.lcp.p50} ms)`, JSON.stringify(aud.speed.lcp))
  const avgOf = (rows: any[]) => rows.reduce((t, r) => t + r.score, 0) / Math.max(1, rows.length)
  const scored = await db.analyticsSession.findMany({ where: { projectId, isBot: false, device: { not: null } }, select: { score: true, converted: true } })
  ok(avgOf(scored.filter(r => r.converted)) > avgOf(scored.filter(r => !r.converted)) + 20, `converted visits score much higher (${Math.round(avgOf(scored.filter(r => r.converted)))} vs ${Math.round(avgOf(scored.filter(r => !r.converted)))})`)
  ok(aud.score.hot > 0 && aud.score.cold > 0, `leads split into hot ${aud.score.hot}, warm ${aud.score.warm}, cold ${aud.score.cold}`)

  // insights from the real data
  const snap = await buildSnapshot(projectId, f)
  const ins = buildInsights(snap)
  ok(ins.length >= 2 && ins[0].kind === 'resumo', `insights written from the numbers (${ins.map(i => i.id).join(', ')})`)
  console.log('\nsummary:', ins[0]?.title)

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
