import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" })

export const metadata: Metadata = {
  title: "BPCE Compass — prototype",
  description: "L'assistant bancaire qui comprend, guide et accompagne. Prototype de démonstration, données fictives.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={manrope.variable}>
      <body>{children}</body>
    </html>
  )
}
