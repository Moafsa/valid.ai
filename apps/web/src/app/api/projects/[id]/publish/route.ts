import { getAuthUser } from '@/lib/auth-helper'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'

/**
 * Makes the "Publicar" button real: flips the project to PUBLISHED and
 * stamps each page's publishedUrl, so /f/[projectId]/[slug] will actually
 * serve it. Before this route existed, the button had no onClick at all.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const project = await db.project.findUnique({
      where: { id },
      include: { pages: { orderBy: { order: 'asc' } } },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.pages.length === 0) {
      return NextResponse.json({ error: 'Projeto ainda não tem páginas geradas' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://be-vallid.com'
    // For an LP there's one page, slug "home". For a quiz there's one page
    // per step (step-1, step-2, ...) — always land on the lowest-order one.
    const firstPage = project.pages.find(p => p.slug === 'home') ?? project.pages[0]
    const publicPath = `/f/${project.id}/${firstPage.slug}`

    await db.$transaction([
      db.project.update({ where: { id: project.id }, data: { status: 'PUBLISHED' } }),
      ...project.pages.map(p =>
        db.page.update({
          where: { id: p.id },
          data: { publishedUrl: `/f/${project.id}/${p.slug}` },
        })
      ),
    ])

    return NextResponse.json({ url: `${appUrl}${publicPath}` })
  } catch (error) {
    console.error('Publish project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
