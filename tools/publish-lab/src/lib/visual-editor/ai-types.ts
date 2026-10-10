/**
 * The contract between the editor's AI assistant (browser) and /api/editor/ai-assist (server).
 *
 * The assistant never writes the page itself. It answers with OPERATIONS (change this style, replace this
 * text, add that block) aimed at elements the browser described in an outline; the browser applies them to
 * the live editor, so every change is undoable and visible.
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

export const OperationSchema = z.object({
  op: z.enum(['style', 'text', 'attr', 'replace', 'insert', 'add_block', 'remove']),
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

export const AssistResponseSchema = z.object({
  reply: z.string().max(1200).default(''),
  operations: z.array(OperationSchema).max(80).default([]),
})
export type AssistResponse = z.infer<typeof AssistResponseSchema>

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
}

export interface Outline {
  page: { bg: string; color: string; font: string; width: number }
  sections: OutlineSection[]
  palette: string[]
  selected?: { id: string; kind: string; tag: string; text?: string; sectionId?: string }
  counts: Record<string, number>
}

/** The JSON schema of the one tool the model must call. */
export const APPLY_CHANGES_TOOL = {
  name: 'apply_changes',
  description:
    'Aplica mudanças na página aberta no editor visual. Sempre chame esta função uma vez, com um "reply" curto em português para o dono do site e a lista de "operations". Se o pedido for ambíguo ou impossível, devolva operations vazio e use o reply para perguntar ou explicar em uma frase.',
  parameters: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Resumo curto e simpático (1 ou 2 frases) do que foi feito, em português do Brasil, sem travessão.' },
      operations: {
        type: 'array',
        description: 'Mudanças a aplicar, em ordem.',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['style', 'text', 'attr', 'replace', 'insert', 'add_block', 'remove'] },
            label: { type: 'string', description: 'O que esta mudança faz, em até 12 palavras, em português.' },
            target: {
              type: 'object',
              description: 'Quem recebe a mudança. by=page (fundo/estilo geral da página), selected (elemento selecionado), ids (ids do outline), kind (todos de um tipo, com filtros opcionais).',
              properties: {
                by: { type: 'string', enum: ['page', 'selected', 'ids', 'kind'] },
                ids: { type: 'array', items: { type: 'string' } },
                kind: { type: 'string', enum: ['section', 'heading', 'text', 'button', 'link', 'image', 'input', 'video'] },
                section: { type: 'string', description: 'id de uma seção (ex: s3) ou "selected" para limitar uma busca por kind' },
                contains: { type: 'string' },
                nth: { type: 'array', items: { type: 'integer' } },
              },
              required: ['by'],
            },
            css: { type: 'object', additionalProperties: { type: 'string' }, description: 'Para op=style: propriedades CSS em kebab-case (ex: {"background-color":"#000"}).' },
            text: { type: 'string', description: 'Para op=text: novo texto do elemento.' },
            attrs: { type: 'object', additionalProperties: { type: ['string', 'null'] }, description: 'Para op=attr: atributos (href, src, alt, target...). null remove.' },
            html: { type: 'string', description: 'Para op=replace ou insert: HTML de UM elemento, só com estilos inline. Nada de script.' },
            block: { type: 'string', description: 'Para op=add_block: id de um bloco pronto da biblioteca.' },
            where: { type: 'string', enum: ['before', 'after', 'start', 'end', 'page-start', 'page-end'] },
          },
          required: ['op'],
        },
      },
    },
    required: ['reply', 'operations'],
  },
} as const
