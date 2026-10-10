// an A/B test on the published test project: home (original) against home-b, 50/50
import { db } from '@funnelai/db'
async function main() {
  const projectId = process.argv[2]
  await db.experiment.deleteMany({ where: { projectId } })
  const e = await db.experiment.create({ data: { projectId, name: 'Título novo', kind: 'headline', goal: 'lead', variants: [
    { id: 'v1', name: 'Original', slug: 'home', weight: 50 }, { id: 'v2', name: 'Título novo', slug: 'home-b', weight: 50 }] as any } })
  console.log('EXP ' + e.id)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
