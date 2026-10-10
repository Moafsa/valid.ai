import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const [, , url, label] = process.argv
const WORKSPACE = 'lab_workspace_internal'

const project = await db.project.create({ data: { workspaceId: WORKSPACE, name: 'TEST ' + label, sourceUrl: url, status: 'SCANNING' } })
const job = await db.scanJob.create({ data: { url, status: 'QUEUED' } })
await db.project.update({ where: { id: project.id }, data: { scanJobId: job.id } })

const start = await fetch('http://scanner:8001/api/scanner/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' },
  body: JSON.stringify({ job_id: job.id, project_id: project.id, url, workspace_id: WORKSPACE }),
})
if (!start.ok) throw new Error('scanner start failed ' + start.status)

const sse = await fetch(`http://scanner:8001/api/scanner/progress/${job.id}`, { headers: { 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' } })
const reader = sse.body.getReader(); const dec = new TextDecoder()
let buf = '', result = null, error = null, lastStep = '', delivered = false
outer: while (true) {
  const { value, done } = await reader.read(); if (done) break
  buf += dec.decode(value, { stream: true })
  let idx
  while ((idx = buf.indexOf('\n\n')) >= 0) {
    const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
    const line = chunk.split('\n').find(l => l.startsWith('data:')); if (!line) continue
    const ev = JSON.parse(line.slice(5).trim())
    if (ev.currentStep && ev.currentStep !== lastStep) { lastStep = ev.currentStep; console.error(`[${ev.progress}%] ${lastStep}`) }
    if (ev.status === 'done') { result = ev.result; if (ev.delivered) { delivered = true } break outer }
    if (ev.status === 'error') { error = ev.error; break outer }
  }
}
if (delivered) { console.error('DELIVERED by the scanner (server to server)'); const pg = await db.page.findMany({ where: { projectId: project.id }, orderBy: { order: 'asc' }, select: { slug: true, customCss: true, blocks: true } }); for (const x of pg) console.error(`page ${x.slug}: ${x.blocks.length} blocks, css ${x.customCss?.length ?? 0}`); const pr = await db.project.findUnique({ where: { id: project.id } }); console.error('project status', pr.status); console.log(JSON.stringify({ projectId: project.id, slug: pg[0]?.slug })); await db.$disconnect(); process.exit(0) }
if (error || !result) { await db.project.update({ where: { id: project.id }, data: { status: 'ERROR' } }); throw new Error('scan failed: ' + error) }

const toBlocks = sections => sections.map((s, i) => ({ id: s.id ?? `section_${i}`, type: (s.type || 'custom-html').toString().toLowerCase(), order: s.order ?? i, generatedHtml: s.generatedHtml ?? null, links: Array.isArray(s.links) ? s.links : [] }))
await db.$transaction([
  db.page.deleteMany({ where: { projectId: project.id } }),
  ...result.pages.map((p, i) => db.page.create({ data: { projectId: project.id, name: p.name || p.slug, slug: p.slug || `page-${i + 1}`, order: i, blocks: toBlocks(p.sections), customCss: p.page_css || null, shell: p.shell && typeof p.shell === 'object' ? p.shell : undefined } })),
  db.project.update({ where: { id: project.id }, data: { status: 'READY', thumbnail: result.thumbnail || null, crawlStats: result.crawlStats || null } }),
  db.scanJob.updateMany({ where: { id: job.id }, data: { status: 'DONE', progress: 100, currentStep: 'Concluído' } }),
])
const pages = await db.page.findMany({ where: { projectId: project.id }, select: { id: true, slug: true, blocks: true, shell: true, customCss: true } })
for (const pg of pages) console.error(`page ${pg.slug}: ${pg.blocks.length} blocks, css ${pg.customCss?.length ?? 0} chars, shell wrappers=${JSON.stringify((pg.shell?.wrappers || []).map(w => w.tag))} htmlAttrs=${JSON.stringify(pg.shell?.html || {}).slice(0, 120)}`)
console.log(JSON.stringify({ projectId: project.id, slug: pages[0].slug }))
await db.$disconnect()
