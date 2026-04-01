import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { ClothingCategory, Outfit } from '../types'
import { CATEGORY_LABELS } from '../types'
import { ClothingCard } from '../components/ClothingCard'
import { OutfitCard } from '../components/OutfitCard'
import { OutfitEditor } from '../components/OutfitEditor'
import { Modal } from '../components/Modal'
import { AddClothingForm } from '../components/AddClothingForm'

type Tab = 'outfits' | 'items'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[]

export function WardrobePage() {
  const { wardrobe, shopping, outfits, addClothing, removeClothing, updateClothing, removeOutfit } = useStore()
  const [tab, setTab] = useState<Tab>('outfits')
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all')
  // undefined = closed, null = new, Outfit = editing
  const [editingOutfit, setEditingOutfit] = useState<Outfit | null | undefined>(undefined)

  const filtered = filter === 'all'
    ? wardrobe
    : wardrobe.filter((i) => i.category === filter)

  return (
    <div>
      <Header
        tab={tab}
        onAdd={() => tab === 'items' ? setShowAdd(true) : setEditingOutfit(null)}
      />
      <TabBar tab={tab} onChange={setTab} />

      {tab === 'outfits' ? (
        outfits.length === 0 ? (
          <EmptyOutfits onAdd={() => setEditingOutfit(null)} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {outfits.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                wardrobeItems={wardrobe}
                shoppingItems={shopping}
                onRemove={removeOutfit}
                onEdit={(o) => setEditingOutfit(o)}
              />
            ))}
          </div>
        )
      ) : (
        <>
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
                  onUpdateImage={(id, url) => updateClothing(id, { imageUrl: url })}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Новая вещь">
        <AddClothingForm onAdd={addClothing} onClose={() => setShowAdd(false)} />
      </Modal>

      {editingOutfit !== undefined && (
        <OutfitEditor
          outfit={editingOutfit}
          onClose={() => setEditingOutfit(undefined)}
        />
      )}
    </div>
  )
}

function Header({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">Гардероб</h1>
      <div className="flex items-center gap-2">
        {tab === 'items' && (
          <button
            onClick={() => navigate('/import')}
            className="rounded-full bg-zinc-100 text-zinc-600 p-2.5 transition-transform active:scale-95 hover:bg-zinc-200"
            title="Импорт фото"
          >
            <Upload size={18} />
          </button>
        )}
        <button onClick={onAdd} className="rounded-full bg-black text-white p-2.5 transition-transform active:scale-95">
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 bg-zinc-100 rounded-full p-1 mb-4">
      <TabButton label="Образы" active={tab === 'outfits'} onClick={() => onChange('outfits')} />
      <TabButton label="Вещи" active={tab === 'items'} onClick={() => onChange('items')} />
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-white text-black shadow-sm' : 'text-zinc-400'
      }`}
    >
      {label}
    </button>
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

function EmptyOutfits({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center mt-20">
      <p className="text-sm text-zinc-300 mb-3">Создайте свой первый образ</p>
      <button
        onClick={onAdd}
        className="text-sm text-zinc-500 underline underline-offset-2"
      >
        Добавить образ
      </button>
    </div>
  )
}

function EmptyItems() {
  return (
    <p className="text-center text-sm text-zinc-300 mt-20">
      Нажмите + чтобы добавить вещь
    </p>
  )
}
