// Server side of the agent: the neutral conversation is converted for Claude and for OpenAI-style providers, and the answers are read back.
// A fake server per provider checks the shape the real APIs require (tool_result pairing/order, tool_calls + tool messages...).
import * as esbuild from '/ui/node_modules/esbuild/lib/main.js'
import http from 'http'
import fs from 'fs'

const alias = { name: 'alias', setup(b) {
  b.onResolve({ filter: /^@\// }, async a => { const r = await b.resolve('./' + a.path.slice(2), { kind: a.kind, resolveDir: '/web/src' }); return r.errors.length ? { errors: r.errors } : { path: r.path } })
  b.onResolve({ filter: /^@funnelai\/db$/ }, () => ({ path: '/ui/stubs/funnelai-db.ts' }))
} }
await esbuild.build({ entryPoints: ['/web/src/lib/agent-llm.ts'], bundle: true, outfile: '/tmp/agent-llm.mjs', format: 'esm', platform: 'node', target: 'node20', plugins: [alias], nodePaths: ['/ui/node_modules'], logLevel: 'warning', external: ['node:*'] })
const L = await import('/tmp/agent-llm.mjs')

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   [' + String(detail).slice(0, 240) + ']')) }

// a conversation that went through two tool rounds
const convo = [
  { role: 'user', content: [{ type: 'text', text: 'PEDIDO: deixe premium' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Vou olhar a página.' }, { type: 'tool_use', id: 'call_1', name: 'find_elements', input: { kind: 'heading' } }, { type: 'tool_use', id: 'call_2', name: 'get_selection', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"count":1}' }, { type: 'tool_result', tool_use_id: 'call_2', content: '{"selected":null}', is_error: false }, { type: 'text', text: 'obs' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'call_3', name: 'check_page', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_3', content: 'Não deu certo', is_error: true }] },
]
const tools = [{ name: 'check_page', description: 'verifica', parameters: { type: 'object', properties: {} } }]

// ── conversion for OpenAI-style providers
const oa = L.toOpenAIMessages('SYS', convo)
ok('OpenAI: a primeira mensagem é o system', oa[0].role === 'system' && oa[0].content === 'SYS')
const a1 = oa[2]
ok('OpenAI: a mensagem do modelo leva o texto e as duas tool_calls com argumentos em string JSON', a1.role === 'assistant' && a1.content === 'Vou olhar a página.' && a1.tool_calls.length === 2 && a1.tool_calls[0].function.arguments === '{"kind":"heading"}' && a1.tool_calls[0].type === 'function', JSON.stringify(a1))
ok('OpenAI: cada resultado vira uma mensagem "tool" com o tool_call_id certo, antes do texto do usuário', oa[3].role === 'tool' && oa[3].tool_call_id === 'call_1' && oa[4].role === 'tool' && oa[4].tool_call_id === 'call_2' && oa[5].role === 'user' && oa[5].content === 'obs', JSON.stringify(oa.slice(3, 6)))
ok('OpenAI: assistente só com tool_calls tem content null (padrão) e "" no Gemini', oa[6].content === null && L.toOpenAIMessages('S', convo, { emptyAssistant: '' })[6].content === '')
ok('OpenAI: todo tool_call tem a sua resposta "tool" logo depois', (() => { const ids = new Set(); for (const m of oa) { if (m.tool_calls) m.tool_calls.forEach(c => ids.add(c.id)); if (m.role === 'tool') ids.delete(m.tool_call_id) } return ids.size === 0 })())

// ── conversion for Claude
const an = L.toAnthropicMessages(convo)
ok('Claude: no turno do usuário os tool_result vêm primeiro, depois o texto', an[2].content[0].type === 'tool_result' && an[2].content[1].type === 'tool_result' && an[2].content[2].type === 'text', JSON.stringify(an[2].content.map(b => b.type)))
ok('Claude: tool_use mantém id, name e input como objeto', an[1].content[1].type === 'tool_use' && an[1].content[1].id === 'call_1' && an[1].content[1].input.kind === 'heading')
ok('Claude: is_error só aparece quando verdadeiro', an[4].content[0].is_error === true && !('is_error' in an[2].content[0]))
ok('Claude: imagem de referência vira bloco base64 válido', L.toAnthropicMessages([{ role: 'user', content: [{ type: 'image', media_type: 'image/png', data: 'AAAA' }, { type: 'text', text: 'x' }] }])[0].content[0].source.media_type === 'image/png')

// ── reading the answers
const r1 = L.fromOpenAI({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: '', type: 'function', function: { name: 'set_styles', arguments: '{"css":{"color":"red"}}' } }, { id: 'x2', type: 'function', function: { name: 'set_text', arguments: '{"id": ' } }] } }], usage: { prompt_tokens: 100, completion_tokens: 20 } })
ok('OpenAI→neutro: duas chamadas, id gerado quando vem vazio, tokens lidos', r1.stop === 'tool_use' && r1.message.content.length === 2 && r1.message.content[0].id.length > 5 && r1.inTok === 100 && r1.outTok === 20, JSON.stringify(r1))
ok('OpenAI→neutro: argumentos com JSON quebrado viram __invalid_json (o agente devolve um erro legível ao modelo)', r1.message.content[1].input.__invalid_json !== undefined)
ok('OpenAI→neutro: resposta só de texto encerra; "length" é reconhecido', L.fromOpenAI({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }).stop === 'end' && L.fromOpenAI({ choices: [{ finish_reason: 'length', message: { content: 'cort' } }] }).stop === 'length')
const r2 = L.fromAnthropic({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'olhando' }, { type: 'tool_use', id: 'toolu_1', name: 'inspect_element', input: { id: 'abc' } }], usage: { input_tokens: 50, output_tokens: 9 } })
ok('Claude→neutro: texto + tool_use, stop e tokens', r2.stop === 'tool_use' && r2.message.content[1].input.id === 'abc' && r2.inTok === 50)
ok('Claude→neutro: max_tokens vira "length"', L.fromAnthropic({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'x' }] }).stop === 'length')

