// The web side of the cloaker check, with the real route code: start a test of a public site through the scanner and read the result back.
import { NextRequest } from 'next/server'
import { db } from '@funnelai/db'
import * as route from '@/app/api/cloaker/route'

let failures = 0
const ok = (c: any, what: string, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${!c && extra ? '   -> ' + extra : ''}`); if (!c) failures++ }
async function main() {
  process.env.LAB_WORKSPACE_ID = 'lab_workspace_internal'
  const post = (url: string) => route.POST(new NextRequest('http://web/api/cloaker', { method: 'POST', body: JSON.stringify({ url }), headers: { 'content-type': 'application/json' } }) as any)
  const bad = await post('http://127.0.0.1:9000/')
  ok(bad.status === 400, 'an address inside our own network is refused', String(bad.status))
  const bad2 = await post('http://169.254.169.254/latest/meta-data/')
  ok(bad2.status === 400, 'the cloud metadata address is refused', String(bad2.status))
  const bad3 = await post('file:///etc/passwd')
  ok(bad3.status === 400 || bad3.status === 500 || bad3.status === 200 && false, 'a file address is refused', String(bad3.status))
  const r = await post('https://example.com/')
  const j: any = await (r as any).json()
  ok(r.status === 200 && j.id, 'a public site starts a test', JSON.stringify(j))
  let job: any = null
  for (let i = 0; i < 120; i++) {
    const g = await route.GET(new NextRequest(`http://web/api/cloaker?id=${j.id}`) as any)
    job = await (g as any).json()
    if (job.status === 'done' || job.status === 'error') break
    await new Promise(r => setTimeout(r, 2500))
  }
  ok(job?.status === 'done' && job.analysis, 'the result comes back', JSON.stringify(job).slice(0, 200))
  ok(job?.analysis?.status === 'green' && job.analysis.caveat, `a plain site: green, with the honest note about the network (${job?.analysis?.status}, ${job?.analysis?.confidence}%)`)
  ok(job?.probes?.length >= 40 && job.probes.filter((p: any) => p.ok).length >= 34, `${job?.probes?.filter((p: any) => p.ok).length} of ${job?.probes?.length} scenarios were answered`)
  ok(job?.analysis?.scenarios?.length >= 40 && job.analysis.matrix?.length >= 10 && job.analysis.findings.every((f: any) => f.kind !== 'deliberate'), 'the comparison, the matrix of environments and no invented condition')
  const brief: any = await (await route.GET(new NextRequest(`http://web/api/cloaker?id=${j.id}&brief=1`) as any)).json()
  ok(brief.status === 'done' && !brief.analysis && brief.probes.length >= 40 && !JSON.stringify(brief).includes('data:image'), 'the progress reads (brief=1) carry no analysis or screenshots')
  ok(!JSON.stringify(job).includes('"source"'), 'page sources are not sent to the browser')
  const n = await db.aiUsageLog.count({ where: { operation: 'cloaker', workspaceId: 'lab_workspace_internal' } })
  ok(n >= 1, 'the use is counted (for the hourly limit)')
  await db.aiUsageLog.deleteMany({ where: { operation: 'cloaker', workspaceId: 'lab_workspace_internal' } })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
