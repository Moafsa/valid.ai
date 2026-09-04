import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import { ProjectDetail } from '@/components/project/project-detail'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await db.project.findUnique({
    where: { id },
    include: {
      pages: { orderBy: { order: 'asc' } },
      scanJob: true,
      trackings: true,
    },
  })

  if (!project) notFound()

  return <ProjectDetail project={project} />
}
