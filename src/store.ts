import { create } from 'zustand'
import { auth } from './lib/firebase'
import { callDb, type ApiError } from './lib/api'
import { asClothing, asShopping, asOutfit, asBoard } from './lib/adapters'
import {
  normalizeWardrobes,
  pickActiveWardrobe,
  nextActiveAfterRemoval,
  getStoredWardrobeId,
  saveStoredWardrobeId,
} from './lib/wardrobeSelection'
import type {
  ClothingItem,
  ShoppingItem,
  Outfit,
  Board,
  Profile,
  BodyFeature,
  Category,
  WardrobeMeta,
  WardrobeMember,
  WardrobeRole,
} from './types'
import { DEFAULT_OUTFIT_CATEGORIES } from './types'

interface WardrobeState {
  wardrobe: ClothingItem[]
  shopping: ShoppingItem[]
  outfits: Outfit[]
  boards: Board[]
  profile: Profile
  loading: boolean
  /** Сообщение об ошибке загрузки данных. null — загрузка прошла успешно.
   *  Нужно, чтобы при сбое не показывать пустой гардероб как «всё пропало». */
  loadError: string | null

  // ── Мульти-гардеробы ───────────────────────────────────────────────────
  /** Все доступные текущему пользователю гардеробы-пространства. */
  wardrobes: WardrobeMeta[]
  /** Активный гардероб (его данные сейчас в сторе). null до выбора. */
  activeWardrobeId: string | null
  /** Идёт загрузка СПИСКА гардеробов (отдельно от загрузки данных). */
  wardrobesLoading: boolean
  /** Участники активного гардероба (для экрана управления доступом). */
  members: WardrobeMember[]
  membersLoading: boolean
  /** Имя гардероба, доступ к которому только что отозвали (для тоста). */
  accessRevokedNotice: string | null
  /** Монотонная эпоха загрузки — защита от гонок при переключении гардеробов. */
  _loadEpoch: number

  subscribe: (uid: string) => Promise<void>
  unsubscribe: () => void
  /** Повторить загрузку после ошибки (кнопка «Повторить»). */
  retryLoad: () => void

  switchWardrobe: (id: string) => Promise<void>
  createWardrobe: (name: string) => Promise<WardrobeMeta>
  renameWardrobe: (id: string, name: string) => Promise<void>
  deleteWardrobe: (id: string) => Promise<void>
  leaveWardrobe: (id: string) => Promise<void>
  refreshWardrobes: () => Promise<void>
  loadMembers: (wardrobeId?: string) => Promise<void>
  removeMember: (memberUid: string, wardrobeId?: string) => Promise<void>
  createInvite: (wardrobeId?: string, role?: WardrobeRole) => Promise<string>
  acceptInvite: (token: string) => Promise<{ wardrobeId: string; name: string }>
  clearAccessRevokedNotice: () => void

  addClothing: (item: Omit<ClothingItem, 'id'>) => Promise<void>
  /** targetWardrobeId фиксируется на старте импорта — чтобы вещи ушли в тот гардероб,
   *  где импорт начали, даже если пользователь успел переключиться. */
  addClothingBatch: (items: Omit<ClothingItem, 'id'>[], targetWardrobeId?: string) => Promise<void>
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

  addBoard: (board: Omit<Board, 'id'>) => Promise<Board>
  removeBoard: (id: string) => Promise<void>
  updateBoard: (id: string, patch: Partial<Board>) => Promise<void>

  updateProfile: (patch: Partial<Profile>) => Promise<void>
  addBodyFeature: (f: Omit<BodyFeature, 'id'>) => Promise<void>
  removeBodyFeature: (id: string) => Promise<void>

  addOutfitCategory: (name: string) => Promise<Category | undefined>
  renameOutfitCategory: (id: string, name: string) => Promise<void>
  removeOutfitCategory: (id: string) => Promise<void>
}

const defaultProfile: Profile = { features: [], preferredStyles: [] }

type AnyDoc = Record<string, any>
type SetFn = (partial: Partial<WardrobeState> | ((s: WardrobeState) => Partial<WardrobeState>)) => void
type GetFn = () => WardrobeState

/** Отзыв доступа к гардеробу: сервер вернул 404/no_access (а не сетевую ошибку). */
function isAccessRevoked(e: unknown): boolean {
  return (e as ApiError)?.code === 'no_access'
}

function uidOrEmpty(): string {
  return auth.currentUser?.uid ?? ''
}

/** Загрузка данных гардероба с защитой от гонок (эпоха). Поздний ответ устаревшего
 *  гардероба не затирает активный. */
