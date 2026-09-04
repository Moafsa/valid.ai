export type EventType =
  | 'view'
  | 'click'
  | 'scroll_25'
  | 'scroll_50'
  | 'scroll_75'
  | 'scroll_100'
  | 'video_play'
  | 'video_25'
  | 'video_50'
  | 'video_75'
  | 'video_100'
  | 'video_pause'
  | 'quiz_start'
  | 'quiz_answer'
  | 'quiz_complete'
  | 'lead_capture'
  | 'cta_click'
  | 'checkout_start'
  | 'checkout_complete'
  | string

export interface TrackEvent {
  eventType: EventType
  step?: string
  metadata?: Record<string, unknown>
}

export interface TrackerConfig {
  projectId: string
  endpoint: string
  sessionId?: string
  debug?: boolean
}

export interface FunnelAITracker {
  track: (eventType: EventType, step?: string, metadata?: Record<string, unknown>) => void
  identify: (email: string, name?: string, phone?: string) => void
  page: (step: string) => void
}
