import { interpretLocally } from '@/lib/visual-editor/ai-engine'
const phrases = [
  'troque o fundo para preto', 'muda o fundo pra azul escuro', 'deixe essa página mais premium', 'deixe tudo mais moderno e limpo',
  'adicione uma seção de depoimentos', 'coloque um FAQ no final', 'inclua garantia de 7 dias', 'adiciona uma faixa de aviso no topo',
  'deixe todos os botões maiores e arredondados', 'mude todos os botões para verde', 'faça os botões com sombra', 'botões em pílula azul',
  'aumente o tamanho dos títulos', 'centralize os títulos', 'deixe o texto branco', 'troque a cor dos títulos para dourado',
  'arredonde as imagens', 'remova todos os botões', 'apague essa seção', 'mude o título para "Compre agora e economize"',
  'modo escuro', 'mais espaço entre as seções', 'deixe mais parecida com a referência', 'faz um café',
  'coloque um botão de whatsapp', 'adicione um vídeo', 'crie um formulário de contato', 'adicione contagem regressiva',
]
const out: string[] = []
for (const p of phrases) {
  const r = interpretLocally(p, { hasSelection: false, sections: 8 })
  out.push(`${r.understood ? 'OK ' : '-- '} ${p}  =>  ${r.operations.map(o => o.op + (o.block ? ':' + o.block : '') + (o.css ? '(' + Object.keys(o.css).join(',') + ')' : '')).join(' | ') || r.reply.slice(0, 40)}`)
}
console.log(out.join('\n'))
