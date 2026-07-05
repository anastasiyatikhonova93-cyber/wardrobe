// Чистые хелперы авторизации мульти-гардеробов. Без зависимостей от Firebase —
// тестируются юнитами (api/_authz.test.ts). Используются в api/db.ts.
//
// Модель: документ `capsule/{wardrobeId}` — рабочее пространство-гардероб. wardrobeId
// либо равен uid владельца (личный/legacy-гардероб, обратная совместимость), либо
// сгенерированный id. Доступ определяется членством (`memberUids`).

/** Код-несущая ошибка для маппинга в HTTP-статус в обработчике. */
export class HttpError extends Error {
  code: number
  /** Машиночитаемый код для клиента (напр. 'no_access', чтобы отличить отзыв
   *  доступа от сетевой ошибки). */
  publicCode?: string
  constructor(code: number, message: string, publicCode?: string) {
    super(message)
    this.name = 'HttpError'
    this.code = code
    this.publicCode = publicCode
  }
}

/** Минимальная форма документа гардероба для проверок. Поля могут отсутствовать у
 *  немигрированного legacy-документа. */
export interface WorkspaceDoc {
  ownerUid?: string
  memberUids?: string[]
  members?: Record<string, { role?: string; displayName?: string; email?: string }>
  deleting?: boolean
  name?: string
  createdAt?: unknown
}

/** Служебные поля workspace, которые НЕЛЬЗЯ менять клиентским patch — иначе участник
 *  через setProfile перепишет владельца/членство и захватит гардероб. */
export const WORKSPACE_FIELDS: readonly string[] = [
  'ownerUid', 'name', 'memberUids', 'members', 'schemaVersion', 'deleting', 'createdAt',
]

/** Пустой/нестроковый wardrobeId → собственный uid (личный/legacy-гардероб). */
export function resolveWardrobeId(raw: unknown, uid: string): string {
  if (typeof raw === 'string' && raw) return raw
  return uid
}

/** Является ли uid участником гардероба. */
export function isMember(doc: WorkspaceDoc | null | undefined, uid: string, wardrobeId: string): boolean {
  if (!doc) return wardrobeId === uid // документа ещё нет — это свой личный, разрешаем
  const members = Array.isArray(doc.memberUids) ? doc.memberUids : []
  if (members.includes(uid)) return true
  // legacy: не мигрирован (нет ownerUid и memberUids), но это собственный личный док.
  if (members.length === 0 && !doc.ownerUid && wardrobeId === uid) return true
  return false
}

/** Кидает 404 (НЕ 403 — не палим существование чужих id), если uid не член. */
export function assertMember(doc: WorkspaceDoc | null | undefined, uid: string, wardrobeId: string): void {
  if (doc?.deleting) throw new HttpError(404, 'not found', 'no_access')
  if (!isMember(doc, uid, wardrobeId)) throw new HttpError(404, 'not found', 'no_access')
}

/** Владелец гардероба (legacy без ownerUid → владелец = сам для личного). */
export function isOwner(doc: WorkspaceDoc | null | undefined, uid: string, wardrobeId: string): boolean {
  if (!doc) return wardrobeId === uid
  if (doc.ownerUid) return doc.ownerUid === uid
  return wardrobeId === uid
}

export function assertOwner(doc: WorkspaceDoc | null | undefined, uid: string, wardrobeId: string): void {
  if (!isOwner(doc, uid, wardrobeId)) throw new HttpError(403, 'forbidden', 'not_owner')
}

/** Роль текущего uid в гардеробе ('owner' | 'member'). */
export function roleOf(doc: WorkspaceDoc | null | undefined, uid: string, wardrobeId: string): 'owner' | 'member' {
  if (isOwner(doc, uid, wardrobeId)) return 'owner'
  const r = doc?.members?.[uid]?.role
  return r === 'owner' ? 'owner' : 'member'
}

/** Убирает служебные workspace-поля из произвольного patch. */
export function stripWorkspaceFields(patch: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!patch || typeof patch !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!WORKSPACE_FIELDS.includes(k)) out[k] = v
  }
  return out
}

export interface InviteAcceptancePlan {
  accepterRole: 'owner' | 'member'
  newOwnerUid: string
  /** Прежний владелец, которого нужно понизить до member (хэндофф клиенту). */
  demotedUid: string | null
}

/** Чистая логика смены ролей при принятии приглашения.
 *  Роль 'owner' (ссылка «Передать клиенту») → принявший становится владельцем,
 *  прежний владелец понижается до member (доступ сохраняется). */
export function planInviteAcceptance(
  currentOwnerUid: string | undefined,
  accepterUid: string,
  inviteRole: string | undefined,
): InviteAcceptancePlan {
  if (inviteRole === 'owner') {
    return {
      accepterRole: 'owner',
      newOwnerUid: accepterUid,
      demotedUid: currentOwnerUid && currentOwnerUid !== accepterUid ? currentOwnerUid : null,
    }
  }
  return { accepterRole: 'member', newOwnerUid: currentOwnerUid ?? accepterUid, demotedUid: null }
}
