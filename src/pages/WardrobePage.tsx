import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, LayoutGrid, ScanSearch } from 'lucide-react'
import { useStore } from '../store'
import type { ClothingCategory } from '../types'
import { CATEGORY_LABELS } from '../types'
import { ClothingCard } from '../components/ClothingCard'
import { Modal } from '../components/Modal'
import { AddClothingForm } from '../components/AddClothingForm'
import { WardrobeBoard } from '../components/WardrobeBoard'
import { imageUpdatePatch } from '../lib/item-states'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[]

export function WardrobePage() {
  const { wardrobe, addClothing, removeClothing, updateClothing } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all')

  const filtered = filter === 'all'
    ? wardrobe
    : wardrobe.filter((i) => i.category === filter)

  // Смена фото держит картинку основного состояния в синхроне (если состояния есть).
  async function handleUpdateImage(id: string, url: string) {
    const item = wardrobe.find((w) => w.id === id)
    if (!item) return
    await updateClothing(id, await imageUpdatePatch(item, url))
  }

  return (
    <div>
      <Header onAdd={() => setShowAdd(true)} onBoard={() => setShowBoard(true)} hasItems={wardrobe.length > 0} />
      <FilterBar filter={filter} onChange={setFilter} />
      {filtered.length === 0 ? (
        <EmptyItems />
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {filtered.map((item) => (
            <ClothingCard
              key={item.id}
              item={item}
              onRemove={removeClothing}
              onUpdateImage={handleUpdateImage}
              onUpdate={updateClothing}
            />
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Новая вещь">
        <AddClothingForm onAdd={addClothing} onClose={() => setShowAdd(false)} />
      </Modal>

      {showBoard && <WardrobeBoard wardrobe={wardrobe} onClose={() => setShowBoard(false)} />}
    </div>
  )
}

function Header({ onAdd, onBoard, hasItems }: { onAdd: () => void; onBoard: () => void; hasItems: boolean }) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">Гардероб</h1>
      <div className="flex items-center gap-2">
        {hasItems && (
          <button
            onClick={onBoard}
            className="rounded-full bg-zinc-100 text-zinc-600 p-2.5 transition-transform active:scale-95 hover:bg-zinc-200"
            title="Доска гардероба"
          >
            <LayoutGrid size={18} />
          </button>
        )}
        <button
          onClick={() => navigate('/detect-test')}
          className="rounded-full bg-zinc-100 text-zinc-600 p-2.5 transition-transform active:scale-95 hover:bg-zinc-200"
          title="Распознать вещи на фото или селфи"
        >
          <ScanSearch size={18} />
        </button>
        <button
          onClick={() => navigate('/import')}
          className="rounded-full bg-zinc-100 text-zinc-600 p-2.5 transition-transform active:scale-95 hover:bg-zinc-200"
          title="Импорт фото"
        >
          <Upload size={18} />
        </button>
        <button onClick={onAdd} className="rounded-full bg-black text-white p-2.5 transition-transform active:scale-95">
          <Plus size={18} />
        </button>
      </div>
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

function EmptyItems() {
  return (
    <p className="text-center text-sm text-zinc-300 mt-20">
      Нажмите + чтобы добавить вещь
    </p>
  )
}
