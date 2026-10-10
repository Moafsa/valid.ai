import { readFileSync } from 'node:fs'
import { db } from '@funnelai/db'
import { experimentResults } from '@/lib/analytics/experiments'
let failures = 0
const ok = (c: any, what: string, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${!c && extra ? '   -> ' + extra : ''}`); if (!c) failures++ }
async function main() {
  const truth = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const projectId = truth.state.projectId
  const exp = await db.experiment.findFirst({ where: { projectId } })
  const V = truth.visitors.filter((v: any) => v.ok)
  ok(V.every((v: any) => v.same_both_times), 'every visitor saw the same version on both visits (kept by cookie)', JSON.stringify(V.filter((v: any) => !v.same_both_times).map((v: any) => v.id)))
  const nA = V.filter((v: any) => v.headline_seen === 'A').length, nB = V.filter((v: any) => v.headline_seen === 'B').length
  ok(nA >= 6 && nB >= 6, `traffic is shared between the versions (A ${nA}, B ${nB})`)
  const r = await experimentResults(projectId, exp!.id)
  const a = r!.variants.find(v => v.id === 'v1')!, b = r!.variants.find(v => v.id === 'v2')!
  ok(a.visitors === nA && b.visitors === nB, `results count the visitors of each version (A ${a.visitors}, B ${b.visitors})`)
  const convA = V.filter((v: any) => v.headline_seen === 'A' && v.press_cta).length, convB = V.filter((v: any) => v.headline_seen === 'B' && v.press_cta).length
  ok(a.conversions === convA && b.conversions === convB, `conversions per version match (A ${a.conversions}/${convA}, B ${b.conversions}/${convB})`)
  ok(r!.leader === (convB / Math.max(1, nB) > convA / Math.max(1, nA) ? 'v2' : 'v1'), `the leader is the version that really converted more (${r!.leader})`)
  const sess = await db.analyticsSession.findMany({ where: { projectId, expId: exp!.id } })
  ok(sess.length === V.length && sess.every(s => s.variant === 'v1' || s.variant === 'v2'), 'every visit remembers which version it saw')
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
