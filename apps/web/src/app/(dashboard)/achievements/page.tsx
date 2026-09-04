export const dynamic = 'force-dynamic'

import { Trophy, Award, Zap, Star, Target, CheckCircle2, Lock } from 'lucide-react'

const ACHIEVEMENTS = [
  { id: 'first_clone', title: 'Primeiro Clone', desc: 'Clonou sua primeira landing page com IA', icon: '🚀', xp: 100, reward: 25, unlocked: true },
  { id: 'first_publish', title: 'No Ar!', desc: 'Publicou seu primeiro funil em um subdomínio', icon: '🌐', xp: 150, reward: 50, unlocked: true },
  { id: 'quiz_master', title: 'Mestre do Quiz', desc: 'Importou ou criou um quiz multi-etapa', icon: '❓', xp: 120, reward: 30, unlocked: false },
  { id: 'vsl_pro', title: 'Player VSL', desc: 'Configurou um vídeo com CTA programável', icon: '🎬', xp: 100, reward: 25, unlocked: false },
  { id: '100_leads', title: 'Centena de Leads', desc: 'Capturou 100 leads nos seus funis', icon: '👥', xp: 300, reward: 100, unlocked: false },
  { id: 'polyglot', title: 'Poliglota da Copy', desc: 'Traduziu culturalmente um funil para outro país', icon: '🌍', xp: 200, reward: 50, unlocked: false },
  { id: 'cloaker_hunter', title: 'Caçador de Cloaker', desc: 'Analisou uma página com o Anti-Cloaker', icon: '🛡️', xp: 100, reward: 25, unlocked: false },
  { id: 'prompt_wizard', title: 'Mago dos Prompts', desc: 'Editou 5 blocos usando instrução por IA', icon: '✨', xp: 150, reward: 35, unlocked: false },
]

export default function AchievementsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conquistas & Recompensas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete conquistas para subir de nível e ganhar ⚡ créditos de IA grátis!
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ACHIEVEMENTS.map(ach => (
          <div
            key={ach.id}
            className={`rounded-2xl border p-5 transition-all ${
              ach.unlocked
                ? 'border-amber-300 bg-amber-50/40 shadow-sm'
                : 'border-gray-200 bg-white opacity-60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-4xl">{ach.icon}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">{ach.title}</h3>
                  {ach.unlocked ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Desbloqueado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      <Lock className="h-3 w-3" /> Bloqueado
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{ach.desc}</p>
                <div className="flex items-center gap-3 mt-3 text-xs font-semibold">
                  <span className="text-amber-600">+{ach.xp} XP</span>
                  <span className="text-brand-600">+{ach.reward} Créditos IA</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
