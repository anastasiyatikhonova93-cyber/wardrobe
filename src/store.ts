import { create } from 'zustand'
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './lib/firebase'
import type { ClothingItem, ShoppingItem, Outfit, Profile, BodyFeature } from './types'

interface WardrobeState {
  wardrobe: ClothingItem[]
  shopping: ShoppingItem[]
  outfits: Outfit[]
  profile: Profile
  loading: boolean

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
  updateOutfit: (id: string, patch: Partial<Outfit>) => Promise<void>
  setOutfits: (outfits: Omit<Outfit, 'id'>[]) => Promise<void>

  updateProfile: (patch: Partial<Profile>) => Promise<void>
  addBodyFeature: (f: Omit<BodyFeature, 'id'>) => Promise<void>
  removeBodyFeature: (id: string) => Promise<void>
}

const defaultProfile: Profile = { features: [], preferredStyles: [] }

let unsubs: Unsubscribe[] = []
let currentUid: string | null = null

function userCol(uid: string, name: string) {
  return collection(db, 'capsule', uid, name)
}

function userDoc(uid: string, name: string, id: string) {
  return doc(db, 'capsule', uid, name, id)
}

function profileDoc(uid: string) {
  return doc(db, 'capsule', uid)
}

export const useStore = create<WardrobeState>()((set, get) => ({
  wardrobe: [],
  shopping: [],
  outfits: [],
  profile: defaultProfile,
  loading: true,

  subscribe: (uid) => {
    get().unsubscribe()
    currentUid = uid
    set({ loading: true })

    let loaded = 0
    const checkLoaded = () => { if (++loaded >= 5) set({ loading: false }) }
    const onErr = () => checkLoaded()

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
        set({ outfits: snap.docs.map((d) => ({ wardrobeItemIds: [], shoppingItemIds: [], itemPositions: [], ...d.data(), id: d.id } as unknown as Outfit)) })
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
  },

  unsubscribe: () => {
    unsubs.forEach((u) => u())
    unsubs = []
    currentUid = null
    set({ wardrobe: [], shopping: [], outfits: [], profile: defaultProfile })
  },

  addClothing: async (item) => {
    if (!currentUid) return
    await addDoc(userCol(currentUid, 'wardrobe'), item)
  },

  addClothingBatch: async (items) => {
    if (!currentUid) return
    const BATCH_SIZE = 50
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const chunk = items.slice(i, i + BATCH_SIZE)
      for (const item of chunk) {
        const ref = doc(userCol(currentUid, 'wardrobe'))
        const clean = Object.fromEntries(
          Object.entries(item).filter(([, v]) => v !== undefined),
        )
        batch.set(ref, clean)
      }
      await batch.commit()
    }
  },

  clearWardrobe: async () => {
    if (!currentUid) return
    const snap = await getDocs(userCol(currentUid, 'wardrobe'))
    const BATCH_SIZE = 50
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  },

  removeClothing: async (id) => {
    if (!currentUid) return
    await deleteDoc(userDoc(currentUid, 'wardrobe', id))
  },

  updateClothing: async (id, patch) => {
    if (!currentUid) return
    await updateDoc(userDoc(currentUid, 'wardrobe', id), patch)
  },

  addShoppingItem: async (item) => {
    if (!currentUid) return
    await addDoc(userCol(currentUid, 'shopping'), item)
  },

  removeShoppingItem: async (id) => {
    if (!currentUid) return
    await deleteDoc(userDoc(currentUid, 'shopping', id))
  },

  confirmShoppingItem: async (id) => {
    if (!currentUid) return
    await updateDoc(userDoc(currentUid, 'shopping', id), { isConfirmed: true })
  },

  updateShoppingItem: async (id, patch) => {
    if (!currentUid) return
    await updateDoc(userDoc(currentUid, 'shopping', id), patch)
  },

  moveToWardrobe: async (id) => {
    if (!currentUid) return
    const item = get().shopping.find((i) => i.id === id)
    if (!item) return
    const { name, category, color, seasons, imageUrl, shopUrl } = item
    const clothing: Omit<ClothingItem, 'id'> = { name, category, color, seasons }
    if (imageUrl) clothing.imageUrl = imageUrl
    if (shopUrl) clothing.shopUrl = shopUrl
    await addDoc(userCol(currentUid, 'wardrobe'), clothing)
    await deleteDoc(userDoc(currentUid, 'shopping', id))
  },

  addAiSuggestions: async (items) => {
    if (!currentUid) return
    const batch = writeBatch(db)
    for (const item of items) {
      const ref = doc(userCol(currentUid, 'shopping'))
      const clean = Object.fromEntries(
        Object.entries(item).filter(([, v]) => v !== undefined),
      )
      batch.set(ref, clean)
    }
    await batch.commit()
  },

  addOutfit: async (outfit) => {
    if (!currentUid) return
    await addDoc(userCol(currentUid, 'outfits'), outfit)
  },

  removeOutfit: async (id) => {
    if (!currentUid) return
    await deleteDoc(userDoc(currentUid, 'outfits', id))
  },

  updateOutfit: async (id, patch) => {
    if (!currentUid) return
    await updateDoc(userDoc(currentUid, 'outfits', id), patch)
  },

  setOutfits: async (outfits) => {
    if (!currentUid) return
    const snap = await getDocs(userCol(currentUid, 'outfits'))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    for (const o of outfits) {
      batch.set(doc(userCol(currentUid, 'outfits')), o)
    }
    await batch.commit()
  },

  updateProfile: async (patch) => {
    if (!currentUid) return
    await setDoc(profileDoc(currentUid), patch, { merge: true })
  },

  addBodyFeature: async (f) => {
    if (!currentUid) return
    await addDoc(userCol(currentUid, 'features'), f)
  },

  removeBodyFeature: async (id) => {
    if (!currentUid) return
    await deleteDoc(userDoc(currentUid, 'features', id))
  },
}))
