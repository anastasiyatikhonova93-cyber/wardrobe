import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { useStore } from './store'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { WardrobePage } from './pages/WardrobePage'
import { ShoppingPage } from './pages/ShoppingPage'
import { OutfitsPage } from './pages/OutfitsPage'
import { ProfilePage } from './pages/ProfilePage'
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

  useEffect(() => {
    if (user) subscribe(user.uid)
    else unsubscribe()
  }, [user, subscribe, unsubscribe])

  if (authLoading || (user && dataLoading)) {
    return <LoadingScreen />
  }

  if (!user) return <AuthPage />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<WardrobePage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/outfits" element={<OutfitsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
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
