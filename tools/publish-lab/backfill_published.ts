// Projects published before "Publicar" took a snapshot get one now (their current pages become the public version).
import { db } from '@funnelai/db'
import { publishProject } from '@/lib/publish'
async function main() {
  const rows = await db.project.findMany({ where: { status: 'PUBLISHED' }, select: { id: true, slug: true, name: true, _count: { select: { publishedPages: true } } } })
  for (const p of rows) {
    if (p._count.publishedPages > 0) { console.log('already has a snapshot:', p.slug); continue }
    if (!p.slug) { console.log('published without an address, back to READY:', p.name); await db.project.update({ where: { id: p.id }, data: { status: 'READY' } }); continue }
    const r = await publishProject(p.id)
    console.log('snapshot created for', p.name, '->', `/s/${r.slug}`, `(${r.pages} pages)`)
  }
  console.log('done', rows.length, 'published project(s) checked')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
