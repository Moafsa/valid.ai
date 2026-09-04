'use client'

import { useState } from 'react'
import { Zap, Plus, Check } from 'lucide-react'

export function UserRow({ member }: { member: any }) {
  const [credits, setCredits] = useState(member.workspace?.aiCredits ?? 0)
  const [granting, setGranting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const handleGrantCredits = async () => {
    const amountStr = prompt('Quantos créditos de IA deseja adicionar para este usuário?', '50')
    if (!amountStr) return
    const amount = parseInt(amountStr, 10)
    if (isNaN(amount) || amount <= 0) return

    setGranting(true)
    try {
      const res = await fetch('/api/superadmin/credits/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: member.workspaceId, amount }),
      })
      const data = await res.json()
      if (res.ok) {
        setCredits(data.newBalance)
        setSuccessMsg(`+${amount} adicionados!`)
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch {
      alert('Erro ao adicionar créditos')
    } finally {
      setGranting(false)
    }
  }

  return (
    <tr className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-gray-300">
        {member.clerkUserId}
      </td>
      <td className="px-4 py-3 font-medium text-white">
        {member.workspace?.name ?? 'Workspace Desconhecido'}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300">
          {member.role}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
          member.workspace?.plan === 'SCALE' ? 'bg-purple-900/60 text-purple-300' :
          member.workspace?.plan === 'PRO' ? 'bg-blue-900/60 text-blue-300' :
          'bg-gray-800 text-gray-400'
        }`}>
          {member.workspace?.plan ?? 'FREE'}
        </span>
      </td>
      <td className="px-4 py-3 font-semibold text-amber-400">
        ⚡ {credits}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleGrantCredits}
          disabled={granting}
          className="flex items-center gap-1 text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 px-2.5 py-1 rounded border border-amber-500/30 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          {successMsg || '+ Adicionar Créditos'}
        </button>
      </td>
    </tr>
  )
}