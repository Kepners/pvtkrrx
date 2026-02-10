import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PVTKRRX — Stream From Your Seedbox to Stremio',
  description: 'Turn your private tracker downloads into a personal Stremio catalog. £1/month.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-background text-gray-900">{children}</body>
    </html>
  )
}
