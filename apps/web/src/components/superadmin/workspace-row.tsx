'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

const PLAN_BADGE: Record<string, string> = {
  FREE:  'bg-gray-800 text-gray-400',
  PRO:   'bg-blue-900/50 text-blue-400',
  SCALE: 'bg-purple-900/50 text-purple-400',
}

export function WorkspaceRow({ workspace }: { workspace: any }) {
  const [credits, setCredits] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const grantCredits = async () => {
    const amount = parseInt(credits)
    if (!amount || amount <= 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/credits/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, amount }),
      })
      if (res.ok) {
        toast.success(`${amount} créditos adicionados!`)
        setCredits('')
      } else {
        toast.error('Erro ao adicionar créditos')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">{workspace.name}</p>
          <p className="text-xs text-gray-500 font-mono">{workspace.id.slice(0, 12)}...</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${PLAN_BADGE[workspace.plan]}`}>
          {workspace.plan}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-yellow-400">{workspace.aiCredits}</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              placeholder="+ qty"
              value={credits}
              onChange={e => setCredits(e.target.value)}
              className="w-16 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-red-500"
            />
            <button
              onClick={grantCredits}
              disabled={loading || !credits}
              className="p-1 rounded bg-green-900/50 text-green-400 hover:bg-green-800/50 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-300">{workspace._count.projects}</td>
      <td className="px-4 py-3 text-sm text-gray-300">{workspace._count.members}</td>
      <td className="px-4 py-3">
        <select
          defaultValue={workspace.plan}
          onChange={async e => {
            await fetch('/api/superadmin/workspaces/' + workspace.id + '/plan', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plan: e.target.value }),
            })
            toast.success('Plano atualizado')
          }}
          className="text-xs rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-300 focus:outline-none"
        >
          <option value="FREE">Free</option>
          <option value="PRO">Pro</option>
          <option value="SCALE">Scale</option>
        </select>
      </td>
    </tr>
  )
}
