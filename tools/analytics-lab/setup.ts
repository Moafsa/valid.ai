// A test project for the analytics center: a VSL page (video + button + a form + things that do not respond),
// its B version, a thank-you page, published at /s/<slug>. Prints the ids as JSON so the traffic simulator can use them.
//   run through run.sh (real lib code against the database)
import { db } from '@funnelai/db'
import { publishProject } from '@/lib/publish'

const VIDEO = process.env.VIDEO_URL || 'http://172.18.0.1:8099/analytics/vsl.webm'

const filler = Array.from({ length: 14 }, (_, i) => `<section class="blk" id="sec${i}" style="padding:60px 20px;border-top:1px solid #eee"><h3>Seção ${i + 1}</h3><p>Texto de exemplo para a seção ${i + 1}. Este parágrafo existe só para dar altura à página e permitir medir até onde as pessoas rolam.</p></section>`).join('')

const home = (headline: string, cta: string) => `
<section style="padding:40px 20px;max-width:760px;margin:0 auto;font-family:system-ui,sans-serif">
  <h1 id="headline" style="font-size:34px;line-height:1.15">${headline}</h1>
  <p style="color:#555">Assista ao vídeo abaixo até o final.</p>
  <div id="vsl" data-vai-player='${JSON.stringify({ src: VIDEO, start: 'click', bar: 'full', pause: 'free', seek: true, resume: false })}' style="position:relative;width:100%;aspect-ratio:16/9;margin-bottom:28px;background:#000"></div>
  <div style="margin:24px 0">
    <button id="cta" data-vai-next="obrigado" style="background:#16a34a;color:#fff;border:0;border-radius:8px;padding:16px 28px;font-size:18px;cursor:pointer">${cta}</button>
    <a id="checkout" href="https://pay.hotmart.com/TEST123" style="margin-left:16px;color:#2563eb">Ir para o checkout</a>
  </div>
  <div id="fake" style="cursor:pointer;padding:12px;background:#f3f4f6;border-radius:8px;margin:16px 0">Ver bônus exclusivo</div>
  <form id="lead" style="margin:24px 0;display:flex;gap:8px"><input name="email" type="email" placeholder="seu melhor e-mail" style="flex:1;padding:12px;border:1px solid #ccc;border-radius:6px"><button type="submit" id="send" style="padding:12px 20px;border:0;background:#111;color:#fff;border-radius:6px">Receber</button></form>
</section>${filler}`

const thanks = `<section style="padding:80px 20px;max-width:640px;margin:0 auto;font-family:system-ui,sans-serif"><h1 id="thanks">Obrigado!</h1><p>Seu pedido foi recebido.</p></section>`

const shell = { html: { lang: 'pt-BR' }, body: { style: 'margin:0' }, wrappers: [{ tag: 'div', attrs: { id: 'app' } }], viewport: 'width=device-width, initial-scale=1', title: 'Teste analytics', fontLinks: [] }

async function main() {
  const workspace = (await db.workspace.findFirst({ where: { id: 'lab_workspace_internal' } })) ?? (await db.workspace.findFirst())
  if (!workspace) throw new Error('no workspace')
  const tag = Date.now().toString(36)
  const slug = `an-${tag}`
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: `TEST analytics ${tag}`, sourceUrl: 'http://example.test/vsl', status: 'READY' } })
  const mk = async (name: string, s: string, order: number, html: string) =>
    db.page.create({ data: { projectId: project.id, name, slug: s, order, blocks: [{ id: `b-${s}`, order: 0, type: 'html', generatedHtml: html }] as any, customCss: 'body{margin:0;background:#fff;color:#111}', shell: shell as any } })
  await mk('Home', 'home', 0, home('Aprenda a vender mais em 7 dias', 'Quero comprar agora'))
  await mk('Home B', 'home-b', 1, home('O método que dobra suas vendas em 7 dias', 'Garantir minha vaga'))
  await mk('Obrigado', 'obrigado', 2, thanks)
  await publishProject(project.id, slug)
  console.log('STATE ' + JSON.stringify({ projectId: project.id, slug, video: VIDEO }))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
