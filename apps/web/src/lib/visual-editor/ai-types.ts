/**
 * The vocabulary of page changes the editor engine understands (style, text, theme, insert...), the page outline it builds, and
 * the schema of a whole-page theme. The AI agent (agent-tools.ts / agent-session.ts) works through tools built on this engine; the
 * small built-in interpreter used when no AI is connected still speaks in these operations.
 */
import { z } from 'zod'

export const KINDS = ['section', 'heading', 'text', 'button', 'link', 'image', 'input', 'video'] as const
export type Kind = (typeof KINDS)[number]

export const TargetSchema = z.object({
  by: z.enum(['page', 'selected', 'ids', 'kind']),
  ids: z.array(z.string()).max(200).optional(),
  kind: z.enum(KINDS).optional(),
  /** limit a kind query to one section ("s3") or to the selected one */
  section: z.string().optional(),
  /** only elements whose text contains this (case-insensitive) */
  contains: z.string().max(80).optional(),
  /** only the nth matches (1-based) */
  nth: z.array(z.number().int().min(1)).max(50).optional(),
})
export type Target = z.infer<typeof TargetSchema>

export const WHERE = ['before', 'after', 'start', 'end', 'page-start', 'page-end'] as const

/** A whole-page visual direction. The engine turns it into consistent changes for every heading, text, button, image and section. */
export const ThemeSchema = z.object({
  mood: z.enum(['dark', 'light']).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  radius: z.number().min(0).max(40).optional(),
  shadow: z.enum(['none', 'soft', 'strong']).optional(),
  density: z.enum(['compact', 'normal', 'airy']).optional(),
  font: z.enum(['sans', 'serif', 'mono']).optional(),
  headingWeight: z.number().int().min(400).max(900).optional(),
  buttons: z.enum(['solid', 'outline', 'pill']).optional(),
})
export type Theme = z.infer<typeof ThemeSchema>

export const OperationSchema = z.object({
  op: z.enum(['theme', 'style', 'text', 'attr', 'replace', 'insert', 'add_block', 'remove']),
  theme: ThemeSchema.optional(),
  target: TargetSchema.optional(),
  css: z.record(z.string(), z.string().max(400)).optional(),
  text: z.string().max(4000).optional(),
  attrs: z.record(z.string(), z.string().max(1000).nullable()).optional(),
  html: z.string().max(24000).optional(),
  block: z.string().max(40).optional(),
  where: z.enum(WHERE).optional(),
  /** short human description of THIS change, in Portuguese */
  label: z.string().max(140).optional(),
})
export type Operation = z.infer<typeof OperationSchema>


export interface OutlineNode {
  id: string
  kind: Kind
  tag: string
  text?: string
  color?: string
  bg?: string
  size?: string
  weight?: string
  radius?: string
}

export interface OutlineSection {
  id: string
  tag: string
  title?: string
  bg: string
  color: string
  height: number
  nodes: OutlineNode[]
  more?: number
  /** how many of each kind this section holds (the list of nodes may be shorter) */
  kinds?: Record<string, number>
}

export interface Outline {
  page: { bg: string; color: string; font: string; width: number }
  sections: OutlineSection[]
  palette: string[]
  selected?: { id: string; kind: string; tag: string; text?: string; sectionId?: string }
  counts: Record<string, number>
}
