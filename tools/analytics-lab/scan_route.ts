// The web app's own way into the scanner (start + progress), with the real route code, now that the scanner only answers the web app.
import { NextRequest } from 'next/server'
import { db } from '@funnelai/db'
import * as start from '@/app/api/scan/start/route'
import * as progress from '@/app/api/scan/progress/[jobId]/route'

let failures = 0
const ok = (c: any, what: string, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${!c && extra ? '   -> ' + extra : ''}`); if (!c) failures++ }
async function main() {
  process.env.LAB_WORKSPACE_ID = 'lab_workspace_internal'; process.env.LAB_USER_ID = 'user_lab'
  const url = 'http://172.18.0.1:8098/clean'
  const project = await db.project.create({ data: { workspaceId: 'lab_workspace_internal', name: 'TEST scan route', sourceUrl: url, status: 'PENDING' } })
  const r = await start.POST(new NextRequest('http://web/api/scan/start', { method: 'POST', body: JSON.stringify({ projectId: project.id, url, persona: 'ig_ios' }), headers: { 'content-type': 'application/json' } }) as any)
  const j: any = await (r as any).json()
  ok(r.status === 200 && j.jobId, 'the web app starts a scan (with the scanner secret)', JSON.stringify(j))
  const p = await progress.GET(new NextRequest(`http://web/api/scan/progress/${j.jobId}`, { headers: {} }) as any, { params: Promise.resolve({ jobId: j.jobId }) } as any)
  ok(p.status === 200, 'the progress stream opens', String(p.status))
  const reader = (p as any).body.getReader(); const dec = new TextDecoder(); let buf = '', done = false
  const t0 = Date.now()
  while (Date.now() - t0 < 240000 && !done) { const { value, done: d } = await reader.read(); if (d) break; buf += dec.decode(value); if (/"status": ?"(done|error)"/.test(buf)) done = true }
  ok(done && /"status": ?"done"/.test(buf), 'the scan finishes through the stream')
  await new Promise(r => setTimeout(r, 2500))
  const after = await db.project.findUnique({ where: { id: project.id } })
  ok(after?.status === 'READY', `the clone was delivered back (${after?.status})`)
  await db.project.delete({ where: { id: project.id } })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
