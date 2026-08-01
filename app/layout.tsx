import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers/Providers'

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Nexus Admin',
  description: 'NeXus NFT Launchpad admin dashboard',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-snippet': -1,
      'max-image-preview': 'none',
      'max-video-preview': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${font.variable}`}>
      <body className={font.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
