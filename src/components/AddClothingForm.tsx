import { useState } from 'react'
import type { ClothingItem, ClothingCategory, Season } from '../types'
import { SeasonPicker } from './SeasonPicker'
import { CategorySelect } from './CategorySelect'
import { PhotoPicker } from './PhotoPicker'

interface Props {
  onAdd: (item: Omit<ClothingItem, 'id'>) => void
  onClose: () => void
}

export function AddClothingForm({ onAdd, onClose }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ClothingCategory>('tops')
  const [color, setColor] = useState('')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [shopUrl, setShopUrl] = useState('')

  const [saving, setSaving] = useState(false)
  const canSubmit = name.trim() && color.trim() && seasons.length > 0

  async function handleSubmit() {
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      await onAdd({
        name: name.trim(),
        category,
        color: color.trim(),
        seasons,
        imageUrl: imageUrl.trim() || undefined,
        shopUrl: shopUrl.trim() || undefined,
      })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PhotoPicker value={imageUrl} onChange={setImageUrl} />
      <Input label="Название" value={name} onChange={setName} placeholder="Белая рубашка оверсайз" />
      <CategorySelect value={category} onChange={setCategory} />
      <Input label="Цвет" value={color} onChange={setColor} placeholder="белый" />
      <SeasonPicker selected={seasons} onChange={setSeasons} />
      <Input label="Ссылка на магазин" value={shopUrl} onChange={setShopUrl} placeholder="https://..." />
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || saving}
        className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
      >
        Добавить
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
