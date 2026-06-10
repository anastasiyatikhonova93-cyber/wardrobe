import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore, useOutfitCategories } from '../store'
import type { Outfit, Board } from '../types'
import { OutfitCard } from '../components/OutfitCard'
import { OutfitEditor } from '../components/OutfitEditor'
import { OutfitFilterBar } from '../components/OutfitFilterBar'
import { BoardCard } from '../components/BoardCard'
import { BoardEditor } from '../components/BoardEditor'
import { BoardViewer } from '../components/BoardViewer'
import { matchesOutfitFilter } from '../lib/outfit-layout'

type Tab = 'outfits' | 'boards'

export function OutfitsPage() {
  const { wardrobe, shopping, outfits, boards, removeOutfit, removeBoard } = useStore()
  const categories = useOutfitCategories()
  const [tab, setTab] = useState<Tab>('outfits')

  const [outfitCategory, setOutfitCategory] = useState<string | 'all'>('all')
  const [outfitItem, setOutfitItem] = useState<string | null>(null)
  // undefined = закрыто, null = новый, Outfit = редактирование
  const [editingOutfit, setEditingOutfit] = useState<Outfit | null | undefined>(undefined)

  // Доски: открытая на просмотр / редактируемая.
  const [viewingBoard, setViewingBoard] = useState<Board | null>(null)
  const [editingBoard, setEditingBoard] = useState<Board | null | undefined>(undefined)

  const filteredOutfits = outfits.filter((o) => matchesOutfitFilter(o, outfitCategory, outfitItem))

  function handleAdd() {
    if (tab === 'outfits') setEditingOutfit(null)
    // Нет образов — доску собирать не из чего; не открываем тупиковую модалку.
    else if (outfits.length > 0) setEditingBoard(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Образы</h1>
        <button
          onClick={handleAdd}
          className="rounded-full bg-black text-white p-2.5 transition-transform active:scale-95"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Переключатель вкладок */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-full mb-4">
        <TabButton label="Образы" active={tab === 'outfits'} onClick={() => setTab('outfits')} />
        <TabButton label="Доски" active={tab === 'boards'} onClick={() => setTab('boards')} />
      </div>

      {tab === 'outfits' ? (
        outfits.length === 0 ? (
          <EmptyOutfits onAdd={() => setEditingOutfit(null)} />
        ) : (
          <>
            <OutfitFilterBar
              categories={categories}
              selected={outfitCategory}
              onSelect={setOutfitCategory}
              itemFilter={outfitItem}
              onItem={setOutfitItem}
              wardrobe={wardrobe}
            />
            {filteredOutfits.length === 0 ? (
              <p className="text-center text-sm text-zinc-300 mt-16">Нет образов под этот фильтр</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {filteredOutfits.map((outfit) => (
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
            )}
          </>
        )
      ) : (
        boards.length === 0 ? (
          <EmptyBoards onAdd={() => setEditingBoard(null)} disabled={outfits.length === 0} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                outfits={outfits}
                wardrobeItems={wardrobe}
                shoppingItems={shopping}
                onRemove={removeBoard}
                onOpen={setViewingBoard}
              />
            ))}
          </div>
        )
      )}

      {editingOutfit !== undefined && (
        <OutfitEditor outfit={editingOutfit} onClose={() => setEditingOutfit(undefined)} />
      )}

      {editingBoard !== undefined && (
        <BoardEditor board={editingBoard} onClose={() => setEditingBoard(undefined)} />
      )}

      {viewingBoard && (
        <BoardViewer
          board={viewingBoard}
          onClose={() => setViewingBoard(null)}
          onEdit={() => { setEditingBoard(viewingBoard); setViewingBoard(null) }}
        />
      )}
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-white text-black shadow-sm' : 'text-zinc-500'
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
      <button onClick={onAdd} className="text-sm text-zinc-500 underline underline-offset-2">
        Добавить образ
      </button>
    </div>
  )
}

function EmptyBoards({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <div className="text-center mt-20">
      <p className="text-sm text-zinc-300 mb-3">
        {disabled ? 'Сначала создайте образы' : 'Соберите доску из образов по фильтру'}
      </p>
      {!disabled && (
        <button onClick={onAdd} className="text-sm text-zinc-500 underline underline-offset-2">
          Создать доску
        </button>
      )}
    </div>
  )
}
