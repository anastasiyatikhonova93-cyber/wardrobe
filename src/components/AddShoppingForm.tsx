import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ShoppingItem, ClothingCategory, Season } from '../types'
import { SeasonPicker } from './SeasonPicker'
import { CategorySelect } from './CategorySelect'
import { PhotoPicker } from './PhotoPicker'
import { inferItemDetails } from '../ai'

interface Props {
  onAdd: (item: Omit<ShoppingItem, 'id'>) => void
  onClose: () => void
}

export function AddShoppingForm({ onAdd, onClose }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ClothingCategory>('tops')
  const [color, setColor] = useState('')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [inferring, setInferring] = useState(false)
  const [inferred, setInferred] = useState(false)

  const canSubmit = name.trim().length > 0

  async function handleNameBlur() {
    if (!name.trim() || inferred) return
    setInferring(true)
    try {
      const result = await inferItemDetails(name.trim())
      setCategory(result.category as ClothingCategory)
      setSeasons(result.seasons as Season[])
      setInferred(true)
    } catch { /* игнорируем */ }
    setInferring(false)
  }

  function handleNameChange(v: string) {
    setName(v)
    if (inferred) setInferred(false)
  }

  async function handleSubmit() {
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      const needColorAdvice = !color.trim()
      const data: Omit<ShoppingItem, 'id'> = {
        name: name.trim(),
        category,
        color: color.trim() || 'подобрать',
        seasons,
        isAiSuggested: false,
        isConfirmed: true,
        needColorAdvice,
      }
      if (imageUrl.trim()) data.imageUrl = imageUrl.trim()
      if (price) data.price = Number(price)
      await onAdd(data)
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PhotoPicker value={imageUrl} onChange={setImageUrl} />
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Название *</label>
        <div className="relative">
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Кожаные ботинки"
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
          />
          {inferring && (
            <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-zinc-300" />
          )}
        </div>
      </div>
      <CategorySelect value={category} onChange={setCategory} />
      <Input label="Цвет" value={color} onChange={setColor} placeholder="не обязательно — AI подберёт" />
      <SeasonPicker selected={seasons} onChange={setSeasons} />
      <Input label="Цена (€)" value={price} onChange={setPrice} placeholder="12 000" />
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || saving}
        className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
      >
        {saving ? 'Сохраняю...' : 'Добавить'}
      </button>
    </div>
  )
}

function Input({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
      />
    </div>
  )
}
