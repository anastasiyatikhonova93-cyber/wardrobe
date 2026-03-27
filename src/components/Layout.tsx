import type { ReactNode } from 'react'
import { NavBar } from './NavBar'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white pb-20">
      <main className="max-w-lg mx-auto px-4 pt-6">{children}</main>
      <NavBar />
    </div>
  )
}
