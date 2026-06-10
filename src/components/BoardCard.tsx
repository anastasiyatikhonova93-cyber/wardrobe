import { Trash2 } from 'lucide-react'
import type { Board, ClothingItem, ShoppingItem, Outfit } from '../types'
import { OutfitPreview } from './OutfitCard'

interface Props {
  board: Board
  outfits: Outfit[]
  wardrobeItems: ClothingItem[]
  shoppingItems: ShoppingItem[]
  onRemove: (id: string) => void
  onOpen: (board: Board) => void
}

export function BoardCard({ board, outfits, wardrobeItems, shoppingItems, onRemove, onOpen }: Props) {
  // Существующие образы доски (пропускаем удалённые, чтобы счётчик не врал).
  const resolved = board.outfitIds
    .map((id) => outfits.find((o) => o.id === id))
    .filter((o): o is Outfit => !!o)
  const preview = resolved.slice(0, 4)

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-zinc-50 cursor-pointer active:scale-[0.98] transition-transform group"
      onClick={() => onOpen(board)}
    >
      <div className="grid grid-cols-2 gap-px bg-zinc-100 aspect-square">
        {Array.from({ length: 4 }).map((_, i) => {
          const o = preview[i]
          return (
            <div key={i} className="bg-white overflow-hidden flex items-center justify-center">
              {o ? (
                <OutfitPreview outfit={o} wardrobeItems={wardrobeItems} shoppingItems={shoppingItems} />
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="p-3">
        <p className="text-sm font-medium leading-tight truncate">{board.name}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{resolved.length} образов</p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(board.id) }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white/80 backdrop-blur rounded-full p-1.5 transition-opacity z-10"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
