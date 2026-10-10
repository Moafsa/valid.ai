/**
 * The shape of a funnel, worked out from its steps: which step leads to which, where it ends, what is wrong
 * with it. Pure functions (no I/O) so the dashboard can lay the map out and run its health checks in the browser.
 */
import type { FlowLink, FlowRule } from '@/lib/clone-flow'

export interface StepIn {
  slug: string
  name: string
  links: FlowLink[]
  rules: FlowRule[]
}

export interface GEdge {
  from: string
  /** a step slug */
  to: string
  kind: 'button' | 'answer' | 'auto' | 'rule'
  label: string
  /** the link inside the step this edge comes from (for editing) */
  linkIdx?: number
  back?: boolean
}

export interface Exit {
  from: string
  url: string
  host: string
  label: string
  kind: FlowLink['kind'] | 'rule'
  linkIdx?: number
  ruleId?: string
}

export interface GNode {
  slug: string
  name: string
  index: number
  layer: number
  row: number
  x: number
  y: number
  outs: GEdge[]
  ins: GEdge[]
  exits: Exit[]
  /** buttons that go nowhere */
  idle: number
  reachable: boolean
  isEntry: boolean
}

export type Severity = 'error' | 'warn' | 'info'
export interface Issue {
  id: string
  severity: Severity
  title: string
  detail: string
  steps: string[]
  /** a one-click fix the dashboard knows how to offer */
  fix?: 'replace-origin'
}

export interface FlowGraph {
  nodes: GNode[]
  edges: GEdge[]
  exits: Exit[]
  issues: Issue[]
  width: number
  height: number
  stats: { steps: number; paths: number | '9999+'; longest: number; branches: number; exits: number; loops: number; unreachable: number }
}

export const NODE_W = 150
export const NODE_H = 286
const GAP_X = 96
const GAP_Y = 44

const hostOf = (url: string) => {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url.slice(0, 40) }
}

const rootDomain = (h: string) => h.split('.').slice(-2).join('.')

