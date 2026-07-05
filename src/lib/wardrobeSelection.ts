import type { WardrobeMeta } from '../types'

// Чистые хелперы выбора активного гардероба + обёртки над localStorage. Логика
// вынесена сюда, чтобы юнит-тестировать без стора.

const STORAGE_PREFIX = 'activeWardrobe:'

/** Ключ привязан к uid — иначе при смене аккаунта на устройстве восстановится чужой id. */
export function getStoredWardrobeId(uid: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + uid)
  } catch {
    return null
  }
}

export function saveStoredWardrobeId(uid: string, id: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + uid, id)
  } catch {
    /* ignore (приватный режим и т.п.) */
  }
}

/** Гарантирует наличие личного гардероба (id===uid) даже если сервер вернул пусто
 *  (legacy-юзер без memberUids). Проставляет isPersonal каждому. */
export function normalizeWardrobes(list: WardrobeMeta[], uid: string): WardrobeMeta[] {
  const withFlag = list.map((w) => ({ ...w, isPersonal: w.id === uid }))
  if (!withFlag.some((w) => w.isPersonal)) {
    const personal: WardrobeMeta = { id: uid, name: 'Мой гардероб', ownerUid: uid, role: 'owner', isPersonal: true }
    return [personal, ...withFlag]
  }
  return withFlag
}

/** Выбор активного: сохранённый (если доступен) → личный → первый. */
export function pickActiveWardrobe(wardrobes: WardrobeMeta[], storedId: string | null, uid: string): string {
  if (storedId && wardrobes.some((w) => w.id === storedId)) return storedId
  const personal = wardrobes.find((w) => w.id === uid)
  if (personal) return personal.id
  return wardrobes[0]?.id ?? uid
}

/** Какой гардероб сделать активным после удаления/потери доступа к `removedId`.
 *  Если активным был не он — активный сохраняется; иначе → личный → первый. */
export function nextActiveAfterRemoval(
  wardrobes: WardrobeMeta[],
  removedId: string,
  activeId: string | null,
  uid: string,
): string {
  const remaining = wardrobes.filter((w) => w.id !== removedId)
  if (activeId && activeId !== removedId && remaining.some((w) => w.id === activeId)) return activeId
  const personal = remaining.find((w) => w.id === uid)
  if (personal) return personal.id
  return remaining[0]?.id ?? uid
}
