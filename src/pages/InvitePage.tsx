import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { useStore } from '../store'
import { Loader2 } from 'lucide-react'

type InviteStatus = 'loading' | 'ready' | 'not-found' | 'already-used' | 'accepting' | 'accepted' | 'error'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user, signIn } = useAuth()
  const { acceptInvite, viewSharedWardrobe } = useStore()
  const navigate = useNavigate()

  const [status, setStatus] = useState<InviteStatus>('loading')
  const [ownerName, setOwnerName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    async function load() {
      const snap = await getDoc(doc(db, 'invites', token!))
      if (!snap.exists()) {
        setStatus('not-found')
        return
      }
      const data = snap.data()
      setOwnerName(data.ownerName || 'Пользователь')
      if (data.used) {
        setStatus('already-used')
      } else {
        setStatus('ready')
      }
    }
    load()
  }, [token])

  async function handleAccept() {
    if (!token) return
    setStatus('accepting')
    try {
      const result = await acceptInvite(token)
      setStatus('accepted')
      setTimeout(() => {
        viewSharedWardrobe(result.ownerUid, result.ownerName)
        navigate('/')
      }, 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && <Loader2 size={24} className="animate-spin text-zinc-300 mx-auto" />}

        {status === 'not-found' && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение не найдено</p>
            <p className="text-sm text-zinc-400">Возможно, ссылка устарела или некорректна</p>
          </div>
        )}

        {status === 'already-used' && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение уже использовано</p>
            <p className="text-sm text-zinc-400">Эта ссылка была активирована ранее</p>
            {user && (
              <button onClick={() => navigate('/')} className="mt-4 px-6 py-2.5 rounded-full bg-black text-white text-sm">
                Перейти в приложение
              </button>
            )}
          </div>
        )}

        {status === 'ready' && !user && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение от {ownerName}</p>
            <p className="text-sm text-zinc-400 mb-6">Войдите, чтобы получить доступ к гардеробу</p>
            <button onClick={signIn} className="w-full py-3 rounded-full bg-black text-white text-sm font-medium">
              Войти через Google
            </button>
          </div>
        )}

        {status === 'ready' && user && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение от {ownerName}</p>
            <p className="text-sm text-zinc-400 mb-6">
              Вы получите доступ к гардеробу для редактирования и составления образов
            </p>
            <button onClick={handleAccept} className="w-full py-3 rounded-full bg-black text-white text-sm font-medium">
              Принять приглашение
            </button>
          </div>
        )}

        {status === 'accepting' && (
          <div>
            <Loader2 size={24} className="animate-spin text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">Принимаем приглашение…</p>
          </div>
        )}

        {status === 'accepted' && (
          <div>
            <p className="text-lg font-medium mb-2">Готово!</p>
            <p className="text-sm text-zinc-400">Открываем гардероб {ownerName}…</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-lg font-medium mb-2">Ошибка</p>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button onClick={() => navigate('/')} className="px-6 py-2.5 rounded-full bg-black text-white text-sm">
              На главную
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
