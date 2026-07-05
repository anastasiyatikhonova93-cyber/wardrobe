import { type ReactNode, useEffect } from 'react'
import { NavBar } from './NavBar'
import { ImportProgressBadge } from './ImportProgressBadge'
import { WardrobeSwitcher } from './WardrobeSwitcher'
import { useStore } from '../store'
import { Info } from 'lucide-react'

export function Layout({ children }: { children: ReactNode }) {
  const accessRevokedNotice = useStore((s) => s.accessRevokedNotice)
  const clearAccessRevokedNotice = useStore((s) => s.clearAccessRevokedNotice)

  // Тост отзыва доступа сам исчезает через несколько секунд.
  useEffect(() => {
    if (!accessRevokedNotice) return
    const t = setTimeout(clearAccessRevokedNotice, 5000)
    return () => clearTimeout(t)
  }, [accessRevokedNotice, clearAccessRevokedNotice])

  return (
    <div className="min-h-screen bg-white pb-20">
      {accessRevokedNotice && (
        <div className="bg-violet-50 border-b border-violet-100">
          <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-2">
            <Info size={14} className="text-violet-500 shrink-0" />
            <span className="text-xs text-violet-600">
              Доступ к гардеробу «{accessRevokedNotice}» отозван. Открыт ваш личный гардероб.
            </span>
          </div>
        </div>
      )}
      {/* Без backdrop-blur/filter: иначе position:fixed внутри (оверлеи switcher-а)
          позиционируется относительно этой полоски, а не окна. */}
      <div className="border-b border-zinc-100 sticky top-0 bg-white z-30">
        <div className="max-w-lg mx-auto">
          <WardrobeSwitcher />
        </div>
      </div>
      <main className="max-w-lg mx-auto px-4 pt-6">{children}</main>
      <ImportProgressBadge />
      <NavBar />
    </div>
  )
}
