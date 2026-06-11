import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { useStore } from './store'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { OutfitsPage } from './pages/OutfitsPage'
import { WardrobePage } from './pages/WardrobePage'
import { ShoppingPage } from './pages/ShoppingPage'
import { ProfilePage } from './pages/ProfilePage'
import { ImportPage } from './pages/ImportPage'
import { SeedPage } from './pages/SeedPage'
import { FixPhotosPage } from './pages/FixPhotosPage'
import { InvitePage, getPendingInvite, clearPendingInvite } from './pages/InvitePage'
import { SharedWardrobesPage } from './pages/SharedWardrobesPage'
import { Loader2, RotateCw, WifiOff } from 'lucide-react'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}

function AppShell() {
  const { user, loading: authLoading } = useAuth()
  const { subscribe, unsubscribe, loading: dataLoading, loadError, retryLoad } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isInvitePath = location.pathname.startsWith('/invite/')

  useEffect(() => {
    if (user) subscribe(user.uid)
    else unsubscribe()
  }, [user, subscribe, unsubscribe])

  // After login, check if there's a pending invite to process
  useEffect(() => {
    if (!user || authLoading) return
    const pendingToken = getPendingInvite()
    if (pendingToken && !isInvitePath) {
      clearPendingInvite()
      navigate(`/invite/${pendingToken}`)
    }
  }, [user, authLoading, isInvitePath, navigate])

  // Invite page handles its own auth/loading — render immediately
  if (isInvitePath) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
      </Routes>
    )
  }

  if (authLoading || (user && dataLoading)) {
    return <LoadingScreen />
  }

  if (!user) {
    return <AuthPage />
  }

  // Загрузка данных не удалась — показываем ошибку и кнопку «Повторить»,
  // а не пустой гардероб (который выглядит как «все вещи пропали»).
  if (loadError) {
    return <LoadErrorScreen message={loadError} onRetry={retryLoad} />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<OutfitsPage />} />
        <Route path="/wardrobe" element={<WardrobePage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/seed" element={<SeedPage />} />
        <Route path="/fix-photos" element={<FixPhotosPage />} />
        <Route path="/shared" element={<SharedWardrobesPage />} />
      </Routes>
    </Layout>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-zinc-300" />
    </div>
  )
}

function LoadErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff size={32} className="text-zinc-400" />
      <div className="space-y-1">
        <p className="font-medium text-zinc-800">Не удалось загрузить гардероб</p>
        <p className="text-sm text-zinc-500">Вещи никуда не пропали — это сбой загрузки. Попробуйте ещё раз.</p>
        <p className="text-xs text-zinc-400">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        <RotateCw size={16} />
        Повторить
      </button>
    </div>
  )
}
