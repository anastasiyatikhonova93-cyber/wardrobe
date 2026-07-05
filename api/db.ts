import type { IncomingMessage, ServerResponse } from 'http'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import {
  HttpError,
  resolveWardrobeId,
  assertMember,
  assertOwner,
  isOwner,
  roleOf,
  stripWorkspaceFields,
  planInviteAcceptance,
  type WorkspaceDoc,
} from './_authz.js' // .js — Vercel компилит api/ как nodenext (расширение обязательно)

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

// Подколлекции, к которым разрешён доступ (защита от произвольных путей).
const COLLECTIONS = ['wardrobe', 'shopping', 'outfits', 'features', 'boards']

let app: App | undefined
function admin() {
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string)) })
    getFirestore(app).settings({ ignoreUndefinedProperties: true })
  }
  return { db: getFirestore(app), auth: getAuth(app) }
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

function checkCol(col: unknown): string {
  if (typeof col !== 'string' || !COLLECTIONS.includes(col)) throw new HttpError(400, 'bad collection')
  return col
}

interface DecodedUser {
  uid: string
  name?: string
  email?: string
}

/** Резолвит wardrobeId из тела, читает документ и проверяет членство. ЕДИНСТВЕННАЯ
 *  точка авторизации — ни одна data-операция не ходит в `capsule.doc()` мимо неё. */
async function loadWorkspace(
  db: Firestore,
  rawId: unknown,
  uid: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: WorkspaceDoc | null; wardrobeId: string }> {
  const wardrobeId = resolveWardrobeId(rawId, uid)
  const ref = db.collection('capsule').doc(wardrobeId)
  const snap = await ref.get()
  const data = snap.exists ? (snap.data() as WorkspaceDoc) : null
  assertMember(data, uid, wardrobeId)
  return { ref, data, wardrobeId }
}

/** Ленивая безопасная миграция legacy-документа `capsule/{uid}`: дописывает служебные
 *  поля workspace через merge, не трогая профиль и подколлекции. Идемпотентно. */
