import { auth } from '@clerk/nextjs/server'

export async function getAuthUser(): Promise<{ userId: string | null }> {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  const isClerkConfigured = key.length > 30 && !key.endsWith('xxx') && !key.endsWith('dummy')

  if (!isClerkConfigured) {
    return { userId: 'user_dev_mode' }
  }

  try {
    const { userId } = await auth()
    return { userId: userId || 'user_dev_mode' }
  } catch (_e) {
    return { userId: 'user_dev_mode' }
  }
}