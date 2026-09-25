'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Answer {
  id: string
  text: string
  value?: string
}

interface QuizStepPlayerProps {
  projectId: string
  stepNumber: number // 1-based
  totalSteps: number
  question: string | null
  subtitle: string | null
  progressPercent: number
  answers: Answer[]
  hasLeadCapture: boolean
  isLastStep: boolean
  backgroundHtml: string | null
}

declare global {
  interface Window {
    vai?: {
      page: (name: string) => void
      event: (type: string, metadata?: Record<string, unknown>) => void
      lead: (data: { email?: string; phone?: string; name?: string }) => void
    }
  }
}

export function QuizStepPlayer({
  projectId,
  stepNumber,
  totalSteps,
  question,
  subtitle,
  progressPercent,
  answers,
  hasLeadCapture,
  isLastStep,
  backgroundHtml,
}: QuizStepPlayerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [leadName, setLeadName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const goToNext = () => {
    if (isLastStep) {
      router.push(`/f/${projectId}/step-1?done=1`)
      return
    }
    router.push(`/f/${projectId}/step-${stepNumber + 1}`)
  }

  const handleAnswer = (answer: Answer) => {
    setSelected(answer.id)
    window.vai?.event('quiz_answer', { step: stepNumber, question, answer: answer.text })
    setTimeout(goToNext, 350) // brief visual feedback before advancing
  }

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadEmail.trim()) return
    setSubmitting(true)
    window.vai?.lead({ name: leadName, email: leadEmail })
    setTimeout(goToNext, 300)
  }

  return (
    <div className="relative min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10">
      {backgroundHtml && (
        <div
          className="absolute inset-0 -z-10 opacity-40 pointer-events-none overflow-hidden"
          dangerouslySetInnerHTML={{ __html: backgroundHtml }}
        />
      )}

      {/* Progress bar */}
      <div className="w-full max-w-md mb-8">
        <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-2 rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">
          Etapa {stepNumber} de {totalSteps}
        </p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {question && (
          <h1 className="text-xl font-bold text-gray-900 text-center mb-2">{question}</h1>
        )}
        {subtitle && (
          <p className="text-sm text-gray-500 text-center mb-6">{subtitle}</p>
        )}

        {hasLeadCapture ? (
          <form onSubmit={handleLeadSubmit} className="space-y-3 mt-4">
            <input
              value={leadName}
              onChange={e => setLeadName(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <input
              value={leadEmail}
              onChange={e => setLeadEmail(e.target.value)}
              type="email"
              required
              placeholder="Seu e-mail"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Continuar'}
            </button>
          </form>
        ) : (
          <div className="space-y-2.5 mt-4">
            {answers.map(answer => (
              <button
                key={answer.id}
                onClick={() => handleAnswer(answer)}
                className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  selected === answer.id
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                {answer.text}
              </button>
            ))}
            {answers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Não identificamos as opções desta etapa automaticamente.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