async function backfillLegacy(
  ref: FirebaseFirestore.DocumentReference,
  data: WorkspaceDoc | null,
  uid: string,
  user: DecodedUser,
): Promise<void> {
  if (!data || data.ownerUid) return // нет дока (создастся первой записью) или уже мигрирован
  await ref.set(
    {
      ownerUid: uid,
      memberUids: FieldValue.arrayUnion(uid),
      members: {
        [uid]: { role: 'owner', displayName: user.name ?? '', email: user.email ?? '', addedAt: FieldValue.serverTimestamp() },
      },
      name: data.name ?? 'Мой гардероб',
      schemaVersion: 2,
      createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

function metaName(id: string, data: WorkspaceDoc | null, uid: string): string {
  return data?.name ?? (id === uid ? 'Мой гардероб' : 'Гардероб')
}

function toMeta(id: string, data: WorkspaceDoc | null, uid: string) {
  return {
    id,
    name: metaName(id, data, uid),
    ownerUid: data?.ownerUid ?? (id === uid ? uid : ''),
    role: roleOf(data, uid, id),
    memberCount: Array.isArray(data?.memberUids) ? data!.memberUids!.length : 1,
  }
}

function membersList(data: WorkspaceDoc | null, uid: string, user: DecodedUser) {
  const members = data?.members
  if (members && Object.keys(members).length) {
    return Object.entries(members).map(([muid, m]) => ({
      uid: muid,
      displayName: m.displayName ?? '',
      email: m.email ?? '',
      role: m.role === 'owner' ? 'owner' : 'member',
    }))
  }
  // legacy: членов нет — синтезируем самого владельца (текущего пользователя)
  return [{ uid, displayName: user.name ?? '', email: user.email ?? '', role: 'owner' as const }]
}

export default async function handler(req: IncomingMessage, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(501).json({ error: 'FIREBASE_SERVICE_ACCOUNT is not configured' })
  }

  try {
    const body = await readJsonBody(req)
    if (!body) return res.status(400).json({ error: 'empty body' })
    const { db, auth } = admin()

    const idToken = typeof body.idToken === 'string' ? body.idToken : null
    if (!idToken) return res.status(401).json({ error: 'idToken required' })

    let user: DecodedUser
    try {
      const decoded = await auth.verifyIdToken(idToken)
      user = { uid: decoded.uid, name: decoded.name as string | undefined, email: decoded.email }
    } catch {
      return res.status(401).json({ error: 'invalid idToken' })
    }
    const uid = user.uid
    const op = body?.op

    switch (op) {
      // ── Данные активного гардероба (требуют членства) ──────────────────────
      case 'load': {
        const { ref, data } = await loadWorkspace(db, body.wardrobeId, uid)
        await backfillLegacy(ref, data, uid, user)
        const [w, s, o, f, b] = await Promise.all([
          ref.collection('wardrobe').get(),
          ref.collection('shopping').get(),
          ref.collection('outfits').get(),
          ref.collection('features').get(),
          ref.collection('boards').get(),
        ])
        const docs = (snap: FirebaseFirestore.QuerySnapshot) =>
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const root = data ?? {}
        return res.json({
          wardrobe: docs(w),
          shopping: docs(s),
          outfits: docs(o),
          features: docs(f),
          boards: docs(b),
          profile: stripWorkspaceFields(root as Record<string, unknown>),
          workspace: {
            id: ref.id,
            name: metaName(ref.id, data, uid),
            ownerUid: data?.ownerUid ?? uid,
            role: roleOf(data, uid, ref.id),
          },
        })
      }
      case 'add': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const col = checkCol(body.col)
        const added = await ref.collection(col).add(clean(body.data ?? {}))
        return res.json({ id: added.id })
      }
      case 'update': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const col = checkCol(body.col)
        if (typeof body.id !== 'string') throw new HttpError(400, 'id required')
        await ref.collection(col).doc(body.id).set(clean(body.patch ?? {}), { merge: true })
        return res.json({ ok: true })
      }
      case 'delete': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const col = checkCol(body.col)
        if (typeof body.id !== 'string') throw new HttpError(400, 'id required')
        await ref.collection(col).doc(body.id).delete()
        return res.json({ ok: true })
      }
      case 'batchAdd': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const col = checkCol(body.col)
        const items: Record<string, unknown>[] = Array.isArray(body.items) ? body.items : []
        const ids = await commitInChunks(db, ref.collection(col), items)
        return res.json({ ids })
      }
      case 'clear': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const col = checkCol(body.col)
        const snap = await ref.collection(col).get()
        await deleteAll(db, snap.docs)
        return res.json({ ok: true })
      }
      case 'replace': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const col = checkCol(body.col)
        const items: Record<string, unknown>[] = Array.isArray(body.items) ? body.items : []
        const snap = await ref.collection(col).get()
        await deleteAll(db, snap.docs)
        const ids = await commitInChunks(db, ref.collection(col), items)
        return res.json({ ids })
      }
      case 'setProfile': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        // strip служебных полей — защита от захвата гардероба через профильный patch.
        await ref.set(clean(stripWorkspaceFields(body.patch)), { merge: true })
        return res.json({ ok: true })
      }

      // ── Управление гардеробами и членством ───────────────────────────────
      case 'listWardrobes': {
        const snap = await db.collection('capsule').where('memberUids', 'array-contains', uid).get()
        const wardrobes = snap.docs
          .filter((d) => !(d.data() as WorkspaceDoc).deleting)
          .map((d) => toMeta(d.id, d.data() as WorkspaceDoc, uid))
        // Личный `capsule/{uid}` мог не попасть (legacy без memberUids) — добавляем явно.
        if (!wardrobes.some((w) => w.id === uid)) {
          const personal = await db.collection('capsule').doc(uid).get()
          if (personal.exists && !(personal.data() as WorkspaceDoc).deleting) {
            wardrobes.unshift(toMeta(uid, personal.data() as WorkspaceDoc, uid))
          }
        }
        return res.json({ wardrobes })
      }
      case 'createWardrobe': {
        const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Новый гардероб'
        const ref = db.collection('capsule').doc()
        await ref.set({
          ownerUid: uid,
          name,
          memberUids: [uid],
          members: { [uid]: { role: 'owner', displayName: user.name ?? '', email: user.email ?? '', addedAt: FieldValue.serverTimestamp() } },
          schemaVersion: 2,
          createdAt: FieldValue.serverTimestamp(),
        })
        return res.json({ id: ref.id, name })
      }
      case 'renameWardrobe': {
        const { ref } = await loadWorkspace(db, body.wardrobeId, uid)
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name) throw new HttpError(400, 'name required')
        await ref.set({ name }, { merge: true })
        return res.json({ ok: true })
      }
      case 'deleteWardrobe': {
        const { ref, data, wardrobeId } = await loadWorkspace(db, body.wardrobeId, uid)
        assertOwner(data, uid, wardrobeId)
        if (wardrobeId === uid) throw new HttpError(400, 'cannot delete personal wardrobe')
        // Мягкое удаление: помечаем `deleting` и опустошаем членство — гардероб исчезает
        // у всех, но подколлекции физически целы (безопасность, история инцидента).
        // members удаляем целиком, чтобы сохранить инвариант memberUids === keys(members).
        await ref.set({ deleting: true, memberUids: [], members: FieldValue.delete() }, { merge: true })
        return res.json({ ok: true })
      }
      case 'leaveWardrobe': {
        const wardrobeId = resolveWardrobeId(body.wardrobeId, uid)
        if (wardrobeId === uid) throw new HttpError(400, 'cannot leave personal wardrobe')
        const ref = db.collection('capsule').doc(wardrobeId)
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref)
          const data = snap.exists ? (snap.data() as WorkspaceDoc) : null
          assertMember(data, uid, wardrobeId)
          if (isOwner(data, uid, wardrobeId)) throw new HttpError(400, 'owner cannot leave, delete instead')
          tx.update(ref, {
            memberUids: FieldValue.arrayRemove(uid),
            [`members.${uid}`]: FieldValue.delete(),
          })
        })
        return res.json({ ok: true })
      }
      case 'listMembers': {
        const { data } = await loadWorkspace(db, body.wardrobeId, uid)
        return res.json({ members: membersList(data, uid, user) })
      }
      case 'removeMember': {
        const wardrobeId = resolveWardrobeId(body.wardrobeId, uid)
        const targetUid = body.memberUid
        if (typeof targetUid !== 'string' || !targetUid) throw new HttpError(400, 'memberUid required')
        const ref = db.collection('capsule').doc(wardrobeId)
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref)
          const data = snap.exists ? (snap.data() as WorkspaceDoc) : null
          assertMember(data, uid, wardrobeId)
          assertOwner(data, uid, wardrobeId)
          if (!data) return // личный гардероб ещё не материализован — удалять нечего
          if (targetUid === (data.ownerUid ?? wardrobeId)) throw new HttpError(400, 'cannot remove owner')
          tx.update(ref, {
            memberUids: FieldValue.arrayRemove(targetUid),
            [`members.${targetUid}`]: FieldValue.delete(),
          })
        })
        return res.json({ ok: true })
      }

      // ── Приглашения ──────────────────────────────────────────────────────
      case 'createInvite': {
        const { data, wardrobeId } = await loadWorkspace(db, body.wardrobeId, uid)
        const role = body.role === 'owner' ? 'owner' : 'member'
        // Ссылку-хэндофф (передача владения) может выпустить только владелец — иначе
        // рядовой участник выписал бы owner-ссылку и захватил гардероб. Личный гардероб
        // передать нельзя: владелец остался бы «застрявшим» на доке с id === его uid.
        if (role === 'owner') {
          assertOwner(data, uid, wardrobeId)
          if (wardrobeId === uid) throw new HttpError(400, 'нельзя передать личный гардероб')
        }
        const ref = db.collection('invites').doc()
        await ref.set({
          wardrobeId,
          ownerName: user.name ?? user.email ?? 'Пользователь',
          wardrobeName: metaName(wardrobeId, data, uid),
          role,
          createdAt: FieldValue.serverTimestamp(),
          revoked: false,
          maxUses: 1,
          useCount: 0,
          acceptedBy: [],
        })
        return res.json({ token: ref.id })
      }
      case 'inviteInfo': {
        const token = body.token
        if (typeof token !== 'string' || !token) throw new HttpError(400, 'token required')
        const snap = await db.collection('invites').doc(token).get()
        if (!snap.exists) return res.json({ status: 'not_found' })
        const inv = snap.data() as Record<string, unknown>
        let status = 'ready'
        if (inv.revoked) status = 'revoked'
        else if (typeof inv.maxUses === 'number' && ((inv.useCount as number) ?? 0) >= inv.maxUses) status = 'used'
        return res.json({
          status,
          ownerName: inv.ownerName ?? '',
          wardrobeName: inv.wardrobeName ?? '',
          role: inv.role === 'owner' ? 'owner' : 'member',
        })
      }
      case 'acceptInvite': {
        const token = body.token
        if (typeof token !== 'string' || !token) throw new HttpError(400, 'token required')
        const result = await db.runTransaction(async (tx) => {
          const inviteRef = db.collection('invites').doc(token)
          const inviteSnap = await tx.get(inviteRef)
          if (!inviteSnap.exists) throw new HttpError(404, 'приглашение не найдено')
          const inv = inviteSnap.data() as Record<string, unknown>
          if (inv.revoked) throw new HttpError(410, 'приглашение отозвано')

          const wsRef = db.collection('capsule').doc(inv.wardrobeId as string)
          const wsSnap = await tx.get(wsRef)
          const ws = wsSnap.exists ? (wsSnap.data() as WorkspaceDoc) : null
          if (!ws || ws.deleting) throw new HttpError(410, 'гардероб больше не существует')

          const memberUids = Array.isArray(ws.memberUids) ? ws.memberUids : ws.ownerUid ? [ws.ownerUid] : []
          // Эффективный владелец: для legacy/личного дока ownerUid отсутствует, но
          // владелец = uid, равный wardrobeId. Без этого хэндофф выкинул бы прежнего
          // владельца из доступа вместо понижения до member.
          const currentOwner = ws.ownerUid ?? (inv.wardrobeId as string)
          const isHandoff = inv.role === 'owner'
          // Идемпотентность: повторный клик/ретрай/self → успех без записи. НО owner-ссылку,
          // принятую уже-участником (который ещё не владелец), НЕ глушим — иначе передача
          // владения молча не состоялась бы.
          if (memberUids.includes(uid) && (!isHandoff || currentOwner === uid)) {
            return { wardrobeId: inv.wardrobeId as string, name: ws.name ?? 'Гардероб' }
          }
          const useCount = (inv.useCount as number) ?? 0
          if (typeof inv.maxUses === 'number' && useCount >= inv.maxUses) {
            throw new HttpError(410, 'лимит активаций исчерпан')
          }

          const plan = planInviteAcceptance(currentOwner, uid, inv.role as string)
          const update: Record<string, unknown> = {
            memberUids: FieldValue.arrayUnion(uid),
            [`members.${uid}`]: {
              role: plan.accepterRole,
              displayName: user.name ?? '',
              email: user.email ?? '',
              addedAt: FieldValue.serverTimestamp(),
            },
          }
          if (plan.accepterRole === 'owner') {
            update.ownerUid = plan.newOwnerUid
            if (plan.demotedUid) {
              // Прежний владелец сохраняет доступ как member (в т.ч. для legacy-дока,
              // где его ещё не было в members/memberUids).
              update.memberUids = FieldValue.arrayUnion(uid, plan.demotedUid)
              const prev = ws.members?.[plan.demotedUid]
              update[`members.${plan.demotedUid}`] = {
                role: 'member',
                displayName: prev?.displayName ?? '',
                email: prev?.email ?? '',
                addedAt: FieldValue.serverTimestamp(),
              }
            }
          }
          tx.update(wsRef, update)
          tx.update(inviteRef, { useCount: FieldValue.increment(1), acceptedBy: FieldValue.arrayUnion(uid) })
          return { wardrobeId: inv.wardrobeId as string, name: ws.name ?? 'Гардероб' }
        })
        return res.json(result)
      }

      default:
        return res.status(400).json({ error: 'unknown op' })
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.code).json({ error: err.message, code: err.publicCode })
    }
    const message = err instanceof Error ? err.message : 'unknown error'
    return res.status(500).json({ error: message })
  }
}

async function commitInChunks(
  db: Firestore,
  col: FirebaseFirestore.CollectionReference,
  items: Record<string, unknown>[],
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch()
    for (const item of items.slice(i, i + 400)) {
      const ref = col.doc()
      batch.set(ref, clean(item))
      ids.push(ref.id)
    }
    await batch.commit()
  }
  return ids
}

async function deleteAll(
  db: Firestore,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

interface DbBody {
  idToken?: unknown
  op?: unknown
  col?: unknown
  id?: unknown
  data?: Record<string, unknown>
  patch?: Record<string, unknown>
  items?: unknown
  wardrobeId?: unknown
  name?: unknown
  role?: unknown
  token?: unknown
  memberUid?: unknown
}

function readJsonBody(req: IncomingMessage): Promise<DbBody | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 6 * 1024 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}
