import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavBar } from './NavBar'
import { useStore } from '../store'
import { ArrowLeft } from 'lucide-react'

export function Layout({ children }: { children: ReactNode }) {
  const { isSharedView, sharedViewOwnerName, viewOwnWardrobe } = useStore()
  const navigate = useNavigate()

  function handleBack() {
    viewOwnWardrobe()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      {isSharedView && (
        <div className="bg-violet-50 border-b border-violet-100">
          <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-violet-600">
              Гардероб: <strong>{sharedViewOwnerName || 'Пользователь'}</strong>
            </span>
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 transition-colors"
            >
              <ArrowLeft size={14} />
              К своему
            </button>
          </div>
        </div>
      )}
      <main className="max-w-lg mx-auto px-4 pt-6">{children}</main>
      <NavBar />
    </div>
  )
}
