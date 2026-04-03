import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { useStore } from './store'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { WardrobePage } from './pages/WardrobePage'
import { ShoppingPage } from './pages/ShoppingPage'
import { OutfitsPage } from './pages/OutfitsPage'
import { ProfilePage } from './pages/ProfilePage'
import { ImportPage } from './pages/ImportPage'
import { SeedPage } from './pages/SeedPage'
import { FixPhotosPage } from './pages/FixPhotosPage'
import { InvitePage, getPendingInvite, clearPendingInvite } from './pages/InvitePage'
import { SharedWardrobesPage } from './pages/SharedWardrobesPage'
import { Loader2 } from 'lucide-react'

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
  const { subscribe, unsubscribe, loading: dataLoading } = useStore()
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

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<WardrobePage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/outfits" element={<OutfitsPage />} />
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
