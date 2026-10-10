import { db } from '@funnelai/db'

/**
 * The stylesheet of a page. The steps of a cloned funnel all use the same
 * one, so it is stored once - on the project's first page - and the others
 * point at it by having none of their own.
 */
// A funnel visitor (and the prefetch that runs ahead of them) asks for many steps within seconds; each one needs
// the shared stylesheet, which is large. Kept for a few seconds so that burst reads the database once.
const shared = new Map<string, { css: string | null; at: number }>()
const SHARED_TTL_MS = 5000

export async function pageCssFor(projectId: string, page: { customCss: string | null }): Promise<string | null> {
  if (page.customCss) return page.customCss
  const hit = shared.get(projectId)
  if (hit && Date.now() - hit.at < SHARED_TTL_MS) return hit.css
  const first = await db.page.findFirst({
    where: { projectId, customCss: { not: null } },
    orderBy: { order: 'asc' },
    select: { customCss: true },
  })
  const css = first?.customCss ?? null
  if (shared.size > 50) shared.delete(shared.keys().next().value as string)
  shared.set(projectId, { css, at: Date.now() })
  return css
}
