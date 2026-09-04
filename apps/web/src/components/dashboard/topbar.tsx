import { UserButton } from '@clerk/nextjs'
import { Bell } from 'lucide-react'

const isClerkValid = () => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  return key.length > 30 && !key.endsWith('xxx') && !key.endsWith('dummy')
}

export function TopBar() {
  const hasValidClerk = isClerkValid()

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Bell className="h-5 w-5" />
        </button>
        {hasValidClerk ? (
          <UserButton afterSignOutUrl="/sign-in" />
        ) : (
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-100 rounded-full px-3 py-1 border border-gray-200">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            👤 Dev Admin
          </div>
        )}
      </div>
    </header>
  )
}
