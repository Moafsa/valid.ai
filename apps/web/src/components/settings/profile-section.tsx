'use client'
export function ProfileSection({ user }: { user: any }) {
  if (!user) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Perfil</h2>
      </div>
      <div className="p-6 flex items-center gap-4">
        {user.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt={user.fullName ?? ''} className="h-14 w-14 rounded-full" />
        )}
        <div>
          <p className="font-semibold text-gray-900">{user.fullName}</p>
          <p className="text-sm text-gray-500">{user.emailAddresses?.[0]?.emailAddress}</p>
        </div>
        <a
          href="https://accounts.clerk.com/user"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          Editar perfil →
        </a>
      </div>
    </div>
  )
}
