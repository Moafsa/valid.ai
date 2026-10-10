/** The AI providers the admin can connect. Pure data, safe to import from client components. */
export interface AiPreset {
  id: string
  name: string
  kind: 'anthropic' | 'compat'
  free: boolean
  /** compat: everything before "/chat/completions" · anthropic: the host (the code adds /v1/messages) */
  baseUrl: string
  model: string
  keyHint: string
  placeholder: string
  note: string
  tint: string
  /** words to look for (in order) when picking the best model from the provider's real list */
  prefer: string[]
}

export const AI_PRESETS: AiPreset[] = [
  { id: 'anthropic', name: 'Claude (Anthropic)', kind: 'anthropic', free: false, baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', keyHint: 'console.anthropic.com → API Keys → Create Key', placeholder: 'sk-ant-...', note: 'Melhor qualidade · o mais caro (estimativa: R$ 0,10 a R$ 0,50 por pedido)', tint: 'bg-orange-500/15 text-orange-300', prefer: ['sonnet-5','sonnet','opus','haiku'] },
  { id: 'openai', name: 'OpenAI', kind: 'compat', free: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', keyHint: 'platform.openai.com → API Keys', placeholder: 'sk-...', note: 'GPT-4o · pago por uso', tint: 'bg-white/10 text-gray-300', prefer: ['gpt-4o','gpt-4.1','gpt-5','mini'] },
  { id: 'groq', name: 'Groq', kind: 'compat', free: true, baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'console.groq.com → API Keys', placeholder: 'gsk_...', note: 'Muito rápido · plano grátis com limite diário', tint: 'bg-emerald-500/15 text-emerald-300', prefer: ['llama-3.3-70b','gpt-oss-120b','llama-3.1-70b','llama','qwen','gpt-oss'] },
  { id: 'gemini', name: 'Google Gemini', kind: 'compat', free: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyHint: 'aistudio.google.com → Get API key', placeholder: 'AIza...', note: 'Boa qualidade · cota grátis generosa', tint: 'bg-blue-500/15 text-blue-300', prefer: ['gemini-2.5-flash','gemini-2.0-flash','flash','pro'] },
  { id: 'openrouter', name: 'OpenRouter', kind: 'compat', free: true, baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-3-super-120b-a12b:free', keyHint: 'openrouter.ai → Keys', placeholder: 'sk-or-...', note: 'Vários modelos · os que terminam em :free não cobram (a lista muda sempre)', tint: 'bg-violet-500/15 text-violet-300', prefer: ['nemotron-3-super','nemotron','gemma-4-31b','gemma','llama','qwen'] },
  { id: 'nvidia', name: 'NVIDIA Build', kind: 'compat', free: true, baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'nvidia/nemotron-3-super-120b-a12b', keyHint: 'build.nvidia.com → Get API Key', placeholder: 'nvapi-...', note: 'Créditos grátis para testar', tint: 'bg-green-500/15 text-green-300', prefer: ['nemotron-3-super','nemotron-ultra','nemotron','llama-3.3','llama','mistral-large'] },
  { id: 'huggingface', name: 'Hugging Face', kind: 'compat', free: true, baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.3-70B-Instruct', keyHint: 'huggingface.co/settings/tokens → New token', placeholder: 'hf_...', note: 'Uso gratuito limitado', tint: 'bg-yellow-500/15 text-yellow-300', prefer: ['Llama-3.3-70B','Qwen2.5-72B','Llama','Qwen'] },
  { id: 'cerebras', name: 'Cerebras', kind: 'compat', free: true, baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', keyHint: 'cloud.cerebras.ai → API Keys', placeholder: 'csk-...', note: 'Rapidíssimo · plano grátis', tint: 'bg-pink-500/15 text-pink-300', prefer: ['llama-3.3-70b','gpt-oss','llama','qwen'] },
  { id: 'mistral', name: 'Mistral', kind: 'compat', free: true, baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', keyHint: 'console.mistral.ai → API Keys', placeholder: 'chave da Mistral', note: 'Plano grátis para experimentar', tint: 'bg-amber-500/15 text-amber-300', prefer: ['mistral-small','mistral-medium','mistral-large','open-mistral'] },
  { id: 'deepseek', name: 'DeepSeek', kind: 'compat', free: false, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyHint: 'platform.deepseek.com → API keys', placeholder: 'sk-...', note: 'Pago, bem barato (estimativa: menos de R$ 0,02 por pedido)', tint: 'bg-cyan-500/15 text-cyan-300', prefer: ['deepseek-chat','chat'] },
  { id: 'custom', name: 'Outro (compatível com OpenAI)', kind: 'compat', free: false, baseUrl: '', model: '', keyHint: 'A chave que o serviço te der', placeholder: 'sua chave', note: 'Qualquer serviço que fale o formato da OpenAI: informe o endereço e o modelo', tint: 'bg-white/10 text-gray-300', prefer: [] },
]

export const presetOf = (id: string) => AI_PRESETS.find(p => p.id === id)
