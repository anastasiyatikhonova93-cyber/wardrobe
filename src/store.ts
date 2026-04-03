import { create } from 'zustand'
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  getDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './lib/firebase'
import { auth } from './lib/firebase'
import type { ClothingItem, ShoppingItem, Outfit, Profile, BodyFeature, Collaborator, SharedWardrobe } from './types'

interface WardrobeState {
  wardrobe: ClothingItem[]
  shopping: ShoppingItem[]
  outfits: Outfit[]
  profile: Profile
  loading: boolean

  isSharedView: boolean
  sharedViewOwnerName: string
  collaborators: Collaborator[]
  sharedWardrobes: SharedWardrobe[]

  subscribe: (uid: string) => void
  unsubscribe: () => void

  addClothing: (item: Omit<ClothingItem, 'id'>) => Promise<void>
  addClothingBatch: (items: Omit<ClothingItem, 'id'>[]) => Promise<void>
  clearWardrobe: () => Promise<void>
  removeClothing: (id: string) => Promise<void>
  updateClothing: (id: string, patch: Partial<ClothingItem>) => Promise<void>

  addShoppingItem: (item: Omit<ShoppingItem, 'id'>) => Promise<void>
  removeShoppingItem: (id: string) => Promise<void>
  confirmShoppingItem: (id: string) => Promise<void>
  updateShoppingItem: (id: string, patch: Partial<ShoppingItem>) => Promise<void>
  addAiSuggestions: (items: Omit<ShoppingItem, 'id'>[]) => Promise<void>
  moveToWardrobe: (id: string) => Promise<void>

  addOutfit: (outfit: Omit<Outfit, 'id'>) => Promise<void>
  removeOutfit: (id: string) => Promise<void>
  setOutfits: (outfits: Omit<Outfit, 'id'>[]) => Promise<void>

  updateProfile: (patch: Partial<Profile>) => Promise<void>
  addBodyFeature: (f: Omit<BodyFeature, 'id'>) => Promise<void>
  removeBodyFeature: (id: string) => Promise<void>

  createInvite: () => Promise<string>
  acceptInvite: (token: string) => Promise<{ ownerUid: string; ownerName: string }>
  removeCollaborator: (uid: string) => Promise<void>
  viewSharedWardrobe: (ownerUid: string, ownerName: string) => void
  viewOwnWardrobe: () => void
}

const defaultProfile: Profile = { features: [], preferredStyles: [] }

let unsubs: Unsubscribe[] = []
let sharedUnsubs: Unsubscribe[] = []
let authUid: string | null = null
let viewingUid: string | null = null
let safetyTimer: ReturnType<typeof setTimeout> | null = null

function userCol(uid: string, name: string) {
  return collection(db, 'capsule', uid, name)
}

function userDoc(uid: string, name: string, id: string) {
  return doc(db, 'capsule', uid, name, id)
}

function profileDoc(uid: string) {
  return doc(db, 'capsule', uid)
}

function subscribeToData(uid: string, set: (partial: Partial<WardrobeState> | ((s: WardrobeState) => Partial<WardrobeState>)) => void) {
  let loaded = 0
  const checkLoaded = () => { if (++loaded >= 5) set({ loading: false }) }
  const onErr = () => checkLoaded()

  // Safety timeout — if listeners don't all fire in 5s, stop loading anyway
  if (safetyTimer) clearTimeout(safetyTimer)
  safetyTimer = setTimeout(() => { safetyTimer = null; set({ loading: false }) }, 5000)

  unsubs.push(
    onSnapshot(userCol(uid, 'wardrobe'), (snap) => {
      set({ wardrobe: snap.docs.map((d) => ({ seasons: [], ...d.data(), id: d.id } as unknown as ClothingItem)) })
      checkLoaded()
    }, onErr),
    onSnapshot(userCol(uid, 'shopping'), (snap) => {
      set({ shopping: snap.docs.map((d) => ({ seasons: [], isAiSuggested: false, isConfirmed: true, ...d.data(), id: d.id } as unknown as ShoppingItem)) })
      checkLoaded()
    }, onErr),
    onSnapshot(userCol(uid, 'outfits'), (snap) => {
      set({ outfits: snap.docs.map((d) => ({ wardrobeItemIds: [], shoppingItemIds: [], ...d.data(), id: d.id } as unknown as Outfit)) })
      checkLoaded()
    }, onErr),
    onSnapshot(userCol(uid, 'features'), (snap) => {
      const features = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BodyFeature))
      set((s) => ({ profile: { ...s.profile, features } }))
      checkLoaded()
    }, onErr),
    onSnapshot(profileDoc(uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        set((s) => ({
          profile: {
            ...s.profile,
            height: d.height,
            weight: d.weight,
            bodyType: d.bodyType,
            preferredStyles: d.preferredStyles ?? [],
          },
        }))
      }
      checkLoaded()
    }, onErr),
  )
}

