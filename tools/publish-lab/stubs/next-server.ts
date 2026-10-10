// just enough of next/server for the route handlers to run outside Next (the analytics UI lab)
export class NextRequest {
  nextUrl: URL
  headers: Headers
  constructor(public url: string, private init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
    this.nextUrl = new URL(url)
    this.headers = new Headers(init.headers || {})
  }
  async json() { return JSON.parse(this.init.body || 'null') }
  async text() { return this.init.body || '' }
  async arrayBuffer() { return new TextEncoder().encode(this.init.body || '').buffer }
}
export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers as any) } })
  }
}