async function loadData(set: SetFn, get: GetFn, wardrobeId: string) {
  const epoch = get()._loadEpoch + 1
  set({ _loadEpoch: epoch, loading: true, loadError: null })
  try {
    const data = await callDb('load', { wardrobeId })
    if (get()._loadEpoch !== epoch) return // переключились — ответ устарел
    set({
      wardrobe: (data.wardrobe ?? []).map(asClothing),
      shopping: (data.shopping ?? []).map(asShopping),
      outfits: (data.outfits ?? []).map(asOutfit),
      boards: (data.boards ?? []).map(asBoard),
      profile: {
        features: (data.features ?? []).map((f: AnyDoc) => ({ id: f.id, ...f } as BodyFeature)),
        preferredStyles: data.profile?.preferredStyles ?? [],
        height: data.profile?.height,
        weight: data.profile?.weight,
        bodyType: data.profile?.bodyType,
        outfitCategories: data.profile?.outfitCategories,
      },
      loading: false,
      loadError: null,
    })
    // Сверяем роль/владельца активного гардероба с сервером (авторитетно для прав).
    // Имя НЕ синкаем: оно редактируется оптимистично (renameWardrobe), и устаревший
    // ответ load откатил бы только что применённое переименование.
    if (data.workspace) {
      set((s) => ({
        wardrobes: s.wardrobes.map((w) =>
          w.id === wardrobeId
            ? { ...w, role: data.workspace.role ?? w.role, ownerUid: data.workspace.ownerUid ?? w.ownerUid }
            : w,
        ),
      }))
    }
  } catch (e) {
    if (get()._loadEpoch !== epoch) return
    if (isAccessRevoked(e)) {
      handleAccessRevoked(set, get, wardrobeId)
      return
    }
    // НЕ показываем пустой гардероб как «всё пропало»: данные в базе целы,
    // просто загрузка не удалась (сеть, токен, ошибка сервера). Показываем ошибку.
    set({ loading: false, loadError: e instanceof Error ? e.message : 'Не удалось загрузить данные' })
  }
}

/** Доступ к активному гардеробу отозвали — убираем из списка, переключаемся на личный,
 *  показываем тост. */
function handleAccessRevoked(set: SetFn, get: GetFn, lostId: string) {
  const uid = uidOrEmpty()
  // Личный гардероб недоступен — переключаться некуда, иначе зациклимся. Показываем ошибку.
  if (lostId === uid) {
    set({ loading: false, loadError: 'Нет доступа к гардеробу' })
    return
  }
  const lostName = get().wardrobes.find((w) => w.id === lostId)?.name ?? ''
  const next = nextActiveAfterRemoval(get().wardrobes, lostId, null, uid)
  set({
    wardrobes: get().wardrobes.filter((w) => w.id !== lostId),
    activeWardrobeId: next,
    accessRevokedNotice: lostName,
  })
  saveStoredWardrobeId(uid, next)
  void loadData(set, get, next)
}

/** Убрать гардероб из списка и переключиться на другой, если удалили активный. */
function removeFromList(set: SetFn, get: GetFn, id: string) {
  const uid = uidOrEmpty()
  const active = get().activeWardrobeId
  const next = nextActiveAfterRemoval(get().wardrobes, id, active, uid)
  set({ wardrobes: get().wardrobes.filter((w) => w.id !== id) })
  if (active === id) {
    set({ activeWardrobeId: next })
    saveStoredWardrobeId(uid, next)
    void loadData(set, get, next)
  }
}

/** Категории образов профиля с фолбэком на дефолтные — единый источник для UI и мутаций. */
const catsOf = (s: WardrobeState): Category[] => s.profile.outfitCategories ?? DEFAULT_OUTFIT_CATEGORIES

