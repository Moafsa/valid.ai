// Renders the server pages of the dashboard (admin, feedback, the Métricas card) with the real code against the real database,
// to see that they run and say what they should. Needs real rows: run after run_all.sh.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@funnelai/db'
import * as admin from '@/components/dashboard/admin-tabs'
import { PricingSection } from '@/components/landing/pricing-section'
import { PixelsTab } from '@/components/dashboard/pixels-tab'
import { PixelMetricsCard } from '@/components/dashboard/pixel-metrics-card'
import { PlanCard } from '@/components/dashboard/plan-card'
import { assignPlan } from '@/lib/plans-admin'
import { entitlementsOf, publicPlans, usageOf } from '@/lib/plans'
import FeedbackPage from '@/app/(dashboard)/feedback/page'
import { MetricsHub } from '@/components/dashboard/metrics-hub-loader'
import { portfolio } from '@/lib/analytics/portfolio'

let failures = 0
const ok = (c: any, what: string, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${what}${!c && extra ? '   -> ' + extra : ''}`); if (!c) failures++ }
const html = async (el: any) => renderToStaticMarkup(await el)

async function main() {
  const ws = await db.workspace.findUnique({ where: { id: 'lab_workspace_internal' } })
  const project = await db.project.findFirst({ where: { workspaceId: 'lab_workspace_internal', name: { startsWith: 'TEST analytics' }, status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' } })
  // a message to read and answer
  const fb = await db.feedback.create({ data: { workspaceId: ws!.id, kind: 'site_not_cloning', siteUrl: 'https://exemplo.com/pagina', message: 'O menu não abre no celular', context: { viewport: '390x844', ua: 'teste' } } })

  // a customer account of its own (the lab and dev accounts are hidden from the admin numbers on purpose)
  const stamp = Date.now()
  const cust = await db.workspace.create({ data: { clerkOrgId: `test_admin_org_${stamp}`, name: `TEST Cliente ${stamp}`, slug: `test-admin-${stamp}`, plan: 'BASIC' } })
  const custProject = await db.project.create({ data: { workspaceId: cust.id, name: `TEST site zeta ${stamp}`, sourceUrl: 'https://exemplo.com/zeta', status: 'PUBLISHED', slug: `test-admin-zeta-${stamp}` } })
  const d7 = new Date(Date.now() - 7 * 864e5), d30 = new Date(Date.now() - 30 * 864e5)
  for (const [name, fn] of [['Resumo', () => (admin as any).Summary({ d7, d30 })], ['Usuários', () => (admin as any).UsersTab({})], ['Projetos', () => (admin as any).ProjectsTab({})], ['Planos', () => (admin as any).PlansTab()], ['Pagamentos', () => (admin as any).PaymentsTab()], ['Mensagens', () => (admin as any).FeedbackTab({})], ['Erros', () => (admin as any).ErrorsTab()], ['Sistema', () => (admin as any).SystemTab()]] as const) {
    try {
      const h = await html(fn()); ok(h.length > 200, `admin tab "${name}" renders (${h.length} bytes)`)
      if (name === 'Mensagens') ok(h.includes('O menu não abre no celular') && h.includes('Site não clonou direito'), 'the message and its kind are in the inbox')
      if (name === 'Resumo') {
        for (const t of ['Usuários', 'Usuários ativos', 'Usuários pagantes', 'Receita em 30 dias', 'Alertas importantes', 'Usuários por plano', 'Pagamentos recentes', 'Contas perto do limite', 'Contas com problemas', 'Sites publicados', 'Uso de IA']) ok(h.includes(t), `summary shows "${t}"`)
        ok(!h.includes('Clonagens em 7 dias') && !h.includes('Mensagens abertas'), 'summary has no raw project/clone counts')
      }
      if (name === 'Usuários') {
        for (const t of ['Nome', 'E-mail', 'Plano', 'Status', 'Último acesso', 'Sites publicados']) ok(h.includes(`>${t}<`), `users list column "${t}"`)
        ok(!h.includes('>Visitas 30d<') && !h.includes('>Pagou<') && !h.includes('>Ajustar<'), 'users list has no extra columns')
        ok(h.includes(`/admin/usuarios/${cust.id}`), 'a row opens the account')
      }
      if (name === 'Planos') for (const t of ['Basic', 'Pro', 'Scale', 'Ilimitado', 'Gratuito', 'Novo plano', 'Páginas ativas', 'Ilimitado']) ok(h.includes(t), `plans tab shows "${t}"`)
      if (name === 'Projetos') for (const t of ['Projeto', 'Usuário', 'Domínio', 'Situação']) ok(h.includes(`>${t}<`), `projects column "${t}"`)
    } catch (e: any) { ok(false, `admin tab "${name}" renders`, String(e?.message || e).slice(0, 300)) }
  }
  try {
    const hiddenLab = await html((admin as any).UsersTab({}))
    ok(!hiddenLab.includes('/admin/usuarios/lab_workspace_internal'), 'the lab account is not listed as a customer')
    const hiddenProj = await html((admin as any).ProjectsTab({}))
    ok(!hiddenProj.includes('TEST site_'), 'lab projects are not listed')
    const found = await html((admin as any).UsersTab({ q: cust.name })); ok(found.includes(`/admin/usuarios/${cust.id}`), 'users search finds the account by name')
    const none = await html((admin as any).UsersTab({ q: 'zzzz-nao-existe-9' })); ok(none.includes('Ninguém encontrado'), 'users search with no match says so')
    const subject = custProject
    if (subject) {
      const byName = await html((admin as any).ProjectsTab({ q: subject.name })); ok(byName.includes(subject.id) && byName.includes('Publicado'), 'projects search finds a project by name')
      const bySlug = subject.slug ? await html((admin as any).ProjectsTab({ q: subject.slug })) : ''; ok(!subject.slug || bySlug.includes(subject.id), 'projects search finds a project by its domain/slug')
      const byAccount = await html((admin as any).ProjectsTab({ q: cust.name })); ok(byAccount.includes(subject.id), 'projects search finds a project by its user')
      const pub = await html((admin as any).ProjectsTab({ q: subject.name, st: 'PUBLISHED' })); ok(pub.includes(subject.id), 'status filter keeps the published project')
      const err = await html((admin as any).ProjectsTab({ q: subject.name, st: 'ERROR' })); ok(!err.includes(subject.id) && err.includes('Nenhum projeto encontrado'), 'status filter hides it from "com erro"')
    }
    // the landing page's pricing, the customer's plan card, the Pixels tab (locked, then open) and the Métricas card
    const pricing = await html(PricingSection())
    ok(['Recomendado', 'R$ 97', 'R$ 247', 'R$ 597', 'Até 2 páginas ativas', 'Até 8 páginas ativas', 'Até 20 páginas ativas', 'Suporte prioritário', 'Identificação de cloaker', 'Componentes interativos', 'Pixel e scripts de rastreamento'].every(t => pricing.includes(t)) && !pricing.includes('425'), 'the pricing section reads from the plans table with the corrected numbers')
    ok(!pricing.includes('Ilimitado') && !pricing.includes('Gratuito'), 'the hidden unlimited plan and the free plan are not on the pricing page')
    const wsRow = (await db.workspace.findUnique({ where: { id: cust.id } }))!
    const planHtml = await html(PlanCard({ ent: await entitlementsOf(wsRow), usage: await usageOf(cust.id, { storage: false }), credits: wsRow.aiCredits, until: wsRow.planUntil, plans: await publicPlans() }) as any)
    ok(planHtml.includes('Seu plano') && planHtml.includes('Páginas ativas') && planHtml.includes('Mudar de plano'), 'the customer sees their plan, their usage and the other plans')
    const locked = await html(PixelsTab({ project: { id: subject!.id, slug: subject!.slug, status: subject!.status, pixelSettings: null }, workspace: wsRow }))
    ok(locked.includes('Pixels e eventos') && locked.includes('Ver meu plano') && !locked.includes('Eventos e objetivos'), 'a plan without pixels sees the locked tab')
    ok((await html(PixelMetricsCard({ projectId: subject!.id, workspace: wsRow }))) === '', 'and no pixel card in Métricas')
    await assignPlan(cust.id, { planKey: 'PRO' })
    const proRow = (await db.workspace.findUnique({ where: { id: cust.id } }))!
    const open = await html(PixelsTab({ project: { id: subject!.id, slug: subject!.slug, status: subject!.status, pixelSettings: null }, workspace: proRow }))
    ok(['Integrações', 'Eventos e objetivos', 'Privacidade', 'O que chegou de verdade', 'Meta Pixel', 'Google Tag Manager', 'Script personalizado', 'Evento personalizado'].every(t => open.includes(t)), 'a plan with pixels sees the whole tab')
    const card = await html(PixelMetricsCard({ projectId: subject!.id, workspace: proRow }))
    ok(card.includes('É opcional') || card.includes('opcional'), 'Métricas offers the pixels (as optional) when none is set', card.slice(0, 200))
    const prof = await (await import('@/components/dashboard/admin-profile')).UserProfile({ id: cust.id })
    const ph = await html(prof)
    for (const t of ['Limites e consumo', 'Sites publicados, domínios e métricas', 'Histórico de atividade', 'Pagamentos', 'Dados da conta', 'Uso de IA', 'Projetos', 'Erros', 'Plano e créditos']) ok(ph.includes(t), `account page shows "${t}"`)
    ok(!subject || ph.includes(subject.name), 'account page lists the customer\'s project')
    ok((await (await import('@/components/dashboard/admin-profile')).UserProfile({ id: 'nao-existe' })) === null, 'an unknown account gives nothing (404)')
  } catch (e: any) { ok(false, 'admin search and account page', String(e?.stack || e).slice(0, 500)) } finally { await db.workspace.delete({ where: { id: cust.id } }).catch(() => {}) }
  process.env.LAB_WORKSPACE_ID = ws!.id
  try { const h = await html((FeedbackPage as any)()); ok(h.includes('Feedback e problemas') && h.includes('O menu não abre no celular'), 'the user sees the message they sent on the feedback page') } catch (e: any) { ok(false, 'feedback page renders', String(e?.message || e).slice(0, 300)) }
  if (project) {
    const locked = await html((MetricsHub as any)({ projectId: project.id, published: false }))
    ok(locked.includes('libera quando você publicar') && locked.includes('blur'), 'not published: the card is there, blurred, with the reason')
    const live = await html((MetricsHub as any)({ projectId: project.id, published: true }))
    ok(live.includes('Resumo das análises') && live.includes('Abrir a central') && /visitantes/i.test(live), 'published: the card summarises the real numbers and opens the center')
    const pulses = await portfolio([project.id])
    ok((pulses.get(project.id)?.sessions || 0) > 0, `the dashboard has this page's week (${pulses.get(project.id)?.sessions} visits)`)
  } else console.log('SKIP  no published TEST analytics project (run run_all.sh first)')
  await db.feedback.delete({ where: { id: fb.id } })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