// ── a fake provider of each kind validates what it receives, and failover works
const seen = { oa: [], an: [] }
const mk = (kind, handler) => new Promise(res => { const s = http.createServer((req, rsp) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { const out = handler(JSON.parse(b || '{}'), req); rsp.writeHead(out.status || 200, { 'Content-Type': 'application/json', ...(out.headers || {}) }); rsp.end(JSON.stringify(out.body)) }) }); s.listen(0, '127.0.0.1', () => res(s)) })
const oaServer = await mk('oa', body => { seen.oa.push(body); return { body: { choices: [{ finish_reason: 'stop', message: { content: 'pronto' } }], usage: { prompt_tokens: 7, completion_tokens: 2 } } } })
const anServer = await mk('an', body => { seen.an.push(body); return { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'pronto' }], usage: { input_tokens: 5, output_tokens: 1 } } } })
const rateLimited = await mk('429', () => ({ status: 429, body: { error: { message: 'quota' } } }))
const prov = (id, preset, kind, port, path = '') => ({ id, preset, name: preset, kind, baseUrl: `http://127.0.0.1:${port}${path}`, model: 'm', key: 'k', enabled: true })
const t1 = await L.modelTurn([prov('a', 'groq', 'compat', oaServer.address().port, '/v1')], { system: 'SYS', messages: convo, tools })
ok('Servidor falso (OpenAI): recebe tools no formato function, tool_choice auto e as mensagens convertidas', seen.oa[0].tools[0].type === 'function' && seen.oa[0].tool_choice === 'auto' && seen.oa[0].messages[0].role === 'system' && seen.oa[0].max_tokens === 12000 && t1.message.content[0].text === 'pronto')
const t2 = await L.modelTurn([prov('b', 'anthropic', 'anthropic', anServer.address().port)], { system: 'SYS', messages: convo, tools })
ok('Servidor falso (Claude): recebe system, tools com input_schema, tool_choice auto', seen.an[0].system === 'SYS' && seen.an[0].tools[0].input_schema.type === 'object' && seen.an[0].tool_choice.type === 'auto' && t2.stop === 'end')
const t3 = await L.modelTurn([prov('c', 'groq', 'compat', rateLimited.address().port, '/v1'), prov('d', 'openrouter', 'compat', oaServer.address().port, '/v1')], { system: 'SYS', messages: convo, tools })
ok('Failover: o primeiro provedor estourou o limite (429) e o segundo assumiu no meio da conversa', t3.provider.id === 'd' && t3.message.content[0].text === 'pronto')
let threw = null
try { await L.modelTurn([prov('e', 'groq', 'compat', rateLimited.address().port, '/v1')], { system: 'S', messages: convo, tools }) } catch (e) { threw = e }
ok('Sem provedor que funcione: o erro volta com o código HTTP do provedor', threw && threw.status === 429, threw && threw.message)
// the wait the provider asks for: Gemini sends a LIST with RetryInfo, others a Retry-After header or "retry in Ns" in the text
const geminiLimit = await mk('g', () => ({ status: 429, body: [{ error: { code: 429, message: 'You exceeded your current quota.', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' }] } }] }))
const headerLimit = await mk('h', () => ({ status: 429, headers: { 'Retry-After': '7' }, body: { error: { message: 'slow down' } } }))
const textLimit = await mk('t', () => ({ status: 429, body: { error: { message: 'Rate limit reached. Please retry in 12.5s.' } } }))
const wait = async port => { try { await L.modelTurn([prov('w' + port, 'gemini', 'compat', port, '/v1')], { system: 'S', messages: convo, tools }) } catch (e) { return e } }
const eg = await wait(geminiLimit.address().port), eh = await wait(headerLimit.address().port), et = await wait(textLimit.address().port)
ok('Limite do Gemini: a espera pedida (lista com RetryInfo) é lida: 31s', eg && eg.status === 429 && eg.retryAfterMs === 31000, eg && eg.retryAfterMs)
ok('Limite com cabeçalho Retry-After: 7s', eh && eh.retryAfterMs === 7000, eh && eh.retryAfterMs)
ok('Limite com "retry in 12.5s" no texto: 12,5s', et && et.retryAfterMs === 12500, et && et.retryAfterMs)
;[oaServer, anServer, rateLimited, geminiLimit, headerLimit, textLimit].forEach(s => s.close())
console.log(`\n${pass}/${pass + fail} verificações passaram`)
process.exit(fail ? 1 : 0)
