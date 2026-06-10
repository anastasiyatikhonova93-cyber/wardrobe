import type { IncomingMessage, ServerResponse } from 'http'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

// Подколлекции, к которым разрешён доступ (защита от произвольных путей).
const COLLECTIONS = ['wardrobe', 'shopping', 'outfits', 'features']

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
  if (typeof col !== 'string' || !COLLECTIONS.includes(col)) throw new Error('bad collection')
  return col
}

export default async function handler(req: IncomingMessage, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(501).json({ error: 'FIREBASE_SERVICE_ACCOUNT is not configured' })
  }

  try {
    const body = await readJsonBody(req)
    const { db, auth } = admin()

    const idToken = typeof body?.idToken === 'string' ? body.idToken : null
    if (!idToken) return res.status(401).json({ error: 'idToken required' })

    let uid: string
    try {
      uid = (await auth.verifyIdToken(idToken)).uid
    } catch {
      return res.status(401).json({ error: 'invalid idToken' })
    }

    const base = db.collection('capsule').doc(uid)
    const op = body?.op

    switch (op) {
      case 'load': {
        const [w, s, o, f, p] = await Promise.all([
          base.collection('wardrobe').get(),
          base.collection('shopping').get(),
          base.collection('outfits').get(),
          base.collection('features').get(),
          base.get(),
        ])
        const docs = (snap: FirebaseFirestore.QuerySnapshot) =>
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        return res.json({
          wardrobe: docs(w),
          shopping: docs(s),
          outfits: docs(o),
          features: docs(f),
          profile: p.exists ? p.data() : {},
        })
      }
      case 'add': {
        const col = checkCol(body.col)
        const ref = await base.collection(col).add(clean(body.data ?? {}))
        return res.json({ id: ref.id })
      }
      case 'update': {
        const col = checkCol(body.col)
        if (typeof body.id !== 'string') throw new Error('id required')
        await base.collection(col).doc(body.id).set(clean(body.patch ?? {}), { merge: true })
        return res.json({ ok: true })
      }
      case 'delete': {
        const col = checkCol(body.col)
        if (typeof body.id !== 'string') throw new Error('id required')
        await base.collection(col).doc(body.id).delete()
        return res.json({ ok: true })
      }
      case 'batchAdd': {
        const col = checkCol(body.col)
        const items: Record<string, unknown>[] = Array.isArray(body.items) ? body.items : []
        const ids = await commitInChunks(db, base.collection(col), items)
        return res.json({ ids })
      }
      case 'clear': {
        const col = checkCol(body.col)
        const snap = await base.collection(col).get()
        await deleteAll(db, snap.docs)
        return res.json({ ok: true })
      }
      case 'replace': {
        const col = checkCol(body.col)
        const items: Record<string, unknown>[] = Array.isArray(body.items) ? body.items : []
        const snap = await base.collection(col).get()
        await deleteAll(db, snap.docs)
        const ids = await commitInChunks(db, base.collection(col), items)
        return res.json({ ids })
      }
      case 'setProfile': {
        await base.set(clean(body.patch ?? {}), { merge: true })
        return res.json({ ok: true })
      }
      default:
        return res.status(400).json({ error: 'unknown op' })
    }
  } catch (err) {
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
