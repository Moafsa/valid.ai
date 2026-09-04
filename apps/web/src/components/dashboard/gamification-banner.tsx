'use client'

import { Trophy, Zap, Star, Award, Flame } from 'lucide-react'

interface GamificationBannerProps {
  level: number
  xpPoints: number
  streakDays: number
  unlockedCount: number
}

const LEVEL_NAMES = [
  'Iniciante', 'Iniciante', 'Afiliado Aprendiz', 'Afiliado Pro',
  'Produtor Bronze', 'Produtor Prata', 'Produtor Ouro',
  'Mestre dos Funis', 'Escala Black', 'Lenda do Tráfego'
]

export function GamificationBanner({
  level = 1,
  xpPoints = 120,
  streakDays = 3,
  unlockedCount = 2,
}: GamificationBannerProps) {
  const levelName = LEVEL_NAMES[Math.min(level, 9)]
  const nextLevelXp = level * 250
  const progressPct = Math.min(100, Math.round((xpPoints / nextLevelXp) * 100))

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-500/10 via-amber-100/30 to-amber-500/10 p-5 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Level badge */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white font-extrabold text-lg">
            N{level}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900">{levelName}</h3>
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full">
                <Flame className="h-3 w-3 text-orange-500 fill-orange-500" /> {streakDays} dias seguidos
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {xpPoints} / {nextLevelXp} XP para o próximo nível
            </p>
          </div>
        </div>

        {/* Badges preview */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/80 backdrop-blur rounded-xl px-3 py-1.5 border border-amber-200 text-xs font-semibold text-amber-900">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span>{unlockedCount}/12 Conquistas</span>
          </div>
          <a
            href="/achievements"
            className="text-xs text-amber-700 hover:text-amber-900 font-bold underline ml-1"
          >
            Ver todas →
          </a>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-amber-200/50 overflow-hidden">
          <div
            className="h-2 rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
