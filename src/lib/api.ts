import { auth } from './firebase'

/** Ошибка вызова /api/db с машиночитаемым кодом сервера (напр. 'no_access'). */
export interface ApiError extends Error {
  code?: string
  status?: number
}

// Все обращения к данным идут через нашу serverless-функцию /api/db (admin SDK),
// а не напрямую к Firestore — на части пользовательских сетей домен Firestore
// заблокирован, а наш сервер к базе достучаться может.
//
// callDb «глупый»: шлёт ровно переданные args (включая wardrobeId, если он есть).
// Логика выбора активного гардероба живёт в сторе — так её можно юнит-тестировать,
// замокав этот модуль.
export async function callDb(op: string, args: Record<string, unknown> = {}): Promise<any> {
  const user = auth.currentUser
  if (!user) throw new Error('Не авторизован')
  const idToken = await user.getIdToken()
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, idToken, ...args }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => null)
    const err = new Error(e?.error ?? `Ошибка базы (${res.status})`) as ApiError
    err.status = res.status
    err.code = e?.code
    throw err
  }
  return res.json()
}
