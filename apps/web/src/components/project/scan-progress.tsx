'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface ProgressEvent {
  job_id: string
  status: string
  progress: number
  currentStep: string
  result?: any
  error?: string
}

export function ScanProgress({ jobId, projectId }: { jobId: string; projectId: string }) {
  const [event, setEvent] = useState<ProgressEvent | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!jobId) return

    const evtSource = new EventSource(`/api/scan/progress/${jobId}`)

    evtSource.onmessage = (e) => {
      const data: ProgressEvent = JSON.parse(e.data)
      setEvent(data)

      if (data.status === 'done') {
        evtSource.close()
        // Refresh the page to show the editor
        setTimeout(() => router.refresh(), 1000)
      } else if (data.status === 'error') {
        evtSource.close()
        router.refresh()
      }
    }

    evtSource.onerror = () => evtSource.close()

    return () => evtSource.close()
  }, [jobId, router])

  const progress = event?.progress ?? 0
  const step = event?.currentStep ?? 'Iniciando scanner...'
  const status = event?.status ?? 'scanning'

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
      <div className="flex items-center gap-3 mb-4">
        {status === 'done' ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : status === 'error' ? (
          <AlertCircle className="h-5 w-5 text-red-500" />
        ) : (
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        )}
        <div>
          <p className="font-semibold text-blue-900">Scan em Progresso</p>
          <p className="text-sm text-blue-700">{step}</p>
        </div>
        <span className="ml-auto text-2xl font-bold text-blue-700">{progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-blue-200">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { label: '🔍 Scanner', pct: 20 },
          { label: '🎯 Classificar', pct: 30 },
          { label: '🧩 Clonar seções', pct: 80 },
          { label: '✅ Finalizar', pct: 100 },
        ].map(step => (
          <div
            key={step.label}
            className={`text-xs text-center py-1 px-2 rounded-md font-medium transition-colors ${
              progress >= step.pct
                ? 'bg-blue-600 text-white'
                : 'bg-blue-100 text-blue-400'
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>
    </div>
  )
}
