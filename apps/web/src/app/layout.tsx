import type { Metadata } from "next"
import type { ReactNode } from "react"
import "../styles/primitives.css"

export const metadata: Metadata = { title: "Reference Video Studio", description: "Cosmic Engineering creator and operations surfaces" }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
