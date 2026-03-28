import type { Metadata } from 'next'
import { Newsreader, Public_Sans } from 'next/font/google'
import '@/styles/globals.css'
import 'quill/dist/quill.snow.css'

const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-headline',
  style: ['normal', 'italic'],
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-label',
})

export const metadata: Metadata = {
  title: 'RelationalText Demo',
  description: 'Live multi-format rich text translation demo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${publicSans.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
