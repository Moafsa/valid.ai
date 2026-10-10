import { db } from '@funnelai/db'
import { normalizeSlug } from '@/lib/utils'
import { gate } from '@/lib/plans'

export class PublishError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/**
 * "Publicar": freezes the project's pages as they are right now into the public snapshot.
 *
 * The editor works on `pages`; visitors only ever see `published_pages`. Publishing again replaces the whole
 * snapshot in one transaction, so a visitor never gets a half-updated site, and pages that were deleted in the
 * editor disappear from the public version.
 */
export async function publishProject(projectId: string, rawSlug?: string | null) {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { pages: { orderBy: { order: 'asc' } } } })
  if (!project) throw new PublishError('Projeto não encontrado', 404)
  if (!['READY', 'PUBLISHED'].includes(project.status)) throw new PublishError('Publique depois que a clonagem terminar')
  if (project.pages.length === 0) throw new PublishError('Esse projeto ainda não tem páginas')
  if (project.status !== 'PUBLISHED') {
    // a new active page: only if the plan has room (republishing one that is already live never counts again)
    const ws = await db.workspace.findUnique({ where: { id: project.workspaceId }, select: { id: true, planKey: true, subscriptionStatus: true, planUntil: true } })
    if (ws) {
      const g = await gate(ws, 'pages')
      if (!g.ok) throw new PublishError(g.message, 403)
    }
  }

  const wanted = rawSlug !== undefined && rawSlug !== null && rawSlug.trim() !== '' ? normalizeSlug(rawSlug) : project.slug
  if (!wanted) throw new PublishError('Escolha um endereço para publicar')
  const taken = await db.project.findFirst({ where: { slug: wanted, NOT: { id: projectId } }, select: { id: true } })
  if (taken) throw new PublishError('Esse endereço já está em uso, escolha outro', 409)

  const now = new Date()
  await db.$transaction([
    db.publishedPage.deleteMany({ where: { projectId } }),
    db.publishedPage.createMany({
      data: project.pages.map(p => ({
        projectId,
        pageSlug: p.slug,
        name: p.name,
        order: p.order,
        blocks: (p.blocks ?? []) as any,
        customCss: p.customCss,
        shell: (p.shell ?? undefined) as any,
        publishedAt: now,
      })),
    }),
    db.project.update({ where: { id: projectId }, data: { slug: wanted, status: 'PUBLISHED', publishedAt: now } }),
  ])
  return { slug: wanted, publishedAt: now, pages: project.pages.length }
}

/** Takes the site down: the address answers 404 again. The editor's pages are untouched. */
export async function unpublishProject(projectId: string) {
  await db.$transaction([
    db.publishedPage.deleteMany({ where: { projectId } }),
    db.project.updateMany({ where: { id: projectId, status: 'PUBLISHED' }, data: { status: 'READY', publishedAt: null } }),
  ])
}

/** True when the editor's pages changed after the last publish (the public site is behind). */
export async function hasUnpublishedChanges(projectId: string): Promise<boolean> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { publishedAt: true, status: true } })
  if (!project?.publishedAt || project.status !== 'PUBLISHED') return false
  const newer = await db.page.count({ where: { projectId, updatedAt: { gt: project.publishedAt } } })
  return newer > 0
}
