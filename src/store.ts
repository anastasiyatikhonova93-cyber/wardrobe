import { create } from 'zustand'
import { auth } from './lib/firebase'
import type {
  ClothingItem,
  ShoppingItem,
  Outfit,
  Profile,
  BodyFeature,
  Collaborator,
  SharedWardrobe,
  Category,
} from './types'
import { DEFAULT_OUTFIT_CATEGORIES } from './types'

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
  updateOutfit: (id: string, patch: Partial<Outfit>) => Promise<void>
  setOutfits: (outfits: Omit<Outfit, 'id'>[]) => Promise<void>

  updateProfile: (patch: Partial<Profile>) => Promise<void>
  addBodyFeature: (f: Omit<BodyFeature, 'id'>) => Promise<void>
  removeBodyFeature: (id: string) => Promise<void>

  addOutfitCategory: (name: string) => Promise<Category | undefined>
  renameOutfitCategory: (id: string, name: string) => Promise<void>
  removeOutfitCategory: (id: string) => Promise<void>

  createInvite: () => Promise<string>
  acceptInvite: (token: string) => Promise<{ ownerUid: string; ownerName: string }>
  removeCollaborator: (uid: string) => Promise<void>
  viewSharedWardrobe: (ownerUid: string, ownerName: string) => void
  viewOwnWardrobe: () => void
}

const defaultProfile: Profile = { features: [], preferredStyles: [] }

// Все обращения к данным идут через нашу serverless-функцию /api/db (admin SDK),
// а не напрямую к Firestore — потому что на части сетей домен Firestore
// заблокирован, а наш сервер к базе достучаться может.
async function callDb(op: string, args: Record<string, unknown> = {}): Promise<any> {
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
    throw new Error(e?.error ?? `Ошибка базы (${res.status})`)
  }
  return res.json()
}

type AnyDoc = Record<string, any>
const asClothing = (d: AnyDoc): ClothingItem => ({ seasons: [], ...d } as unknown as ClothingItem)
const asShopping = (d: AnyDoc): ShoppingItem =>
  ({ seasons: [], isAiSuggested: false, isConfirmed: true, ...d } as unknown as ShoppingItem)
const asOutfit = (d: AnyDoc): Outfit => {
  // Миграция: старое поле `weather` читается как категории, если новое не задано.
  const categories = (d.categories ?? d.weather ?? []) as string[]
  return { wardrobeItemIds: [], shoppingItemIds: [], itemPositions: [], ...d, categories } as unknown as Outfit
}

type SetFn = (partial: Partial<WardrobeState> | ((s: WardrobeState) => Partial<WardrobeState>)) => void

