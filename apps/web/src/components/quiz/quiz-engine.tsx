'use client'

import { useState } from 'react'
import { Check, ArrowRight, ArrowLeft } from 'lucide-react'

interface QuizAnswer {
  id: string
  text: string
  image?: string
  value: string
}

interface QuizStep {
  id: string
  order: number
  question: string
  subtitle?: string
  questionType: 'single' | 'multiple' | 'scale' | 'text' | 'image-choice'
  answers: QuizAnswer[]
  progressPercent: number
  hasLeadCapture?: boolean
  generatedCode?: string
}

interface QuizEngineProps {
  steps: QuizStep[]
  onComplete?: (leadData: Record<string, string>, answers: Record<string, string>) => void
}

export function QuizEngine({ steps, onComplete }: QuizEngineProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '' })

  const currentStep = steps[currentIdx]
  if (!currentStep) return <div className="p-8 text-center text-gray-500">Quiz finalizado!</div>

  const isLast = currentIdx === steps.length - 1
  const selectedValue = selectedAnswers[currentStep.id]

  const handleSelect = (answer: QuizAnswer) => {
    setSelectedAnswers(prev => ({ ...prev, [currentStep.id]: answer.value }))
    // If single choice, auto advance after short delay
    if (currentStep.questionType === 'single' && !isLast) {
      setTimeout(() => setCurrentIdx(prev => prev + 1), 300)
    }
  }

  const handleNext = () => {
    if (isLast) {
      onComplete?.(leadForm, selectedAnswers)
    } else {
      setCurrentIdx(prev => prev + 1)
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
          <span>Etapa {currentIdx + 1} de {steps.length}</span>
          <span>{currentStep.progressPercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-2 rounded-full bg-brand-600 transition-all duration-500"
            style={{ width: `${currentStep.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">{currentStep.question}</h2>
        {currentStep.subtitle && (
          <p className="text-sm text-gray-500 mt-1">{currentStep.subtitle}</p>
        )}
      </div>

      {/* Answers / Options */}
      {currentStep.hasLeadCapture ? (
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome completo</label>
            <input
              type="text"
              value={leadForm.name}
              onChange={e => setLeadForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Seu nome"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">E-mail para receber o resultado</label>
            <input
              type="email"
              value={leadForm.email}
              onChange={e => setLeadForm(prev => ({ ...prev, email: e.target.value }))}
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {currentStep.answers.map(ans => {
            const isSelected = selectedValue === ans.value
            return (
              <button
                key={ans.id}
                onClick={() => handleSelect(ans)}
                className={`w-full flex items-center justify-between rounded-xl border p-4 text-left font-medium transition-all ${
                  isSelected
                    ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm'
                    : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50 text-gray-800'
                }`}
              >
                <span>{ans.text}</span>
                {isSelected && <Check className="h-5 w-5 text-brand-600" />}
              </button>
            )
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <button
          onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
          disabled={currentIdx === 0}
          className="flex items-center gap-1 text-sm font-medium text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <button
          onClick={handleNext}
          disabled={!selectedValue && !currentStep.hasLeadCapture}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {isLast ? 'Ver Resultado' : 'Próximo'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
