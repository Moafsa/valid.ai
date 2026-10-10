// Scans many real sites through the real pipeline, N at a time, resumable.
// usage: node batch_scan.mjs <sites.tsv> <out.jsonl> [concurrency] [from] [to]
import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const db = new PrismaClient()
const [, , listFile, outFile, conc = '3', from = '1', to = '100000'] = process.argv
const WORKSPACE = 'lab_workspace_internal'
const SITE_TIMEOUT_MS = 20 * 60 * 1000

const rows = fs.readFileSync(listFile, 'utf8').trim().split('\n').map(l => {
  const [idx, cat, url] = l.split('\t'); return { idx: +idx, cat, url }
}).filter(r => r.idx >= +from && r.idx <= +to)

const done = new Set()
if (fs.existsSync(outFile)) {
  for (const l of fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean)) {
    try { const j = JSON.parse(l); if (j.status !== 'timeout' && !(j.status === 'error' && /fetch failed|stream ended|ECONN|socket|terminated|other side closed/i.test(j.error || ''))) done.add(j.idx) } catch {}
  }
}
const queue = rows.filter(r => !done.has(r.idx))
console.error(`${queue.length} sites to scan (${done.size} already done), concurrency ${conc}`)

async function scanOne(r, attempt = 1) {
  const t0 = Date.now()
  const host = new URL(r.url).hostname.replace(/^www\./, '')
  const project = await db.project.create({ data: { workspaceId: WORKSPACE, name: `TEST site_${String(r.idx).padStart(3, '0')} ${host}`, sourceUrl: r.url, status: 'SCANNING' } })
  const job = await db.scanJob.create({ data: { url: r.url, status: 'QUEUED' } })
  await db.project.update({ where: { id: project.id }, data: { scanJobId: job.id } })
  const out = { idx: r.idx, cat: r.cat, url: r.url, projectId: project.id, attempt }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), SITE_TIMEOUT_MS)
  try {
    const start = await fetch('http://scanner:8001/api/scanner/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' }, signal: ctl.signal,
      body: JSON.stringify({ job_id: job.id, project_id: project.id, url: r.url, workspace_id: WORKSPACE }),
    })
    if (!start.ok) throw new Error('start ' + start.status)
    const sse = await fetch(`http://scanner:8001/api/scanner/progress/${job.id}`, { signal: ctl.signal, headers: { 'x-scanner-secret': process.env.SCANNER_SHARED_SECRET || '' } })
    const reader = sse.body.getReader(); const dec = new TextDecoder()
    let buf = '', result = null, error = null, delivered = false, lastStep = ''
    outer: while (true) {
      const { value, done: d } = await reader.read(); if (d) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
        const line = chunk.split('\n').find(l => l.startsWith('data:')); if (!line) continue
        let ev; try { ev = JSON.parse(line.slice(5).trim()) } catch { continue }
        if (ev.currentStep) lastStep = ev.currentStep
        if (ev.status === 'done') { result = ev.result; delivered = !!ev.delivered; break outer }
        if (ev.status === 'error') { error = ev.error; break outer }
      }
    }
    if (error) { out.status = 'error'; out.error = String(error).slice(0, 300) }
    else if (!result && !delivered) { out.status = 'error'; out.error = 'stream ended: ' + lastStep }
    else {
      const pr = await db.project.findUnique({ where: { id: project.id }, select: { status: true, crawlStats: true } })
      const pgs = await db.page.findMany({ where: { projectId: project.id }, orderBy: { order: 'asc' }, select: { slug: true, name: true, blocks: true, customCss: true } })
      out.status = pr?.status === 'READY' ? 'ok' : 'notready:' + pr?.status
      out.slug = pgs[0]?.slug; out.pages = pgs.length; out.blocks = pgs[0]?.blocks?.length ?? 0
      out.cssKB = Math.round((pgs[0]?.customCss?.length ?? 0) / 1024)
      out.notes = (pr?.crawlStats?.notes ?? pr?.crawlStats?.warnings ?? []).slice?.(0, 6) ?? null
      out.stats = pr?.crawlStats ? Object.fromEntries(Object.entries(pr.crawlStats).filter(([k, v]) => typeof v !== 'object')) : null
    }
  } catch (e) {
    out.status = ctl.signal.aborted ? 'timeout' : 'error'; out.error = String(e?.message || e).slice(0, 300)
  } finally { clearTimeout(timer) }
  out.seconds = Math.round((Date.now() - t0) / 1000)
  if (out.status === 'error' && attempt < 5 && /fetch failed|ECONN|deliver|socket|stream ended|terminated|other side closed/i.test(out.error || '')) {
    await db.project.update({ where: { id: project.id }, data: { status: 'ERROR' } }).catch(() => {})
    // the scanner is probably restarting: wait until it answers before trying this site again
    for (let i = 0; i < 40; i++) {
      try { const h = await fetch('http://scanner:8001/openapi.json', { signal: AbortSignal.timeout(3000) }); if (h.ok) break } catch {}
      await new Promise(res => setTimeout(res, 3000))
    }
    return scanOne(r, attempt + 1)
  }
  if (out.status !== 'ok') await db.project.update({ where: { id: project.id }, data: { status: 'ERROR' } }).catch(() => {})
  return out
}

let running = 0, next = 0, finished = 0
await new Promise(resolve => {
  const pump = () => {
    while (running < +conc && next < queue.length) {
      const r = queue[next++]; running++
      scanOne(r).then(o => {
        fs.appendFileSync(outFile, JSON.stringify(o) + '\n')
        finished++; running--
        console.error(`[${finished}/${queue.length}] #${o.idx} ${o.status} ${o.seconds}s ${o.url} ${o.error || ''}`)
        pump()
      })
    }
    if (running === 0 && next >= queue.length) resolve()
  }
  pump()
})
await db.$disconnect()
console.error('BATCH DONE')
