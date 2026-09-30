import { NextRequest, NextResponse } from 'next/server'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { z } from 'zod'

const schema = z.object({ sourceUrl: z.string().url(), slug: z.string().min(1).max(60) })

function nameFromUrl(url: string): string {
  try {
    return `Clone de ${new URL(url).hostname}`
  } catch {
    return 'Novo projeto'
  }
}

// Same normalization the scanner already uses for page slugs — lowercase,
// non-alphanumeric collapsed to a single "-", no leading/trailing "-" —
// so a user typing "Minha Oferta!!" and a page auto-slugged from a URL
// path end up in the same shape.
function normalizeSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sourceUrl, slug: rawSlug } = schema.parse(await req.json())
    const slug = normalizeSlug(rawSlug)
    if (!slug) return NextResponse.json({ error: 'Domínio inválido' }, { status: 400 })

    const taken = await db.project.findUnique({ where: { slug } })
    if (taken) return NextResponse.json({ error: 'Esse domínio já está em uso, escolha outro' }, { status: 409 })

    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: nameFromUrl(sourceUrl),
        sourceUrl,
        slug,
        status: 'PENDING',
      },
    })

    return NextResponse.json(project)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'URL ou domínio inválido' }, { status: 400 })
    }
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
