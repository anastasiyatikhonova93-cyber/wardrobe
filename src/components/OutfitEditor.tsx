import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, Check, ArrowLeft, Loader2, Maximize2 } from 'lucide-react'
import { useStore, useOutfitCategories } from '../store'
import type { Outfit, OutfitItemPosition, Season, ClothingItem, ClothingCategory } from '../types'
import { SEASON_LABELS, CATEGORY_LABELS } from '../types'
import { TransparentImg } from './TransparentImg'
import { itemBoxFrac, buildItemLookup } from '../lib/outfit-layout'
import { useAspectRatios } from '../lib/use-image-aspect'
import { generateOutfitName } from '../ai'

const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[]

interface Props {
  outfit: Outfit | null
  onClose: () => void
}

/** Границы ручного множителя размера вещи на холсте. */
const MIN_USER_SCALE = 0.4
const MAX_USER_SCALE = 2.5
const clampScale = (s: number) => Math.max(MIN_USER_SCALE, Math.min(MAX_USER_SCALE, s))

function autoLayout(itemIds: string[]): OutfitItemPosition[] {
  const cols = 2
  const itemW = 25
  const gapX = (100 - cols * itemW) / (cols + 1)
  const gapY = 8
  return itemIds.map((id, i) => ({
    itemId: id,
    x: gapX + (i % cols) * (itemW + gapX),
    y: 10 + Math.floor(i / cols) * (itemW * 1.33 + gapY),
    userScale: 1,
  }))
}

