import type { Snapshot } from './snapshot'

/**
 * Plain-language findings, written by rules from the real numbers of the period (never by guessing).
 * Each one carries the numbers it stands on, so the owner can check it. The AI layer (ai.ts) may rephrase and
 * prioritise them, but it is only ever given these facts.
 */
export interface Insight {
  id: string
  kind: 'resumo' | 'problema' | 'oportunidade' | 'sugestao' | 'teste'
  severity: 'alta' | 'media' | 'baixa'
  title: string
  text: string
  evidence: string[]
  page?: string
}

const n = (v: number) => Math.round(v).toLocaleString('pt-BR')
const p = (v: number, d = 1) => `${(Math.round(v * 10 ** d) / 10 ** d).toLocaleString('pt-BR', { maximumFractionDigits: d })}%`
const x = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}x`
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const delta = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null)

export function buildInsights(s: Snapshot): Insight[] {
  const out: Insight[] = []
  const t = s.totals
  const add = (i: Insight) => out.push(i)

  if (t.sessions === 0) {
    add({ id: 'empty', kind: 'resumo', severity: 'baixa', title: 'Ainda sem visitas neste período', text: 'Assim que alguém abrir a página publicada, os números e as dicas aparecem aqui.', evidence: [] })
    return out
  }

  // summary
  const dv = delta(t.visitors, s.previous.visitors)
  add({
    id: 'summary', kind: 'resumo', severity: 'baixa',
    title: `${n(t.visitors)} ${t.visitors === 1 ? 'visitante' : 'visitantes'} e ${p(t.conversionRate)} de conversão`,
    text: `A página recebeu ${n(t.visitors)} visitantes em ${n(t.sessions)} visitas. ${n(t.conversions)} converteram (${p(t.conversionRate)}) e ${n(t.leads)} viraram lead.` +
      (dv !== null ? ` Em relação ao período anterior, as visitas ${dv >= 0 ? 'subiram' : 'caíram'} ${p(Math.abs(dv))}.` : ''),
    evidence: [`visitas: ${n(t.sessions)}`, `tempo médio ativo: ${clock(t.avgActiveSec)}`, `rolagem média: ${p(t.avgScroll)}`],
  })
  if (t.sessions < 30) {
    add({ id: 'few', kind: 'sugestao', severity: 'baixa', title: 'Ainda são poucas visitas', text: 'Com menos de 30 visitas os percentuais mudam muito de um dia para o outro. Use as dicas como pista, não como certeza.', evidence: [`visitas no período: ${n(t.sessions)}`] })
  }
  const enough = t.sessions >= 30

  // bounce
  if (enough && t.bounceRate >= 50) {
    add({ id: 'bounce', kind: 'problema', severity: t.bounceRate >= 70 ? 'alta' : 'media', title: `${p(t.bounceRate)} saem sem fazer nada`, text: 'Mais da metade abre a página e vai embora sem clicar, rolar nem assistir. Costuma ser promessa do anúncio diferente do que a pessoa vê, página lenta ou o topo que não prende.', evidence: [`saídas sem interação: ${p(t.bounceRate)}`, `rolagem média: ${p(t.avgScroll)}`] })
  }

  // abandon before the main button
  if (enough && t.ctaSessions >= 0) {
    const before = ((t.sessions - t.ctaSessions) / t.sessions) * 100
    if (before >= 60) {
      const worst = s.abandon[0]
      add({
        id: 'cta', kind: 'problema', severity: before >= 80 ? 'alta' : 'media',
        title: `${p(before)} abandonam antes do botão principal`,
        text: `Só ${p(100 - before)} das visitas chegam a clicar em algum botão de ação.` + (worst ? ` Em "${worst.slug}", quem sai para em média em ${p(worst.avgScrollAtExit)} da página.` : ''),
        evidence: [`visitas com clique no botão: ${n(t.ctaSessions)} de ${n(t.sessions)}`], page: worst?.slug,
      })
    }
  }

  // video
  const v = s.videos.find(a => !a.embedded && a.plays > 0)
  const r = s.retention
  if (v && v.seen >= 20 && v.playRate < 45) {
    add({ id: 'play', kind: 'problema', severity: v.playRate < 25 ? 'alta' : 'media', title: `Só ${p(v.playRate)} apertam play no vídeo`, text: 'A maioria vê o vídeo e não começa. Vale testar uma capa mais forte, uma frase curta acima do vídeo dizendo o que a pessoa ganha, ou começar com o som já ligado.', evidence: [`${n(v.plays)} de ${n(v.seen)} visitas em que o vídeo apareceu`], page: v.slug || undefined })
  }
  if (r && r.starters >= 10) {
    const worst = [...r.drops].sort((a, b) => b.lost - a.lost)[0]
    if (worst && worst.lost >= 8) {
      add({ id: 'drop', kind: 'problema', severity: worst.lost >= 20 ? 'alta' : 'media', title: `${p(worst.lost)} da audiência sai entre ${clock(worst.from)} e ${clock(worst.to)}`, text: 'É o trecho do vídeo em que mais gente desiste. Reveja o que é dito aí: costuma ser enrolação, uma promessa que demora ou uma mudança brusca de assunto.', evidence: [`antes do trecho: ${p(worst.atStart)} ainda assistindo`, `espectadores medidos: ${n(r.starters)}`], page: v?.slug || undefined })
    }
    const half = r.curve.find(c => c.pct <= 50 && c.s > 0)
    if (half && half.s >= 10) {
      add({ id: 'cta-time', kind: 'sugestao', severity: 'media', title: `Mostre o botão antes de ${clock(half.s)}`, text: `Aos ${clock(half.s)} metade de quem começou o vídeo já saiu. Quem ainda está lá nesse ponto é quem pode comprar, então o botão deve aparecer antes.`, evidence: [`aos ${clock(half.s)}: ${p(half.pct)} ainda assistindo`], page: v?.slug || undefined })
    }
    const low = r.byWatched.find(b => b.label === 'até 25%')
    const high = [...r.byWatched].reverse().find(b => b.sessions >= 5 && b.label !== 'até 25%')
    if (low && high && low.sessions >= 5 && low.rate > 0 && high.rate / low.rate >= 1.5) {
      add({ id: 'watch-lift', kind: 'oportunidade', severity: 'alta', title: `Quem assiste ${high.label.replace('ou mais', '').trim()} converte ${x(high.rate / low.rate)} mais`, text: 'O vídeo trabalha a favor da venda: quanto mais a pessoa assiste, mais ela converte. Qualquer coisa que faça mais gente assistir até o fim (começo mais forte, vídeo mais curto) deve aumentar as vendas.', evidence: [`${high.label}: ${p(high.rate)} convertem (${n(high.sessions)} visitas)`, `até 25%: ${p(low.rate)} convertem (${n(low.sessions)} visitas)`], page: v?.slug || undefined })
    }
  }

  // clicks that go nowhere
  const rage = s.friction.items.find(i => i.kind === 'rage' && i.sessions >= 2)
  if (rage) add({ id: 'rage', kind: 'problema', severity: rage.sessions >= 5 ? 'alta' : 'media', title: `Cliques repetidos em ${rage.text ? `"${rage.text}"` : 'um elemento'}`, text: 'Várias pessoas apertaram esse ponto de novo e de novo. Normalmente é algo que parece botão e não é, ou um botão que demora a responder.', evidence: [`${n(rage.sessions)} visitas, ${n(rage.clicks)} cliques`], page: rage.slug || undefined })
  const dead = s.friction.items.find(i => i.kind === 'dead' && i.sessions >= 3)
  if (dead) add({ id: 'dead', kind: 'problema', severity: 'media', title: `Clique sem resposta em ${dead.text ? `"${dead.text}"` : 'um elemento'}`, text: 'A pessoa clicou esperando que algo acontecesse e nada aconteceu. Transforme em link ou botão de verdade, ou tire a aparência de clicável.', evidence: [`${n(dead.sessions)} visitas, ${n(dead.clicks)} cliques`], page: dead.slug || undefined })

  // sources
  const sources = s.sources.filter(a => a.sessions >= 20)
  if (sources.length >= 2 && t.conversionRate > 0) {
    const best = [...sources].sort((a, b) => b.conversionRate - a.conversionRate)[0]
    if (best.conversionRate >= t.conversionRate * 1.4 && best.conversions >= 2) {
      add({ id: 'best-source', kind: 'oportunidade', severity: 'alta', title: `${best.label} converte ${x(best.conversionRate / t.conversionRate)} mais que a média`, text: `A origem ${best.label} traz ${p(best.share)} das visitas e converte ${p(best.conversionRate)}, contra ${p(t.conversionRate)} do total. Vale colocar mais verba ou esforço nela.`, evidence: [`${best.label}: ${n(best.sessions)} visitas, ${n(best.conversions)} conversões`] })
    }
    const worst = [...sources].sort((a, b) => a.conversionRate - b.conversionRate)[0]
    if (worst.key !== best.key && worst.share >= 20 && worst.conversionRate <= t.conversionRate * 0.5) {
      add({ id: 'worst-source', kind: 'problema', severity: 'media', title: `${worst.label} traz muita visita e converte pouco`, text: `${p(worst.share)} do tráfego vem de ${worst.label}, mas só ${p(worst.conversionRate)} convertem (a média é ${p(t.conversionRate)}). O público ou a promessa desse anúncio pode estar desalinhado com a página.`, evidence: [`${worst.label}: ${n(worst.sessions)} visitas, ${n(worst.conversions)} conversões`] })
    }
  }
  const camps = s.campaigns.filter(a => a.sessions >= 20 && a.key !== '(sem campanha)')
  if (camps.length >= 2) {
    const [a, b] = [...camps].sort((m, k) => k.conversionRate - m.conversionRate)
    if (a && b && a.conversionRate > 0 && a.conversionRate >= b.conversionRate * 1.5) {
      add({ id: 'campaigns', kind: 'oportunidade', severity: 'media', title: `Campanha "${a.label}" supera a "${b.label}"`, text: `${a.label} converte ${p(a.conversionRate)} e ${b.label} converte ${p(b.conversionRate)}. Passe a verba para a melhor ou descubra o que a melhor tem de diferente.`, evidence: [`${a.label}: ${n(a.sessions)} visitas`, `${b.label}: ${n(b.sessions)} visitas`] })
    }
  }

  // device
  const mob = s.devices.find(d => d.key === 'mobile'), desk = s.devices.find(d => d.key === 'desktop')
  if (mob && desk && mob.sessions >= 30 && desk.sessions >= 30 && desk.conversionRate > 0 && mob.conversionRate < desk.conversionRate * 0.6) {
    add({ id: 'mobile', kind: 'problema', severity: 'alta', title: 'No celular converte bem menos que no computador', text: `No celular ${p(mob.conversionRate)} convertem, no computador ${p(desk.conversionRate)}. Como ${p(mob.share)} das visitas vêm do celular, é aí que está o dinheiro perdido. Confira a página no celular: botões, tamanho do texto e velocidade.`, evidence: [`celular: ${n(mob.sessions)} visitas`, `computador: ${n(desk.sessions)} visitas`] })
  }

  // scroll and exits
  if (enough && t.avgScroll < 40) {
    add({ id: 'scroll', kind: 'sugestao', severity: 'media', title: `Em média só ${p(t.avgScroll)} da página é vista`, text: 'Pouca gente rola até o fim. O que for mais importante (oferta, botão, garantia) precisa estar mais acima.', evidence: [`rolagem média: ${p(t.avgScroll)}`] })
  }
  const exitPage = s.pages.filter(a => a.views >= 30).sort((a, b) => b.exitRate - a.exitRate)[0]
  if (exitPage && exitPage.exitRate >= 65 && s.pages.length > 1) {
    add({ id: 'exit-page', kind: 'problema', severity: 'media', title: `${p(exitPage.exitRate)} terminam a visita em "${exitPage.slug}"`, text: 'É a página com a maior taxa de saída. Se ela não é a última etapa do caminho, é aqui que o funil vaza.', evidence: [`${n(exitPage.exits)} saídas em ${n(exitPage.views)} aberturas`], page: exitPage.slug })
  }

  // the step of the funnel that loses the most
  const worstStep = s.steps.slice(1).filter(st => st.lost >= 10).sort((a, b) => a.ofPrev - b.ofPrev)[0]
  if (worstStep && worstStep.ofPrev < 40) {
    add({ id: 'step', kind: 'problema', severity: 'alta', title: `Maior perda: "${worstStep.label}"`, text: `Só ${p(worstStep.ofPrev)} de quem estava na etapa anterior chega aqui.` + (worstStep.lostAt ? ` A maioria dos que ficam para trás encerra a visita em "${worstStep.lostAt.slug}".` : ''), evidence: [`${n(worstStep.count)} chegaram, ${n(worstStep.lost)} ficaram pelo caminho`], page: worstStep.lostAt?.slug })
  }

  // speed: what the page costs in people
  const sp = s.audience.speed
  if (sp.measured >= 10 && sp.lcp.p75 > 3000) {
    const fast = sp.buckets.filter(b => b.label.startsWith('Rápida') || b.label.startsWith('Boa')), slow = sp.buckets.filter(b => b.label.startsWith('Lenta') || b.label.startsWith('Muito'))
    const f = fast.reduce((a, b) => a + b.sessions, 0), l = slow.reduce((a, b) => a + b.sessions, 0)
    const fb = f ? fast.reduce((a, b) => a + b.bounceRate * b.sessions, 0) / f : 0, lb = l ? slow.reduce((a, b) => a + b.bounceRate * b.sessions, 0) / l : 0
    add({ id: 'speed', kind: 'problema', severity: sp.lcp.p75 > 4500 ? 'alta' : 'media', title: `A página leva ${(sp.lcp.p75 / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s para aparecer para 3 em cada 4 pessoas`,
      text: 'Acima de 2,5 s o visitante de anúncio já começa a desistir.' + (l >= 5 && lb > fb + 10 ? ` Entre quem esperou mais de 2,5 s, ${p(lb)} saíram sem fazer nada, contra ${p(fb)} de quem viu rápido.` : '') + ' Imagens grandes, vídeo carregando cedo demais e scripts de terceiros são as causas mais comuns.',
      evidence: [`${n(sp.measured)} visitas medidas`, `só ${p(sp.goodShare)} abriram em até 2,5 s`] })
  }
  // the app the link is opened in
  const apps = s.audience.inApp
  const normal = apps.find(a => a.key === 'Navegador normal')
  const inApps = apps.filter(a => a.key !== 'Navegador normal' && a.sessions >= 10)
  for (const a of inApps.slice(0, 2)) {
    if (normal && normal.sessions >= 10 && a.share >= 20 && a.conversionRate < normal.conversionRate * 0.6) {
      add({ id: `inapp-${a.key}`, kind: 'problema', severity: 'media', title: `Quem abre dentro do ${a.key} converte bem menos`, text: `${p(a.share, 0)} das visitas vêm do navegador interno do ${a.key} e só ${p(a.conversionRate)} convertem, contra ${p(normal.conversionRate)} no navegador normal. Esses navegadores internos são lentos e bloqueiam pagamentos e pop-ups: teste a página dentro do app e deixe o botão de compra mais direto.`, evidence: [`${a.key}: ${n(a.sessions)} visitas`, `navegador normal: ${n(normal.sessions)} visitas`] })
    }
  }
  // when
  const byHour = new Map<number, { s: number; c: number }>()
  for (const h of s.audience.hours) { const v = byHour.get(h.hour) || { s: 0, c: 0 }; v.s += h.sessions; v.c += h.conversions; byHour.set(h.hour, v) }
  const topHour = [...byHour.entries()].filter(([, v]) => v.c >= 3).sort((a, b) => b[1].c - a[1].c)[0]
  if (enough && t.sessions >= 30 && topHour) {
    add({ id: 'hour', kind: 'oportunidade', severity: 'baixa', title: `A hora que mais converte é ${String(topHour[0]).padStart(2, '0')}h`, text: `${n(topHour[1].c)} das ${n(t.conversions)} conversões aconteceram nessa hora (horário de Brasília). Veja se os anúncios podem ganhar mais verba perto desse horário.`, evidence: [`${n(topHour[1].s)} visitas nessa hora`] })
  }
  // who the best leads are
  const hot = s.audience.score.profile.find(x => x.lift >= 1.5 && x.hotShare >= 25)
  if (hot && s.audience.score.hot >= 3) {
    add({ id: 'hotprofile', kind: 'oportunidade', severity: 'media', title: `Seus leads mais quentes vêm muito de: ${hot.key} (${hot.dim.toLowerCase()})`, text: `${p(hot.hotShare, 0)} das visitas quentes têm essa característica, mas ela é só ${p(hot.allShare, 0)} do total (${x(hot.lift)} mais frequente). É o público que mais se parece com um cliente: vale mirar anúncios nele.`, evidence: [`${n(s.audience.score.hot)} visitas quentes de ${n(t.sessions)}`] })
  }

  // tests
  for (const e of s.experiments) {
    const lead = e.variants.find(a => a.confidence !== null && a.confidence >= 95)
    if (lead) add({ id: `exp-${e.id}`, kind: 'teste', severity: 'alta', title: `Teste "${e.name}": ${lead.name} está ganhando`, text: `${lead.name} converte ${p(lead.conversionRate)}${lead.lift !== null ? ` (${lead.lift >= 0 ? '+' : ''}${p(lead.lift)} sobre a original)` : ''} com ${p(lead.confidence || 0)} de confiança. Já dá para encerrar e usar essa versão.`, evidence: e.variants.map(a => `${a.name}: ${n(a.sessions)} visitas, ${p(a.conversionRate)}`) })
    else if (!e.enough) add({ id: `exp-${e.id}`, kind: 'teste', severity: 'baixa', title: `Teste "${e.name}" ainda juntando dados`, text: 'Cada versão precisa de pelo menos 100 visitas antes de dar para dizer qual é melhor.', evidence: e.variants.map(a => `${a.name}: ${n(a.sessions)} visitas`) })
  }

  const order = { alta: 0, media: 1, baixa: 2 } as const
  const kinds = { resumo: 0, problema: 1, oportunidade: 2, sugestao: 3, teste: 4 } as const
  return out.sort((a, b) => kinds[a.kind] === 0 || kinds[b.kind] === 0 ? kinds[a.kind] - kinds[b.kind] : order[a.severity] - order[b.severity] || kinds[a.kind] - kinds[b.kind])
}
