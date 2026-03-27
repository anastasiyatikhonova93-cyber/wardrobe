import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store'
import type { ClothingCategory } from '../types'
import { CATEGORY_LABELS } from '../types'
import { ClothingCard } from '../components/ClothingCard'
import { Modal } from '../components/Modal'
import { AddClothingForm } from '../components/AddClothingForm'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[]

export function WardrobePage() {
  const { wardrobe, addClothing, removeClothing, updateClothing } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all')

  const filtered = filter === 'all'
    ? wardrobe
    : wardrobe.filter((i) => i.category === filter)

  return (
    <div>
      <Header onAdd={() => setShowAdd(true)} />
      <FilterBar filter={filter} onChange={setFilter} />
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {filtered.map((item) => (
            <ClothingCard
              key={item.id}
              item={item}
              onRemove={removeClothing}
              onUpdateImage={(id, url) => updateClothing(id, { imageUrl: url })}
            />
          ))}
        </div>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Новая вещь">
        <AddClothingForm onAdd={addClothing} onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
  )
}

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">Гардероб</h1>
      <button onClick={onAdd} className="rounded-full bg-black text-white p-2.5 transition-transform active:scale-95">
        <Plus size={18} />
      </button>
    </div>
  )
}

function FilterBar({ filter, onChange }: { filter: ClothingCategory | 'all'; onChange: (f: ClothingCategory | 'all') => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      <Chip label="Все" active={filter === 'all'} onClick={() => onChange('all')} />
      {CATEGORIES.map((c) => (
        <Chip key={c} label={CATEGORY_LABELS[c]} active={filter === c} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors ${
        active ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500'
      }`}
    >
      {label}
    </button>
  )
}

function EmptyState() {
  return (
    <p className="text-center text-sm text-zinc-300 mt-20">
      Нажмите + чтобы добавить вещь
    </p>
  )
}
