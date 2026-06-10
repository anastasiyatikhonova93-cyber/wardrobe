import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2, Trash2 } from 'lucide-react'
import { useStore, useOutfitCategories } from '../store'
import type { Board, Category, ClothingItem } from '../types'
import { OutfitPreview } from './OutfitCard'
import { OutfitFilterBar } from './OutfitFilterBar'
import { matchesOutfitFilter } from '../lib/outfit-layout'

interface Props {
  board: Board | null // null = новая доска
  onClose: () => void
}

/** Авто-название доски из выбранного фильтра. */
function autoName(category: string | 'all', itemId: string | null, categories: Category[], wardrobe: ClothingItem[]): string {
  const parts: string[] = []
  if (category !== 'all') {
    const cat = categories.find((c) => c.id === category)
    if (cat) parts.push(cat.name)
  }
  if (itemId) {
    const item = wardrobe.find((i) => i.id === itemId)
    if (item) parts.push(item.name)
  }
  return parts.length ? `Образы · ${parts.join(' · ')}` : 'Образы'
}

export function BoardEditor({ board, onClose }: Props) {
  const { wardrobe, shopping, outfits, addBoard, updateBoard, removeBoard } = useStore()
  const categories = useOutfitCategories()
  const isNew = !board

  const initialCategory = board?.filterCategory ?? 'all'
  const initialItem = board?.filterItemId ?? null

  const [category, setCategory] = useState<string | 'all'>(initialCategory)
  const [itemFilter, setItemFilter] = useState<string | null>(initialItem)
  const [name, setName] = useState(board?.name ?? autoName(initialCategory, initialItem, categories, wardrobe))
  // Источник правды — отмеченные образы. У новой доски стартуем со всех под фильтром.
  const [selected, setSelected] = useState<Set<string>>(() =>
    board
      ? new Set(board.outfitIds)
      : new Set(outfits.filter((o) => matchesOutfitFilter(o, initialCategory, initialItem)).map((o) => o.id)),
  )
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Пользователь правил имя вручную — больше не перезаписываем авто-именем.
  const nameEdited = useRef(!!board)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Образы под текущим фильтром.
  const candidates = useMemo(
    () => outfits.filter((o) => matchesOutfitFilter(o, category, itemFilter)),
    [outfits, category, itemFilter],
  )

  function applyFilter(nextCat: string | 'all', nextItem: string | null) {
    setCategory(nextCat)
    setItemFilter(nextItem)
    if (!nameEdited.current) setName(autoName(nextCat, nextItem, categories, wardrobe))
    // У новой доски смена фильтра пере-отмечает всех кандидатов (фильтр собирает доску).
    // У существующей — фильтр лишь меняет видимый список, ручной отбор сохраняется.
    if (isNew) {
      setSelected(new Set(outfits.filter((o) => matchesOutfitFilter(o, nextCat, nextItem)).map((o) => o.id)))
    }
  }

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (saving || selected.size === 0) return
    // Сохраняем ВЕСЬ выбор (а не пересечение с текущим фильтром), в порядке образов.
    const outfitIds = outfits.filter((o) => selected.has(o.id)).map((o) => o.id)
    setSaving(true)
    try {
      const payload: Omit<Board, 'id'> = {
        name: name.trim() || 'Образы',
        outfitIds,
        // null, а не undefined: иначе merge-обновление не очистит старый фильтр.
        filterCategory: category === 'all' ? null : category,
        filterItemId: itemFilter ?? null,
      }
      if (board) await updateBoard(board.id, payload)
      else await addBoard(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!board) return
    await removeBoard(board.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Верхняя панель */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-medium">{isNew ? 'Новая доска' : 'Доска'}</h2>
        <button
          onClick={handleSave}
          disabled={saving || selected.size === 0}
          className="bg-black text-white rounded-full p-2 transition-transform active:scale-95 disabled:opacity-30"
          title={selected.size === 0 ? 'Выберите хотя бы один образ' : 'Сохранить доску'}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Название */}
        <input
          value={name}
          onChange={(e) => { nameEdited.current = true; setName(e.target.value) }}
          placeholder="Название доски"
          className="w-full text-lg font-medium border-b border-zinc-200 pb-2 focus:outline-none focus:border-black"
        />

        {/* Фильтр по поводу и вещи */}
        <OutfitFilterBar
          categories={categories}
          selected={category}
          onSelect={(c) => applyFilter(c, itemFilter)}
          itemFilter={itemFilter}
          onItem={(i) => applyFilter(category, i)}
          wardrobe={wardrobe}
        />

        {/* Образы-кандидаты с отметками */}
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Выбрано образов: {selected.size}</p>
          {candidates.length === 0 ? (
            <p className="text-center text-sm text-zinc-300 mt-10">Нет образов под этот фильтр</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {candidates.map((o) => {
                const on = selected.has(o.id)
                return (
                  <button
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className={`relative rounded-xl overflow-hidden bg-zinc-50 border-2 transition-colors ${
                      on ? 'border-black' : 'border-transparent opacity-50'
                    }`}
                  >
                    <OutfitPreview outfit={o} wardrobeItems={wardrobe} shoppingItems={shopping} />
                    <span
                      className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
                        on ? 'bg-black text-white' : 'bg-white/80 text-transparent'
                      }`}
                    >
                      <Check size={12} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Удаление существующей доски */}
        {board && (
          showDeleteConfirm ? (
            <div className="flex items-center gap-2 justify-center pt-2">
              <span className="text-sm text-zinc-500">Удалить доску?</span>
              <button onClick={handleDelete} className="text-sm text-red-500 font-medium">Удалить</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="text-sm text-zinc-400">Отмена</button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-sm text-zinc-400 mx-auto pt-2"
            >
              <Trash2 size={14} /> Удалить доску
            </button>
          )
        )}
      </div>
    </div>
  )
}
