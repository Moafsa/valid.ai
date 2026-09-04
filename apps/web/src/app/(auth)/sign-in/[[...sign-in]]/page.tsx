import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

const isClerkValid = () => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  return key.length > 30 && !key.endsWith('xxx') && !key.endsWith('dummy')
}

export default function SignInPage() {
  const hasValidClerk = isClerkValid()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-2xl text-white shadow-lg mb-3">
            ⚡
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Valid<span className="text-indigo-400">.ai</span></h1>
          <p className="mt-2 text-slate-400">Clone funis com Inteligência Artificial</p>
        </div>

        {hasValidClerk ? (
          <SignIn />
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl text-center space-y-4">
            <div className="text-amber-400 font-semibold text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              🛠️ Modo de Desenvolvedor Ativo
            </div>
            <p className="text-sm text-slate-300">
              As chaves reais do Clerk não foram configuradas no `.env` ainda. Você pode acessar o painel diretamente.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/30"
            >
              🚀 Entrar no Dashboard (Modo Dev)
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
