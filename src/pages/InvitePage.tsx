import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useStore } from '../store'
import { callDb } from '../lib/api'
import { Loader2 } from 'lucide-react'
import type { WardrobeRole } from '../types'

const PENDING_INVITE_KEY = 'pendingInviteToken'

export function savePendingInvite(token: string) {
  localStorage.setItem(PENDING_INVITE_KEY, token)
}

export function getPendingInvite(): string | null {
  return localStorage.getItem(PENDING_INVITE_KEY)
}

export function clearPendingInvite() {
  localStorage.removeItem(PENDING_INVITE_KEY)
}

type Status = 'loading' | 'ready' | 'not-found' | 'already-used' | 'accepting' | 'accepted' | 'error'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading, signIn } = useAuth()
  const acceptInvite = useStore((s) => s.acceptInvite)
  const navigate = useNavigate()

  const [status, setStatus] = useState<Status>('loading')
  const [ownerName, setOwnerName] = useState('')
  const [wardrobeName, setWardrobeName] = useState('')
  const [role, setRole] = useState<WardrobeRole>('member')
  const [error, setError] = useState('')

  // Сохраняем токен для возврата после логина (пока не авторизованы).
  useEffect(() => {
    if (token && !user && !authLoading) savePendingInvite(token)
  }, [token, user, authLoading])

  // Превью приглашения грузим с сервера (/api/db, не клиентский Firestore — он может
  // быть заблокирован). Требует авторизации, поэтому грузим только для залогиненного.
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setStatus('ready')
      return
    }
    if (!token) return
    setStatus('loading')
    let cancelled = false
    ;(async () => {
      try {
        const info = await callDb('inviteInfo', { token })
        if (cancelled) return
        setOwnerName(info.ownerName || 'Пользователь')
        setWardrobeName(info.wardrobeName || 'Гардероб')
        setRole(info.role === 'owner' ? 'owner' : 'member')
        if (info.status === 'not_found') setStatus('not-found')
        else if (info.status === 'revoked' || info.status === 'used') setStatus('already-used')
        else setStatus('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить приглашение')
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [token, user, authLoading])

  async function handleAccept() {
    if (!token) return
    setStatus('accepting')
    try {
      await acceptInvite(token) // стор сам обновит список и переключится на гардероб
      clearPendingInvite()
      setStatus('accepted')
      setTimeout(() => navigate('/'), 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
      setStatus('error')
    }
  }

  async function handleSignIn() {
    try {
      await signIn()
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/popup-blocked') {
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      setError(`${code}: ${msg}`)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm text-center">
        {(status === 'loading' || authLoading) && (
          <Loader2 size={24} className="animate-spin text-zinc-300 mx-auto" />
        )}

        {status === 'not-found' && !authLoading && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение не найдено</p>
            <p className="text-sm text-zinc-400 mb-4">Возможно, ссылка устарела или некорректна</p>
            <button onClick={() => { clearPendingInvite(); navigate('/') }} className="px-6 py-2.5 rounded-full bg-black text-white text-sm">
              На главную
            </button>
          </div>
        )}

        {status === 'already-used' && !authLoading && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение уже использовано</p>
            <p className="text-sm text-zinc-400">Эта ссылка была активирована ранее</p>
            {user && (
              <button onClick={() => { clearPendingInvite(); navigate('/') }} className="mt-4 px-6 py-2.5 rounded-full bg-black text-white text-sm">
                Перейти в приложение
              </button>
            )}
          </div>
        )}

        {!authLoading && status === 'ready' && !user && (
          <div>
            <p className="text-lg font-medium mb-2">Приглашение в гардероб</p>
            <p className="text-sm text-zinc-400 mb-6">Войдите, чтобы получить доступ</p>
            <button onClick={handleSignIn} className="w-full py-3 rounded-full bg-black text-white text-sm font-medium">
              Войти через Google
            </button>
          </div>
        )}

        {!authLoading && status === 'ready' && user && (
          <div>
            <p className="text-lg font-medium mb-2">
              Приглашение от {ownerName || 'пользователя'}
            </p>
            <p className="text-sm text-zinc-400 mb-6">
              {role === 'owner'
                ? `Вы станете владельцем гардероба «${wardrobeName}». Пригласивший останется соавтором.`
                : `Вы получите доступ к гардеробу «${wardrobeName}» для редактирования и составления образов.`}
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
            <p className="text-sm text-zinc-400">Открываем гардероб «{wardrobeName}»…</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-lg font-medium mb-2">Ошибка</p>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button onClick={() => { clearPendingInvite(); navigate('/') }} className="px-6 py-2.5 rounded-full bg-black text-white text-sm">
              На главную
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
