import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'be-Vallid: clone qualquer página e fica no controle dela',
  description: 'Clone páginas reais com HTML, CSS, imagens, fontes e vídeos preservados, hospedados com a gente.',
  icons: { icon: '/favicon.ico' },
}

const isClerkValid = () => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  return key.length > 30 && !key.endsWith('xxx') && !key.endsWith('dummy')
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const content = (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )

  if (isClerkValid()) {
    return <ClerkProvider>{content}</ClerkProvider>
  }

  return content
}
