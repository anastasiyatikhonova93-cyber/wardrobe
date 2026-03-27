import { Trash2 } from 'lucide-react'
import type { ClothingItem, ShoppingItem, Outfit } from '../types'
import { SEASON_LABELS } from '../types'

interface Props {
  outfit: Outfit
  wardrobeItems: ClothingItem[]
  shoppingItems: ShoppingItem[]
  onRemove: (id: string) => void
}

function ItemChip({ name, imageUrl, isShopping }: { name: string; imageUrl?: string; isShopping: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${isShopping ? 'bg-zinc-200' : 'bg-zinc-100'}`}>
      {imageUrl ? (
        <img src={imageUrl} className="w-5 h-5 rounded-full object-cover" alt="" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-zinc-300 flex items-center justify-center text-[9px] text-white">
          {(name ?? '?')[0]}
        </div>
      )}
      <span className="truncate max-w-[100px]">{name}</span>
    </div>
  )
}

export function OutfitCard({ outfit, wardrobeItems, shoppingItems, onRemove }: Props) {
  const wItems = wardrobeItems.filter((i) => outfit.wardrobeItemIds.includes(i.id))
  const sItems = shoppingItems.filter((i) => outfit.shoppingItemIds.includes(i.id))

  return (
    <div className="rounded-2xl bg-zinc-50 p-4 group relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{outfit.name}</h3>
        <span className="text-[10px] px-2 py-0.5 bg-zinc-100 rounded-full text-zinc-500">
          {SEASON_LABELS[outfit.season]}
          {outfit.occasion ? ` · ${outfit.occasion}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {wItems.map((i) => <ItemChip key={i.id} name={i.name} imageUrl={i.imageUrl} isShopping={false} />)}
        {sItems.map((i) => <ItemChip key={i.id} name={i.name} imageUrl={i.imageUrl} isShopping={true} />)}
      </div>
      <button
        onClick={() => onRemove(outfit.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 bg-white/80 backdrop-blur rounded-full p-1.5 transition-opacity"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