export function buildGraph(steps: StepIn[], originHost?: string | null): FlowGraph {
  const bySlug = new Map(steps.map((s, i) => [s.slug, i]))
  const nodes: GNode[] = steps.map((s, i) => ({
    slug: s.slug, name: s.name, index: i, layer: 0, row: 0, x: 0, y: 0, outs: [], ins: [], exits: [], idle: 0, reachable: i === 0, isEntry: i === 0,
  }))
  const edges: GEdge[] = []
  const exits: Exit[] = []

  for (const [i, s] of steps.entries()) {
    const node = nodes[i]
    for (const l of s.links) {
      const t = (l.target || '').trim()
      if (!t) { node.idle++; continue }
      const isUrl = /^https?:\/\//i.test(t)
      if (isUrl) {
        const e: Exit = { from: s.slug, url: t, host: hostOf(t), label: l.label, kind: l.kind, linkIdx: l.idx }
        node.exits.push(e); exits.push(e)
      } else if (bySlug.has(t)) {
        const e: GEdge = { from: s.slug, to: t, kind: l.kind === 'goto' ? 'answer' : l.kind === 'auto' ? 'auto' : 'button', label: l.label, linkIdx: l.idx }
        edges.push(e)
      } else {
        node.idle++
      }
    }
    for (const r of s.rules) {
      const t = (r.goto || '').trim()
      if (!t) continue
      if (/^https?:\/\//i.test(t)) {
        const e: Exit = { from: s.slug, url: t, host: hostOf(t), label: r.trigger, kind: 'rule', ruleId: r.id }
        node.exits.push(e); exits.push(e)
      } else if (bySlug.has(t)) {
        edges.push({ from: s.slug, to: t, kind: 'rule', label: r.trigger })
      }
    }
  }

  // ── layers: longest path from the entry, ignoring edges that loop back ──
  const out = new Map<string, GEdge[]>()
  for (const e of edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from)!.push(e) }
  const state = new Map<string, 0 | 1 | 2>() // 1 = on the DFS stack
  const back = new Set<GEdge>()
  const order: string[] = []
  const dfs = (slug: string) => {
    state.set(slug, 1)
    for (const e of out.get(slug) || []) {
      const st = state.get(e.to) || 0
      if (st === 1) { back.add(e); e.back = true }
      else if (st === 0) dfs(e.to)
    }
    state.set(slug, 2)
    order.push(slug)
  }
  // iterative guard: funnels can be hundreds of steps deep
  const stackDepthSafe = steps.length < 3000
  if (stackDepthSafe && steps.length) dfs(steps[0].slug)
  else if (steps.length) { // very deep: plain BFS layering, no loop info
    state.set(steps[0].slug, 2)
  }
  const reach = new Set(state.keys())
  for (const n of nodes) n.reachable = reach.has(n.slug) || n.isEntry

  const topo = [...order].reverse()
  const layer = new Map<string, number>()
  for (const slug of topo) layer.set(slug, layer.get(slug) ?? 0)
  for (const slug of topo) {
    for (const e of out.get(slug) || []) {
      if (e.back || !reach.has(e.to)) continue
      layer.set(e.to, Math.max(layer.get(e.to) ?? 0, (layer.get(slug) ?? 0) + 1))
    }
  }
  if (!stackDepthSafe) steps.forEach((s, i) => layer.set(s.slug, i))
  let maxLayer = Math.max(0, ...[...layer.values()])
  for (const n of nodes) {
    if (!reach.has(n.slug) && !n.isEntry) layer.set(n.slug, maxLayer + 1)
    n.layer = layer.get(n.slug) ?? 0
  }
  maxLayer = Math.max(0, ...nodes.map(n => n.layer))

  // ── rows: order inside each layer by where its parents are ──
  const cols: GNode[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of nodes) cols[n.layer].push(n)
  cols.forEach(c => c.sort((a, b) => a.index - b.index))
  const nodeBy = new Map(nodes.map(n => [n.slug, n]))
  for (const e of edges) { nodeBy.get(e.to)!.ins.push(e); nodeBy.get(e.from)!.outs.push(e) }
  const setRows = () => cols.forEach(c => c.forEach((n, i) => { n.row = i }))
  setRows()
  for (let pass = 0; pass < 3; pass++) {
    // down: by the mean row of the parents; up: by the mean row of the children
    const down = pass % 2 === 0
    const seq = down ? cols.slice(1) : cols.slice(0, -1).reverse()
    for (const col of seq) {
      const key = (n: GNode) => {
        const rel = (down ? n.ins : n.outs).filter(e => !e.back).map(e => nodeBy.get(down ? e.from : e.to)!).filter(m => m.layer !== n.layer)
        return rel.length ? rel.reduce((s, m) => s + m.row, 0) / rel.length : n.row
      }
      col.sort((a, b) => key(a) - key(b) || a.index - b.index)
      col.forEach((n, i) => { n.row = i })
    }
  }
  for (const n of nodes) {
    n.x = n.layer * (NODE_W + GAP_X)
    n.y = n.row * (NODE_H + GAP_Y)
  }
  const width = (maxLayer + 1) * (NODE_W + GAP_X) - GAP_X
  const height = Math.max(1, ...cols.map(c => c.length)) * (NODE_H + GAP_Y) - GAP_Y

  // ── numbers ──
  const forward = new Map<string, Set<string>>()
  for (const e of edges) if (!e.back) { if (!forward.has(e.from)) forward.set(e.from, new Set()); forward.get(e.from)!.add(e.to) }
  const memo = new Map<string, number>()
  const CAP = 9999
  const countPaths = (slug: string): number => {
    if (memo.has(slug)) return memo.get(slug)!
    const nexts = forward.get(slug)
    let c = 0
    if (!nexts || nexts.size === 0) c = 1
    else for (const t of nexts) { c += countPaths(t); if (c > CAP) { c = CAP + 1; break } }
    memo.set(slug, c)
    return c
  }
  const paths = steps.length && stackDepthSafe ? countPaths(steps[0].slug) : 1
  const branches = nodes.filter(n => new Set(n.outs.filter(e => !e.back).map(e => e.to)).size >= 2).length
  const unreachable = nodes.filter(n => !n.reachable).length

  // ── health ──
  const issues: Issue[] = []
  const origin = (originHost || '').replace(/^www\./, '')
  if (origin) {
    const leaks = exits.filter(e => rootDomain(e.host) === rootDomain(origin))
    if (leaks.length) {
      issues.push({
        id: 'leak', severity: 'error', fix: 'replace-origin',
        title: `${leaks.length} ${leaks.length === 1 ? 'botão ainda leva' : 'botões ainda levam'} pro site original`,
        detail: `Quem clicar sai do seu funil e cai em ${origin}. Troque pelo link da sua oferta, checkout ou WhatsApp.`,
        steps: [...new Set(leaks.map(l => l.from))],
      })
    }
  }
  const idleSteps = nodes.filter(n => n.idle > 0)
  if (idleSteps.length) {
    const total = idleSteps.reduce((s, n) => s + n.idle, 0)
    issues.push({
      id: 'idle', severity: 'warn',
      title: `${total} ${total === 1 ? 'botão não leva' : 'botões não levam'} a lugar nenhum`,
      detail: 'Clicar neles não faz nada. Escolha pra onde cada um vai.',
      steps: idleSteps.map(n => n.slug),
    })
  }
  const dead = nodes.filter(n => n.reachable && n.index < steps.length - 1 && n.outs.length === 0 && n.exits.length === 0 && steps[n.index].rules.length === 0)
  if (dead.length) {
    issues.push({
      id: 'dead', severity: 'warn',
      title: `${dead.length} ${dead.length === 1 ? 'etapa termina' : 'etapas terminam'} sem saída`,
      detail: 'Quem chega nelas não tem pra onde ir. Ligue um botão à próxima etapa.',
      steps: dead.map(n => n.slug),
    })
  }
  if (unreachable) {
    issues.push({
      id: 'orphan', severity: 'info',
      title: `${unreachable} ${unreachable === 1 ? 'etapa que ninguém alcança' : 'etapas que ninguém alcança'}`,
      detail: 'Nenhum botão leva até elas a partir do começo do funil. Podem ser sobras ou páginas só de regra de saída.',
      steps: nodes.filter(n => !n.reachable).map(n => n.slug),
    })
  }
  if (steps.length > 1 && exits.length === 0) {
    issues.push({
      id: 'noexit', severity: 'warn',
      title: 'Nenhum botão leva pra uma oferta ou checkout',
      detail: 'O funil só anda entre as próprias etapas. Em algum ponto alguém precisa ir pra venda ou pro WhatsApp.',
      steps: [],
    })
  }
  const loops = back.size
  if (loops) {
    issues.push({
      id: 'loop', severity: 'info',
      title: `${loops} ${loops === 1 ? 'volta' : 'voltas'} pra uma etapa anterior`,
      detail: 'Tudo bem se for de propósito (corrigir resposta). Se não, o visitante pode ficar rodando.',
      steps: [...new Set([...back].map(e => e.from))],
    })
  }
  if (steps.length >= 18) {
    issues.push({
      id: 'long', severity: 'info',
      title: `Funil longo: ${steps.length} etapas`,
      detail: 'Quanto mais etapas, mais gente desiste no caminho. Veja nas métricas onde mais saem e pense em juntar perguntas.',
      steps: [],
    })
  }

  // longest simple-ish path (forward edges only)
  const depth = Math.max(0, ...nodes.filter(n => n.reachable).map(n => n.layer)) + 1
  return {
    nodes, edges, exits, issues, width, height,
    stats: { steps: steps.length, paths: paths > CAP ? '9999+' : paths, longest: depth, branches, exits: exits.length, loops, unreachable },
  }
}

/** Where an edge starts and ends on the canvas (right-middle of one card to left-middle of the other). */
export function edgePath(from: GNode, to: GNode, back: boolean): string {
  const x1 = from.x + NODE_W, y1 = from.y + 110
  const x2 = to.x, y2 = to.y + 110
  if (back || x2 <= x1) {
    // loops under both cards
    const low = Math.max(from.y, to.y) + NODE_H + 26
    return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x1 + 60} ${low}, ${(x1 + x2) / 2} ${low} S ${x2 - 60} ${y2}, ${x2} ${y2}`
  }
  const dx = Math.max(40, (x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