async function loadData(set: SetFn) {
  try {
    const data = await callDb('load')
    set({
      wardrobe: (data.wardrobe ?? []).map(asClothing),
      shopping: (data.shopping ?? []).map(asShopping),
      outfits: (data.outfits ?? []).map(asOutfit),
      profile: {
        features: (data.features ?? []).map((f: AnyDoc) => ({ id: f.id, ...f } as BodyFeature)),
        preferredStyles: data.profile?.preferredStyles ?? [],
        height: data.profile?.height,
        weight: data.profile?.weight,
        bodyType: data.profile?.bodyType,
        outfitCategories: data.profile?.outfitCategories,
      },
      loading: false,
    })
  } catch {
    set({ loading: false })
  }
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

  subscribe: () => {
    set({ loading: true, isSharedView: false, sharedViewOwnerName: '', collaborators: [], sharedWardrobes: [] })
    void loadData(set)
  },

  unsubscribe: () => {
    set({ wardrobe: [], shopping: [], outfits: [], profile: defaultProfile, loading: false, isSharedView: false, sharedViewOwnerName: '' })
  },

  viewSharedWardrobe: () => { /* совместный доступ временно недоступен */ },
  viewOwnWardrobe: () => { set({ loading: true }); void loadData(set) },

  addClothing: async (item) => {
    const { id } = await callDb('add', { col: 'wardrobe', data: item })
    set((s) => ({ wardrobe: [...s.wardrobe, { ...item, id } as ClothingItem] }))
  },

  addClothingBatch: async (items) => {
    const added: ClothingItem[] = []
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25)
      const { ids } = await callDb('batchAdd', { col: 'wardrobe', items: chunk })
      chunk.forEach((it, j) => added.push({ ...it, id: ids[j] } as ClothingItem))
    }
    set((s) => ({ wardrobe: [...s.wardrobe, ...added] }))
  },

  clearWardrobe: async () => {
    await callDb('clear', { col: 'wardrobe' })
    set({ wardrobe: [] })
  },

  removeClothing: async (id) => {
    await callDb('delete', { col: 'wardrobe', id })
    set((s) => ({ wardrobe: s.wardrobe.filter((i) => i.id !== id) }))
  },

  updateClothing: async (id, patch) => {
    await callDb('update', { col: 'wardrobe', id, patch })
    set((s) => ({ wardrobe: s.wardrobe.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  },

  addShoppingItem: async (item) => {
    const { id } = await callDb('add', { col: 'shopping', data: item })
    set((s) => ({ shopping: [...s.shopping, { ...item, id } as ShoppingItem] }))
  },

  removeShoppingItem: async (id) => {
    await callDb('delete', { col: 'shopping', id })
    set((s) => ({ shopping: s.shopping.filter((i) => i.id !== id) }))
  },

  confirmShoppingItem: async (id) => {
    await callDb('update', { col: 'shopping', id, patch: { isConfirmed: true } })
    set((s) => ({ shopping: s.shopping.map((i) => (i.id === id ? { ...i, isConfirmed: true } : i)) }))
  },

  updateShoppingItem: async (id, patch) => {
    await callDb('update', { col: 'shopping', id, patch })
    set((s) => ({ shopping: s.shopping.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  },

  moveToWardrobe: async (id) => {
    const item = get().shopping.find((i) => i.id === id)
    if (!item) return
    const { name, category, color, seasons, imageUrl, shopUrl } = item
    const clothing: Omit<ClothingItem, 'id'> = { name, category, color, seasons }
    if (imageUrl) clothing.imageUrl = imageUrl
    if (shopUrl) clothing.shopUrl = shopUrl
    const { id: newId } = await callDb('add', { col: 'wardrobe', data: clothing })
    await callDb('delete', { col: 'shopping', id })
    set((s) => ({
      wardrobe: [...s.wardrobe, { ...clothing, id: newId } as ClothingItem],
      shopping: s.shopping.filter((i) => i.id !== id),
    }))
  },

  addAiSuggestions: async (items) => {
    const { ids } = await callDb('batchAdd', { col: 'shopping', items })
    set((s) => ({ shopping: [...s.shopping, ...items.map((it, j) => ({ ...it, id: ids[j] } as ShoppingItem))] }))
  },

  addOutfit: async (outfit) => {
    const { id } = await callDb('add', { col: 'outfits', data: outfit })
    set((s) => ({ outfits: [...s.outfits, { ...outfit, id } as Outfit] }))
  },

  removeOutfit: async (id) => {
    await callDb('delete', { col: 'outfits', id })
    set((s) => ({ outfits: s.outfits.filter((o) => o.id !== id) }))
  },

  updateOutfit: async (id, patch) => {
    await callDb('update', { col: 'outfits', id, patch })
    set((s) => ({ outfits: s.outfits.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))
  },

  setOutfits: async (outfits) => {
    const { ids } = await callDb('replace', { col: 'outfits', items: outfits })
    set({ outfits: outfits.map((o, j) => ({ ...o, id: ids[j] } as Outfit)) })
  },

  updateProfile: async (patch) => {
    await callDb('setProfile', { patch })
    set((s) => ({ profile: { ...s.profile, ...patch } }))
  },

  addBodyFeature: async (f) => {
    const { id } = await callDb('add', { col: 'features', data: f })
    set((s) => ({ profile: { ...s.profile, features: [...s.profile.features, { ...f, id } as BodyFeature] } }))
  },

  removeBodyFeature: async (id) => {
    await callDb('delete', { col: 'features', id })
    set((s) => ({ profile: { ...s.profile, features: s.profile.features.filter((f) => f.id !== id) } }))
  },

  addOutfitCategory: async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = get().profile.outfitCategories ?? DEFAULT_OUTFIT_CATEGORIES
    const category: Category = { id: crypto.randomUUID(), name: trimmed }
    const next = [...current, category]
    await callDb('setProfile', { patch: { outfitCategories: next } })
    set((s) => ({ profile: { ...s.profile, outfitCategories: next } }))
    return category
  },

  renameOutfitCategory: async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = get().profile.outfitCategories ?? DEFAULT_OUTFIT_CATEGORIES
    const next = current.map((c) => (c.id === id ? { ...c, name: trimmed } : c))
    await callDb('setProfile', { patch: { outfitCategories: next } })
    set((s) => ({ profile: { ...s.profile, outfitCategories: next } }))
  },

  removeOutfitCategory: async (id) => {
    const current = get().profile.outfitCategories ?? DEFAULT_OUTFIT_CATEGORIES
    const next = current.filter((c) => c.id !== id)
    await callDb('setProfile', { patch: { outfitCategories: next } })

    // Зачистка ссылок на удалённую категорию у образов.
    const affected = get().outfits.filter((o) => (o.categories ?? []).includes(id))
    for (const o of affected) {
      await callDb('update', {
        col: 'outfits',
        id: o.id,
        patch: { categories: (o.categories ?? []).filter((c) => c !== id) },
      })
    }
    set((s) => ({
      profile: { ...s.profile, outfitCategories: next },
      outfits: s.outfits.map((o) =>
        (o.categories ?? []).includes(id)
          ? { ...o, categories: (o.categories ?? []).filter((c) => c !== id) }
          : o,
      ),
    }))
  },

  createInvite: async () => { throw new Error('Совместный доступ временно недоступен') },
  acceptInvite: async () => { throw new Error('Совместный доступ временно недоступен') },
  removeCollaborator: async () => { /* недоступно */ },
}))
