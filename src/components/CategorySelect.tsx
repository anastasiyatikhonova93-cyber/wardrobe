import type { ClothingCategory } from '../types'
import { CATEGORY_LABELS } from '../types'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[]

interface Props {
  value: ClothingCategory
  onChange: (c: ClothingCategory) => void
}

export function CategorySelect({ value, onChange }: Props) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">Категория</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ClothingCategory)}
        className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100 appearance-none"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
        ))}
      </select>
    </div>
  )
}