export const useStore = create<WardrobeState>()((set, get) => ({
  wardrobe: [],
  shopping: [],
  outfits: [],
  profile: defaultProfile,
  loading: true,

  isSharedView: false,
  sharedViewOwnerName: '',
  collaborators: [],
  sharedWardrobes: [],

  subscribe: (uid) => {
    get().unsubscribe()
    authUid = uid
    viewingUid = uid
    set({ loading: true, isSharedView: false, sharedViewOwnerName: '' })

    subscribeToData(uid, set)

    // Subscribe to collaborators list (who has access to my wardrobe)
    unsubs.push(
      onSnapshot(userCol(uid, 'collaborators'), (snap) => {
        set({
          collaborators: snap.docs.map((d) => ({
            uid: d.id,
            ...d.data(),
          } as unknown as Collaborator)),
        })
      }, () => { /* ignore permission errors */ }),
    )

    // Subscribe to shared wardrobes (whose wardrobes I have access to)
    sharedUnsubs.forEach((u) => u())
    sharedUnsubs = []
    const q = query(collection(db, 'invites'), where('acceptedBy', '==', uid), where('used', '==', true))
    sharedUnsubs.push(
      onSnapshot(q, (snap) => {
        set({
          sharedWardrobes: snap.docs.map((d) => ({
            ownerUid: d.data().ownerUid,
            ownerName: d.data().ownerName,
          } as SharedWardrobe)),
        })
      }, () => { /* ignore index/permission errors */ }),
    )
  },

  unsubscribe: () => {
    unsubs.forEach((u) => u())
    unsubs = []
    sharedUnsubs.forEach((u) => u())
    sharedUnsubs = []
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
    authUid = null
    viewingUid = null
    set({ wardrobe: [], shopping: [], outfits: [], profile: defaultProfile, isSharedView: false, sharedViewOwnerName: '' })
  },

  viewSharedWardrobe: (ownerUid, ownerName) => {
    unsubs.forEach((u) => u())
    unsubs = []
    viewingUid = ownerUid
    set({ wardrobe: [], shopping: [], outfits: [], profile: defaultProfile, loading: true, isSharedView: true, sharedViewOwnerName: ownerName })
    subscribeToData(ownerUid, set)
  },

  viewOwnWardrobe: () => {
    if (!authUid) return
    unsubs.forEach((u) => u())
    unsubs = []
    viewingUid = authUid
    set({ wardrobe: [], shopping: [], outfits: [], profile: defaultProfile, loading: true, isSharedView: false, sharedViewOwnerName: '' })
    subscribeToData(authUid, set)

    // Re-subscribe to collaborators
    unsubs.push(
      onSnapshot(userCol(authUid, 'collaborators'), (snap) => {
        set({
          collaborators: snap.docs.map((d) => ({
            uid: d.id,
            ...d.data(),
          } as unknown as Collaborator)),
        })
      }),
    )
  },

  addClothing: async (item) => {
    if (!viewingUid) return
    await addDoc(userCol(viewingUid, 'wardrobe'), item)
  },

  addClothingBatch: async (items) => {
    if (!viewingUid) return
    const BATCH_SIZE = 50
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const chunk = items.slice(i, i + BATCH_SIZE)
      for (const item of chunk) {
        const ref = doc(userCol(viewingUid, 'wardrobe'))
        const clean = Object.fromEntries(
          Object.entries(item).filter(([, v]) => v !== undefined),
        )
        batch.set(ref, clean)
      }
      await batch.commit()
    }
  },

  clearWardrobe: async () => {
    if (!viewingUid || get().isSharedView) return
    const snap = await getDocs(userCol(viewingUid, 'wardrobe'))
    const BATCH_SIZE = 50
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  },

  removeClothing: async (id) => {
    if (!viewingUid) return
    await deleteDoc(userDoc(viewingUid, 'wardrobe', id))
  },

  updateClothing: async (id, patch) => {
    if (!viewingUid) return
    await updateDoc(userDoc(viewingUid, 'wardrobe', id), patch)
  },

  addShoppingItem: async (item) => {
    if (!viewingUid) return
    await addDoc(userCol(viewingUid, 'shopping'), item)
  },

  removeShoppingItem: async (id) => {
    if (!viewingUid) return
    await deleteDoc(userDoc(viewingUid, 'shopping', id))
  },

  confirmShoppingItem: async (id) => {
    if (!viewingUid) return
    await updateDoc(userDoc(viewingUid, 'shopping', id), { isConfirmed: true })
  },

  updateShoppingItem: async (id, patch) => {
    if (!viewingUid) return
    await updateDoc(userDoc(viewingUid, 'shopping', id), patch)
  },

  moveToWardrobe: async (id) => {
    if (!viewingUid) return
    const item = get().shopping.find((i) => i.id === id)
    if (!item) return
    const { name, category, color, seasons, imageUrl, shopUrl } = item
    const clothing: Omit<ClothingItem, 'id'> = { name, category, color, seasons }
    if (imageUrl) clothing.imageUrl = imageUrl
    if (shopUrl) clothing.shopUrl = shopUrl
    await addDoc(userCol(viewingUid, 'wardrobe'), clothing)
    await deleteDoc(userDoc(viewingUid, 'shopping', id))
  },

  addAiSuggestions: async (items) => {
    if (!viewingUid) return
    const batch = writeBatch(db)
    for (const item of items) {
      const ref = doc(userCol(viewingUid, 'shopping'))
      const clean = Object.fromEntries(
        Object.entries(item).filter(([, v]) => v !== undefined),
      )
      batch.set(ref, clean)
    }
    await batch.commit()
  },

  addOutfit: async (outfit) => {
    if (!viewingUid) return
    await addDoc(userCol(viewingUid, 'outfits'), outfit)
  },

  removeOutfit: async (id) => {
    if (!viewingUid) return
    await deleteDoc(userDoc(viewingUid, 'outfits', id))
  },

  setOutfits: async (outfits) => {
    if (!viewingUid || get().isSharedView) return
    const snap = await getDocs(userCol(viewingUid, 'outfits'))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    for (const o of outfits) {
      batch.set(doc(userCol(viewingUid, 'outfits')), o)
    }
    await batch.commit()
  },

  updateProfile: async (patch) => {
    if (!viewingUid || get().isSharedView) return
    await setDoc(profileDoc(viewingUid), patch, { merge: true })
  },

  addBodyFeature: async (f) => {
    if (!viewingUid || get().isSharedView) return
    await addDoc(userCol(viewingUid, 'features'), f)
  },

  removeBodyFeature: async (id) => {
    if (!viewingUid || get().isSharedView) return
    await deleteDoc(userDoc(viewingUid, 'features', id))
  },

  createInvite: async () => {
    if (!authUid) throw new Error('Not authenticated')
    const token = crypto.randomUUID()
    await setDoc(doc(db, 'invites', token), {
      ownerUid: authUid,
      ownerName: auth.currentUser?.displayName ?? '',
      createdAt: serverTimestamp(),
      used: false,
    })
    return `${window.location.origin}/invite/${token}`
  },

  acceptInvite: async (token) => {
    const uid = authUid
    if (!uid) throw new Error('Not authenticated')
    const inviteRef = doc(db, 'invites', token)

    const data = await runTransaction(db, async (tx) => {
      const snap = await tx.get(inviteRef)
      if (!snap.exists()) throw new Error('Приглашение не найдено')
      const d = snap.data()
      if (d.used) throw new Error('Приглашение уже использовано')
      if (d.ownerUid === uid) throw new Error('Нельзя принять своё приглашение')

      tx.update(inviteRef, { used: true, acceptedBy: uid })
      tx.set(doc(db, 'capsule', d.ownerUid, 'collaborators', uid), {
        role: 'stylist',
        displayName: auth.currentUser?.displayName ?? '',
        email: auth.currentUser?.email ?? '',
        addedAt: serverTimestamp(),
      })

      return { ownerUid: d.ownerUid, ownerName: d.ownerName }
    })

    return data
  },

  removeCollaborator: async (uid) => {
    if (!authUid) return
    await deleteDoc(doc(db, 'capsule', authUid, 'collaborators', uid))
  },
}))
