// ─── Project Types ────────────────────────────────────────
export type ProjectType = 'LP' | 'QUIZ' | 'VSL' | 'CHECKOUT' | 'FUNNEL'
export type ProjectStatus = 'pending' | 'scanning' | 'cloning' | 'ready' | 'published' | 'error'

export interface Project {
  id: string
  workspaceId: string
  name: string
  sourceUrl: string
  type: ProjectType
  status: ProjectStatus
  thumbnail?: string
  createdAt: Date
  updatedAt: Date
  pages: Page[]
}

// ─── Page & Block Types ────────────────────────────────────
export type BlockType =
  | 'hero'
  | 'benefits'
  | 'testimonials'
  | 'vsl'
  | 'offer'
  | 'faq'
  | 'cta'
  | 'footer'
  | 'text'
  | 'image'
  | 'countdown'
  | 'lead-capture'
  | 'quiz-step'
  | 'quiz-result'
  | 'custom-html'

export interface Block {
  id: string
  type: BlockType
  order: number
  props: Record<string, unknown>
  style?: Record<string, string>
  generatedHtml?: string  // HTML raw from screenshot-to-code
}

export interface Page {
  id: string
  projectId: string
  name: string
  slug: string
  order: number
  blocks: Block[]
  publishedUrl?: string
  createdAt: Date
  updatedAt: Date
}

// ─── Scanner Types ─────────────────────────────────────────
export type ScanStatus = 'queued' | 'scanning' | 'processing' | 'done' | 'error'

export interface ScanJob {
  id: string
  projectId: string
  url: string
  status: ScanStatus
  progress: number       // 0-100
  currentStep: string
  result?: ScanResult
  error?: string
  createdAt: Date
}

export interface ScanResult {
  pageType: ProjectType
  sections: ScannedSection[]
  trackings: DetectedTracking[]
  hasCloaker: boolean
  cloakerDetails?: CloakerDetails
  assets: ScannedAsset[]
}

export interface ScannedSection {
  id: string
  type: BlockType
  screenshot: string    // S3 URL of screenshot
  generatedCode: string // HTML/React from screenshot-to-code
  order: number
}

export interface DetectedTracking {
  type: 'meta_pixel' | 'tiktok_pixel' | 'google_tag' | 'google_analytics' | 'gtm' | 'other'
  id?: string
  raw: string
}

export interface CloakerDetails {
  detected: boolean
  versionA: string
  versionB: string
  differences: string[]
}

export interface ScannedAsset {
  type: 'image' | 'video' | 'font'
  originalUrl: string
  hostedUrl: string   // S3 URL
  mimeType: string
}

// ─── Quiz Types ────────────────────────────────────────────
export type QuestionType = 'single' | 'multiple' | 'scale' | 'text' | 'image-choice'

export interface QuizStep {
  id: string
  order: number
  question: string
  questionImage?: string
  questionType: QuestionType
  answers: QuizAnswer[]
  progressPercent: number
  logic: QuizLogicRule[]
  leadCapture?: LeadCaptureConfig
}

export interface QuizAnswer {
  id: string
  text: string
  image?: string
  value: string
}

export interface QuizLogicRule {
  condition: {
    stepId: string
    answerId: string
  }
  action: 'goto' | 'end'
  targetStepId?: string
}

export interface LeadCaptureConfig {
  fields: ('email' | 'name' | 'phone' | 'whatsapp')[]
  headline: string
  cta: string
}

// ─── Analytics Types ───────────────────────────────────────
export interface FunnelEvent {
  eventId: string
  projectId: string
  sessionId: string
  leadEmail?: string
  step: string
  eventType: string
  metadata: Record<string, unknown>
  ip: string
  device: 'mobile' | 'desktop' | 'tablet'
  country: string
  source: string
  createdAt: Date
}

export interface FunnelStats {
  totalSessions: number
  conversionRate: number
  steps: StepStats[]
}

export interface StepStats {
  step: string
  sessions: number
  dropoffRate: number
  avgTimeMs: number
}

// ─── API Response Types ────────────────────────────────────
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface ScanStartResponse {
  jobId: string
  projectId: string
  message: string
}

export interface ScanProgressEvent {
  jobId: string
  status: ScanStatus
  progress: number
  currentStep: string
  result?: ScanResult
  error?: string
}
