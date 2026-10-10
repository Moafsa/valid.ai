import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@funnelai/db'
import { getCurrentWorkspace } from '@/lib/auth-helper'
import { listFlowLinks, setFlowTarget, setRuleTarget } from '@/lib/clone-flow'

const schema = z.object({
  pageSlug: z.string().min(1),
  // a button / answer of the page ...
  idx: z.number().int().min(0).optional(),
  // ... or one of its hidden "leaving" rules
  ruleId: z.string().max(60).optional(),
  target: z.string().max(2000),
})

/** Changes where one button / answer of a funnel step sends the visitor. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = schema.parse(await req.json())

    const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id } })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const page = await db.page.findFirst({ where: { projectId: id, slug: body.pageSlug } })
    if (!page) return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 })

    const target = body.target.trim()
    if (target && !/^https?:\/\//i.test(target)) {
      const dest = await db.page.findFirst({ where: { projectId: id, slug: target }, select: { id: true } })
      if (!dest) return NextResponse.json({ error: 'Etapa de destino não existe' }, { status: 400 })
    }

    if (body.ruleId) {
      const shell = setRuleTarget(page.shell, body.ruleId, target)
      await db.page.update({ where: { id: page.id }, data: { shell } })
      return NextResponse.json({ ok: true })
    }
    if (body.idx === undefined) return NextResponse.json({ error: 'idx ou ruleId é obrigatório' }, { status: 400 })

    const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []
    const updated = setFlowTarget(blocks, body.idx, target)
    await db.page.update({ where: { id: page.id }, data: { blocks: updated as any } })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    console.error('Flow update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const bulkSchema = z.object({
  /** every button / rule that goes to this site ... */
  fromHost: z.string().min(3).max(200),
  /** ... is sent to this address instead */
  url: z.string().url().max(2000),
})

const rootOf = (h: string) => h.replace(/^www\./, '').split('.').slice(-2).join('.')
const hostOf = (u: string) => { try { return new URL(u).host } catch { return '' } }

/** Sends every button (and exit rule) that still leads to the ORIGINAL site to the owner's own address. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const workspace = await getCurrentWorkspace()
    if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { fromHost, url } = bulkSchema.parse(await req.json())
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'O endereço precisa começar com http:// ou https://' }, { status: 400 })

    const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id } })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const wanted = rootOf(fromHost)
    const pages = await db.page.findMany({ where: { projectId: id }, select: { id: true, blocks: true, shell: true } })
    let changed = 0
    for (const page of pages) {
      let blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []
      let touched = false
      for (const l of listFlowLinks(blocks)) {
        if (/^https?:\/\//i.test(l.target) && rootOf(hostOf(l.target)) === wanted) {
          blocks = setFlowTarget(blocks, l.idx, url)
          changed++
          touched = true
        }
      }
      let shell: any = page.shell
      const rules: any[] = Array.isArray(shell?.rules) ? shell.rules : []
      const nextRules = rules.map(r => (/^https?:\/\//i.test(r.goto || '') && rootOf(hostOf(r.goto)) === wanted ? (changed++, touched = true, { ...r, goto: url }) : r))
      if (touched) {
        await db.page.update({ where: { id: page.id }, data: { blocks: blocks as any, ...(shell ? { shell: { ...shell, rules: nextRules } } : {}) } })
      }
    }
    return NextResponse.json({ ok: true, changed })
  } catch (error: any) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    console.error('Flow bulk update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
