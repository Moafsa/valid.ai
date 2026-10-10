/**
 * Browser side of "enviar vídeo": asks the app for a signed token, sends the file straight to the scanner (large files do not go
 * through the web app), then waits while the scanner cuts it into light HLS pieces in our storage. Resolves with the playlist address.
 */
export interface UploadedVideo { url: string; poster: string | null; ratio: number; seconds: number | null }
export interface UploadState { stage: 'sending' | 'optimizing'; pct?: number }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const MAX_BYTES = 2 * 1024 ** 3

export async function uploadVideo(projectId: string, file: File, on: (s: UploadState) => void): Promise<UploadedVideo> {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) throw new Error('Envie um arquivo de vídeo (.mp4, .mov ou .webm).')
  if (file.size > MAX_BYTES) throw new Error('Vídeo grande demais (máximo 2 GB).')

  const t = await fetch('/api/editor/video-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sizeBytes: file.size }) })
  const tj = await t.json().catch(() => ({}))
  if (!t.ok) throw new Error(tj.error || tj.message || 'Não deu para iniciar o envio.')
  const { token, base } = tj as { token: string; base: string }

  on({ stage: 'sending', pct: 0 })
  const jobId = await new Promise<string>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', `${base}/api/video/upload?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(file.name)}`)
    x.upload.onprogress = e => { if (e.lengthComputable) on({ stage: 'sending', pct: Math.round((e.loaded / e.total) * 100) }) }
    x.onload = () => {
      let d: any = {}
      try { d = JSON.parse(x.responseText) } catch { /* not json */ }
      if (x.status >= 200 && x.status < 300 && d.job_id) resolve(d.job_id)
      else reject(new Error(x.status === 413 ? 'Vídeo grande demais (máximo 2 GB).' : d.detail || 'Falha no envio. Tente de novo.'))
    }
    x.onerror = () => reject(new Error('A conexão caiu durante o envio. Tente de novo.'))
    x.send(file)
  })

  on({ stage: 'optimizing' })
  const started = Date.now()
  for (;;) {
    await sleep(2000)
    if (Date.now() - started > 40 * 60_000) throw new Error('A preparação do vídeo demorou demais. Tente um arquivo menor.')
    const r = await fetch(`${base}/api/video/job/${jobId}?token=${encodeURIComponent(token)}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.detail || 'Perdi o contato com o servidor de vídeo.')
    if (j.status === 'error') throw new Error(j.error || 'Não consegui preparar esse vídeo.')
    if (j.status === 'done' && j.result?.url) {
      const w = Number(j.result.width) || 0, h = Number(j.result.height) || 0
      const ratio = w > 0 && h > 0 ? Math.min(180, Math.max(30, Math.round((h / w) * 10000) / 100)) : 56.25
      return { url: j.result.url, poster: j.result.poster || null, ratio, seconds: j.result.seconds ?? null }
    }
    on({ stage: 'optimizing' })
  }
}