export const useStore = create<WardrobeState>()((set, get) => {
  // Обёртка для операций в контексте активного гардероба: подмешивает wardrobeId.
  // Явный wardrobeId в args перебивает дефолт.
  const scoped = (op: string, args: Record<string, unknown> = {}) =>
    callDb(op, { wardrobeId: get().activeWardrobeId ?? uidOrEmpty(), ...args })

  // Счётчик запросов участников: устаревший ответ listMembers не должен перетереть
  // актуальный список (быстрое переключение между гардеробами в /wardrobes).
  let membersReqSeq = 0

  return {
    wardrobe: [],
    shopping: [],
    outfits: [],
    boards: [],
    profile: defaultProfile,
    loading: true,
    loadError: null,

    wardrobes: [],
    activeWardrobeId: null,
    wardrobesLoading: false,
    members: [],
    membersLoading: false,
    accessRevokedNotice: null,
    _loadEpoch: 0,

    subscribe: async (uid) => {
      if (get().wardrobesLoading) return // guard от двойного вызова (StrictMode)
      set({ loading: true, loadError: null, wardrobesLoading: true, accessRevokedNotice: null })
      try {
        const { wardrobes: raw } = await callDb('listWardrobes', {})
        const wardrobes = normalizeWardrobes(raw ?? [], uid)
        const active = pickActiveWardrobe(wardrobes, getStoredWardrobeId(uid), uid)
        set({ wardrobes, activeWardrobeId: active, wardrobesLoading: false })
        saveStoredWardrobeId(uid, active)
        await loadData(set, get, active)
      } catch (e) {
        set({ wardrobesLoading: false, loading: false, loadError: e instanceof Error ? e.message : 'Не удалось загрузить гардеробы' })
      }
    },

    unsubscribe: () => {
      // Сбрасываем флаги загрузки и бампаем эпоху — иначе при выходе во время
      // начальной загрузки следующий subscribe залипнет на guard, а ответ прошлого
      // пользователя мог бы прилететь в стор уже нового (утечка чужих данных).
      set((s) => ({
        wardrobe: [], shopping: [], outfits: [], boards: [], profile: defaultProfile,
        loading: false, loadError: null,
        wardrobes: [], activeWardrobeId: null, wardrobesLoading: false,
        members: [], membersLoading: false, accessRevokedNotice: null,
        _loadEpoch: s._loadEpoch + 1,
      }))
    },

    // Повтор после ошибки: перезапускаем subscribe целиком — сбой мог быть на этапе
    // загрузки списка гардеробов, тогда одной перезагрузки данных мало.
    retryLoad: () => {
      void get().subscribe(uidOrEmpty())
    },

    switchWardrobe: async (id) => {
      if (id === get().activeWardrobeId) return
      if (!get().wardrobes.some((w) => w.id === id)) return
      const uid = uidOrEmpty()
      // Синхронно чистим данные, чтобы между set и loadData не показать чужие вещи.
      set({ activeWardrobeId: id, wardrobe: [], shopping: [], outfits: [], boards: [], profile: defaultProfile, members: [] })
      saveStoredWardrobeId(uid, id)
      await loadData(set, get, id)
    },

    createWardrobe: async (name) => {
      const trimmed = name.trim() || 'Новый гардероб'
      const { id } = await callDb('createWardrobe', { name: trimmed })
      const uid = uidOrEmpty()
      const meta: WardrobeMeta = { id, name: trimmed, ownerUid: uid, role: 'owner', isPersonal: false }
      set((s) => ({ wardrobes: [...s.wardrobes, meta] }))
      await get().switchWardrobe(id)
      return meta
    },

    renameWardrobe: async (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const prev = get().wardrobes
      set((s) => ({ wardrobes: s.wardrobes.map((w) => (w.id === id ? { ...w, name: trimmed } : w)) }))
      try {
        await callDb('renameWardrobe', { wardrobeId: id, name: trimmed })
      } catch (e) {
        set({ wardrobes: prev })
        throw e
      }
    },

    deleteWardrobe: async (id) => {
      const meta = get().wardrobes.find((w) => w.id === id)
      if (!meta || meta.isPersonal) throw new Error('Нельзя удалить личный гардероб')
      await callDb('deleteWardrobe', { wardrobeId: id })
      removeFromList(set, get, id)
    },

    leaveWardrobe: async (id) => {
      const meta = get().wardrobes.find((w) => w.id === id)
      if (!meta || meta.isPersonal) throw new Error('Нельзя покинуть личный гардероб')
      await callDb('leaveWardrobe', { wardrobeId: id })
      removeFromList(set, get, id)
    },

    refreshWardrobes: async () => {
      const uid = uidOrEmpty()
      const { wardrobes: raw } = await callDb('listWardrobes', {})
      set({ wardrobes: normalizeWardrobes(raw ?? [], uid) })
    },

    loadMembers: async (wardrobeId) => {
      const id = wardrobeId ?? get().activeWardrobeId ?? uidOrEmpty()
      const seq = ++membersReqSeq
      // Чистим прошлый список — иначе первый кадр покажет участников другого гардероба.
      set({ members: [], membersLoading: true })
      try {
        const { members } = await callDb('listMembers', { wardrobeId: id })
        if (seq !== membersReqSeq) return // устаревший ответ — не перетираем актуальный список
        set({ members: members ?? [], membersLoading: false })
      } catch {
        if (seq !== membersReqSeq) return
        set({ membersLoading: false })
      }
    },

    removeMember: async (memberUid, wardrobeId) => {
      const id = wardrobeId ?? get().activeWardrobeId ?? uidOrEmpty()
      const prev = get().members
      set((s) => ({ members: s.members.filter((m) => m.uid !== memberUid) }))
      try {
        await callDb('removeMember', { wardrobeId: id, memberUid })
      } catch (e) {
        set({ members: prev })
        throw e
      }
    },

    createInvite: async (wardrobeId, role = 'member') => {
      const id = wardrobeId ?? get().activeWardrobeId ?? uidOrEmpty()
      const { token } = await callDb('createInvite', { wardrobeId: id, role })
      return `${location.origin}/invite/${token}`
    },

    acceptInvite: async (token) => {
      const { wardrobeId, name } = await callDb('acceptInvite', { token })
      await get().refreshWardrobes()
      await get().switchWardrobe(wardrobeId)
      return { wardrobeId, name }
    },

    clearAccessRevokedNotice: () => set({ accessRevokedNotice: null }),

    addClothing: async (item) => {
      const { id } = await scoped('add', { col: 'wardrobe', data: item })
      set((s) => ({ wardrobe: [...s.wardrobe, { ...item, id } as ClothingItem] }))
    },

    addClothingBatch: async (items, targetWardrobeId) => {
      // Пишем почанково и фиксируем каждый успешный чанк в стор сразу. Если сеть
      // оборвётся между чанками, уже записанные вещи остаются и в Firestore, и в сторе,
      // а вызывающему прокидываем `savedCount` — сколько реально записалось, чтобы он
      // не отправил их повторно (иначе при ретрае получим дубли).
      const target = targetWardrobeId ?? get().activeWardrobeId ?? uidOrEmpty()
      let saved = 0
      try {
        for (let i = 0; i < items.length; i += 25) {
          const chunk = items.slice(i, i + 25)
          const { ids } = await callDb('batchAdd', { wardrobeId: target, col: 'wardrobe', items: chunk })
          const added = chunk.map((it, j) => ({ ...it, id: ids[j] } as ClothingItem))
          // Оптимистично обновляем стор только если импорт шёл в текущий активный гардероб.
          if (get().activeWardrobeId === target || (!get().activeWardrobeId && target === uidOrEmpty())) {
            set((s) => ({ wardrobe: [...s.wardrobe, ...added] }))
          }
          saved += chunk.length
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Не удалось сохранить')
        ;(err as Error & { savedCount?: number }).savedCount = saved
        throw err
      }
    },

    clearWardrobe: async () => {
      await scoped('clear', { col: 'wardrobe' })
      set({ wardrobe: [] })
    },

    removeClothing: async (id) => {
      await scoped('delete', { col: 'wardrobe', id })
      set((s) => ({ wardrobe: s.wardrobe.filter((i) => i.id !== id) }))
    },

    updateClothing: async (id, patch) => {
      await scoped('update', { col: 'wardrobe', id, patch })
      set((s) => ({ wardrobe: s.wardrobe.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
    },

    addShoppingItem: async (item) => {
      const { id } = await scoped('add', { col: 'shopping', data: item })
      set((s) => ({ shopping: [...s.shopping, { ...item, id } as ShoppingItem] }))
    },

    removeShoppingItem: async (id) => {
      await scoped('delete', { col: 'shopping', id })
      set((s) => ({ shopping: s.shopping.filter((i) => i.id !== id) }))
    },

    confirmShoppingItem: async (id) => {
      await scoped('update', { col: 'shopping', id, patch: { isConfirmed: true } })
      set((s) => ({ shopping: s.shopping.map((i) => (i.id === id ? { ...i, isConfirmed: true } : i)) }))
    },

    updateShoppingItem: async (id, patch) => {
      await scoped('update', { col: 'shopping', id, patch })
      set((s) => ({ shopping: s.shopping.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
    },

    moveToWardrobe: async (id) => {
      const item = get().shopping.find((i) => i.id === id)
      if (!item) return
      // Закрепляем целевой гардероб на старте: между add и delete пользователь мог
      // переключиться, и delete/оптимистичный set ушли бы не в тот гардероб.
      const target = get().activeWardrobeId ?? uidOrEmpty()
      const { name, category, color, seasons, imageUrl, shopUrl } = item
      const clothing: Omit<ClothingItem, 'id'> = { name, category, color, seasons }
      if (imageUrl) clothing.imageUrl = imageUrl
      if (shopUrl) clothing.shopUrl = shopUrl
      const { id: newId } = await callDb('add', { wardrobeId: target, col: 'wardrobe', data: clothing })
      await callDb('delete', { wardrobeId: target, col: 'shopping', id })
      if (get().activeWardrobeId === target || (!get().activeWardrobeId && target === uidOrEmpty())) {
        set((s) => ({
          wardrobe: [...s.wardrobe, { ...clothing, id: newId } as ClothingItem],
          shopping: s.shopping.filter((i) => i.id !== id),
        }))
      }
    },

    addAiSuggestions: async (items) => {
      const { ids } = await scoped('batchAdd', { col: 'shopping', items })
      set((s) => ({ shopping: [...s.shopping, ...items.map((it, j) => ({ ...it, id: ids[j] } as ShoppingItem))] }))
    },

    addOutfit: async (outfit) => {
      const { id } = await scoped('add', { col: 'outfits', data: outfit })
      set((s) => ({ outfits: [...s.outfits, { ...outfit, id } as Outfit] }))
    },

    removeOutfit: async (id) => {
      await scoped('delete', { col: 'outfits', id })
      // Каскад: убираем ссылку на удалённый образ из всех досок (иначе висячие id и кривой счётчик).
      const affected = get().boards.filter((b) => b.outfitIds.includes(id))
      for (const b of affected) {
        await scoped('update', { col: 'boards', id: b.id, patch: { outfitIds: b.outfitIds.filter((x) => x !== id) } })
      }
      set((s) => ({
        outfits: s.outfits.filter((o) => o.id !== id),
        boards: s.boards.map((b) =>
          b.outfitIds.includes(id) ? { ...b, outfitIds: b.outfitIds.filter((x) => x !== id) } : b,
        ),
      }))
    },

    updateOutfit: async (id, patch) => {
      await scoped('update', { col: 'outfits', id, patch })
      set((s) => ({ outfits: s.outfits.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))
    },

    setOutfits: async (outfits) => {
      const { ids } = await scoped('replace', { col: 'outfits', items: outfits })
      set({ outfits: outfits.map((o, j) => ({ ...o, id: ids[j] } as Outfit)) })
    },

    addBoard: async (board) => {
      const { id } = await scoped('add', { col: 'boards', data: board })
      const created = { ...board, id } as Board
      set((s) => ({ boards: [...s.boards, created] }))
      return created
    },

    removeBoard: async (id) => {
      await scoped('delete', { col: 'boards', id })
      set((s) => ({ boards: s.boards.filter((b) => b.id !== id) }))
    },

    updateBoard: async (id, patch) => {
      await scoped('update', { col: 'boards', id, patch })
      set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
    },

    updateProfile: async (patch) => {
      await scoped('setProfile', { patch })
      set((s) => ({ profile: { ...s.profile, ...patch } }))
    },

    addBodyFeature: async (f) => {
      const { id } = await scoped('add', { col: 'features', data: f })
      set((s) => ({ profile: { ...s.profile, features: [...s.profile.features, { ...f, id } as BodyFeature] } }))
    },

    removeBodyFeature: async (id) => {
      await scoped('delete', { col: 'features', id })
      set((s) => ({ profile: { ...s.profile, features: s.profile.features.filter((f) => f.id !== id) } }))
    },

    addOutfitCategory: async (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const current = catsOf(get())
      const category: Category = { id: crypto.randomUUID(), name: trimmed }
      const next = [...current, category]
      await scoped('setProfile', { patch: { outfitCategories: next } })
      set((s) => ({ profile: { ...s.profile, outfitCategories: next } }))
      return category
    },

    renameOutfitCategory: async (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const current = catsOf(get())
      const next = current.map((c) => (c.id === id ? { ...c, name: trimmed } : c))
      await scoped('setProfile', { patch: { outfitCategories: next } })
      set((s) => ({ profile: { ...s.profile, outfitCategories: next } }))
    },

    removeOutfitCategory: async (id) => {
      const current = catsOf(get())
      const next = current.filter((c) => c.id !== id)
      await scoped('setProfile', { patch: { outfitCategories: next } })

      // Зачистка ссылок на удалённую категорию у образов.
      const affected = get().outfits.filter((o) => (o.categories ?? []).includes(id))
      for (const o of affected) {
        await scoped('update', {
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
  }
})

/** Категории образов текущего профиля (или дефолтные). Единый селектор для всех компонентов. */
export const useOutfitCategories = () => useStore(catsOf)

/** Активный гардероб (мета). */
export const useActiveWardrobe = (): WardrobeMeta | undefined =>
  useStore((s) => s.wardrobes.find((w) => w.id === s.activeWardrobeId))
