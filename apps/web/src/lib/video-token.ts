import { createHmac } from 'node:crypto'

/** Short-lived permission to upload ONE video to ONE project straight to the scanner (see apps/scanner/routes/video_upload.py). */
export function signVideoToken(workspaceId: string, projectId: string, minutes = 45): string {
  const body = Buffer.from(JSON.stringify({ w: workspaceId, p: projectId, exp: Math.floor(Date.now() / 1000) + minutes * 60 })).toString('base64url')
  const sig = createHmac('sha256', process.env.SCANNER_SHARED_SECRET || '').update(body).digest('hex')
  return `${body}.${sig}`
}