export function OutfitEditor({ outfit, onClose }: Props) {
  const { wardrobe, addOutfit, updateOutfit, removeOutfit, addOutfitCategory } = useStore()
  const allCategories = useOutfitCategories()

  const [name, setName] = useState(outfit?.name ?? '')
  const [season, setSeason] = useState<Season>(outfit?.season ?? 'spring')
  const [categories, setCategories] = useState<string[]>(outfit?.categories ?? [])
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const savingCategory = useRef(false)

  async function commitNewCategory() {
    if (savingCategory.current) return // защита от двойного сабмита (быстрый Enter/клик)
    const name = newCategory.trim()
    if (!name) return
    savingCategory.current = true
    try {
      const created = await addOutfitCategory(name)
      if (created) setCategories((cur) => [...cur, created.id]) // сразу отмечаем у образа
    } finally {
      savingCategory.current = false
      setNewCategory('')
      setAddingCategory(false)
    }
  }
  const [itemIds, setItemIds] = useState<string[]>(outfit?.wardrobeItemIds ?? [])
  const [positions, setPositions] = useState<OutfitItemPosition[]>(() => {
    if (outfit?.itemPositions?.length) {
      // Старое поле `scale` (ширина-масштаб по категории) игнорируем — размер теперь
      // задаётся высотой по категории; читаем только ручной множитель userScale.
      return outfit.itemPositions.map((p) => ({
        itemId: p.itemId,
        x: p.x,
        y: p.y,
        userScale: p.userScale ?? 1,
      }))
    }
    if (outfit?.wardrobeItemIds?.length) return autoLayout(outfit.wardrobeItemIds)
    return []
  })
  const [showPicker, setShowPicker] = useState(false)
  const [pickerFilter, setPickerFilter] = useState<ClothingCategory | 'all'>('all')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const byId = useMemo(() => buildItemLookup(wardrobe), [wardrobe])
  const aspectBySrc = useAspectRatios(positions.map((p) => byId.get(p.itemId)?.imageUrl))

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    offsetX: number
    offsetY: number
    /** размеры бокса вещи в % холста — для клампа, чтобы вещь не уехала целиком за край */
    wPct: number
    hPct: number
  } | null>(null)
  const resizeRef = useRef<{
    id: string
    anchorX: number
    anchorY: number
    startUserScale: number
    startDiag: number
  } | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const getCanvasRect = useCallback(() => {
    return canvasRef.current?.getBoundingClientRect() ?? null
  }, [])

  function boxPct(pos: OutfitItemPosition) {
    const item = byId.get(pos.itemId)
    const { hFrac, wFrac } = itemBoxFrac(item, pos.userScale, aspectBySrc(item?.imageUrl))
    return { wPct: wFrac * 100, hPct: hFrac * 100 }
  }

  function handlePointerDown(e: React.PointerEvent, itemId: string) {
    const rect = getCanvasRect()
    if (!rect) return
    const pos = positions.find((p) => p.itemId === itemId)
    if (!pos) return

    const itemX = (pos.x / 100) * rect.width
    const itemY = (pos.y / 100) * rect.height
    const { wPct, hPct } = boxPct(pos)

    dragRef.current = {
      id: itemId,
      offsetX: e.clientX - rect.left - itemX,
      offsetY: e.clientY - rect.top - itemY,
      wPct,
      hPct,
    }

    setPositions((prev) => {
      const idx = prev.findIndex((p) => p.itemId === itemId)
      if (idx === -1 || idx === prev.length - 1) return prev
      return [...prev.filter((p) => p.itemId !== itemId), prev[idx]]
    })
    setItemIds((prev) => {
      const idx = prev.indexOf(itemId)
      if (idx === -1 || idx === prev.length - 1) return prev
      return [...prev.filter((id) => id !== itemId), itemId]
    })

    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleResizeDown(e: React.PointerEvent, itemId: string) {
    e.stopPropagation()
    const rect = getCanvasRect()
    if (!rect) return
    const pos = positions.find((p) => p.itemId === itemId)
    if (!pos) return

    const anchorX = rect.left + (pos.x / 100) * rect.width
    const anchorY = rect.top + (pos.y / 100) * rect.height
    const startDiag = Math.hypot(e.clientX - anchorX, e.clientY - anchorY) || 1
    resizeRef.current = { id: itemId, anchorX, anchorY, startUserScale: pos.userScale ?? 1, startDiag }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const rz = resizeRef.current
    if (rz) {
      const diag = Math.hypot(e.clientX - rz.anchorX, e.clientY - rz.anchorY)
      const userScale = clampScale(rz.startUserScale * (diag / rz.startDiag))
      setPositions((prev) => prev.map((p) => (p.itemId === rz.id ? { ...p, userScale } : p)))
      return
    }

    if (!dragRef.current) return
    const rect = getCanvasRect()
    if (!rect) return

    const rawX = e.clientX - rect.left - dragRef.current.offsetX
    const rawY = e.clientY - rect.top - dragRef.current.offsetY
    // Держим на холсте хотя бы видимую часть бокса = min(размер, 30%): для маленького
    // бокса это вся вещь (не уезжает вовсе), для большого после ресайза — 30% (и без
    // инверсии границ, когда бокс шире/выше холста).
    const visX = Math.min(dragRef.current.wPct, 30)
    const visY = Math.min(dragRef.current.hPct, 30)
    const x = Math.max(visX - dragRef.current.wPct, Math.min(100 - visX, (rawX / rect.width) * 100))
    const y = Math.max(visY - dragRef.current.hPct, Math.min(100 - visY, (rawY / rect.height) * 100))

    setPositions((prev) =>
      prev.map((p) => (p.itemId === dragRef.current!.id ? { ...p, x, y } : p)),
    )
  }

  function handlePointerUp() {
    dragRef.current = null
    resizeRef.current = null
  }

  function addItem(item: ClothingItem) {
    if (itemIds.includes(item.id)) return
    setItemIds((prev) => [...prev, item.id])
    const centerX = 35 + Math.random() * 10
    const centerY = 20 + Math.random() * 10
    setPositions((prev) => [
      ...prev,
      { itemId: item.id, x: centerX, y: centerY, userScale: 1 },
    ])
  }

  function removeItem(itemId: string) {
    setItemIds((prev) => prev.filter((id) => id !== itemId))
    setPositions((prev) => prev.filter((p) => p.itemId !== itemId))
  }

  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      let outfitName = name
      if (!outfitName) {
        const items = itemIds.map((id) => wardrobe.find((w) => w.id === id)).filter(Boolean) as ClothingItem[]
        outfitName = await generateOutfitName(items, season)
      }
      const data: Record<string, unknown> = {
        name: outfitName,
        wardrobeItemIds: itemIds,
        shoppingItemIds: [] as string[],
        season,
        categories,
        itemPositions: positions,
      }
      if (outfit) {
        await updateOutfit(outfit.id, data as Partial<Outfit>)
      } else {
        await addOutfit(data as Omit<Outfit, 'id'>)
      }
      onClose()
    } catch (e) {
      console.error('Failed to save outfit:', e)
      alert('Не удалось сохранить образ. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!outfit) return
    await removeOutfit(outfit.id)
    onClose()
  }

  const availableItems = wardrobe.filter((i) => !itemIds.includes(i.id))
  const filteredPickerItems = pickerFilter === 'all'
    ? availableItems
    : availableItems.filter((i) => i.category === pickerFilter)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="max-w-lg mx-auto w-full flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-medium">
            {outfit ? 'Редактировать образ' : 'Новый образ'}
          </h2>
          <button
            onClick={handleSave}
            disabled={itemIds.length === 0 || saving}
            className="bg-black text-white rounded-full p-2 transition-transform active:scale-95 disabled:opacity-30"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Name input */}
          <div className="mt-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название образа"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Season selector */}
          <div className="mt-3">
            <div className="flex gap-2">
              {ALL_SEASONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeason(s)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                    season === s ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {SEASON_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Categories selector */}
          <div className="mt-3">
            <p className="text-xs text-zinc-400 mb-1.5">Категории</p>
            <div className="flex flex-wrap gap-2">
              {allCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategories((cur) => (cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]))}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                    categories.includes(c.id) ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {c.name}
                </button>
              ))}
              {!addingCategory && (
                <button
                  type="button"
                  onClick={() => setAddingCategory(true)}
                  className="px-3 py-1.5 rounded-full text-xs bg-zinc-100 text-zinc-500 flex items-center gap-1 transition-colors hover:bg-zinc-200"
                  title="Добавить категорию"
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
            {addingCategory && (
              <div className="flex gap-2 mt-2">
                <input
                  autoFocus
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitNewCategory() }
                    if (e.key === 'Escape') { setNewCategory(''); setAddingCategory(false) }
                  }}
                  placeholder="Новая категория"
                  className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={commitNewCategory}
                  disabled={!newCategory.trim()}
                  className="bg-black text-white rounded-full p-2 transition-transform active:scale-95 disabled:opacity-30"
                >
                  <Check size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative mt-4 w-full aspect-[3/4] bg-zinc-50 rounded-2xl overflow-hidden"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {itemIds.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-zinc-300">Добавьте вещи из гардероба</p>
              </div>
            )}
            {positions.map((pos) => {
              const item = byId.get(pos.itemId)
              if (!item) return null
              const { hFrac, wFrac } = itemBoxFrac(item, pos.userScale, aspectBySrc(item.imageUrl))
              return (
                <div
                  key={pos.itemId}
                  className="absolute cursor-grab active:cursor-grabbing"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${wFrac * 100}%`,
                    height: `${hFrac * 100}%`,
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => handlePointerDown(e, pos.itemId)}
                >
                  <div className="relative w-full h-full">
                    {item.imageUrl ? (
                      <TransparentImg
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-contain pointer-events-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-200 rounded-xl flex items-center justify-center text-zinc-400 text-lg font-light">
                        {(item.name ?? '?')[0]}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeItem(pos.itemId)
                      }}
                      className="absolute top-1 right-1 bg-white shadow-md rounded-full p-1 z-10"
                    >
                      <X size={12} />
                    </button>
                    {/* Маркер ресайза — тянуть за угол, чтобы менять размер вещи */}
                    <div
                      onPointerDown={(e) => handleResizeDown(e, pos.itemId)}
                      className="absolute bottom-1 right-1 bg-white shadow-md rounded-full p-1 z-10 cursor-nwse-resize touch-none"
                    >
                      <Maximize2 size={12} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add items button */}
          <button
            onClick={() => { setPickerFilter('all'); setShowPicker(true) }}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 hover:border-zinc-400 transition-colors"
          >
            <Plus size={16} />
            Добавить вещь
          </button>

          {/* Delete button */}
          {outfit && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={16} />
              Удалить образ
            </button>
          )}
        </div>
      </div>

      {/* Item picker overlay */}
      {showPicker && (
        <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm flex items-end justify-center" onClick={() => setShowPicker(false)}>
          <div
            className="bg-white rounded-t-2xl w-full max-w-lg max-h-[70vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <h3 className="text-base font-medium">Выберите вещь</h3>
              <button onClick={() => setShowPicker(false)} className="p-1.5 rounded-full hover:bg-zinc-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pt-3 pb-1">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                <button
                  onClick={() => setPickerFilter('all')}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors ${
                    pickerFilter === 'all' ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  Все
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPickerFilter(c)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors ${
                      pickerFilter === c ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-110px)] p-4 pt-2">
              {availableItems.length === 0 ? (
                <p className="text-sm text-zinc-300 text-center py-8">Все вещи уже добавлены</p>
              ) : filteredPickerItems.length === 0 ? (
                <p className="text-sm text-zinc-300 text-center py-8">Нет вещей в этой категории</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filteredPickerItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        addItem(item)
                        setShowPicker(false)
                      }}
                      className="rounded-xl overflow-hidden bg-zinc-50 text-left active:scale-95 transition-transform"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full aspect-[3/4] object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] flex items-center justify-center text-zinc-300 text-2xl font-light">
                          {(item.name ?? '?')[0]}
                        </div>
                      )}
                      <p className="text-[11px] px-2 py-1.5 truncate text-zinc-600">{item.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl mx-4 p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-2">Удалить образ?</h3>
            <p className="text-sm text-zinc-500 mb-4">Это действие нельзя отменить</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-100 text-sm font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
