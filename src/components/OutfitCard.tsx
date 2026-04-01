import { Trash2 } from 'lucide-react'
import type { ClothingItem, ShoppingItem, Outfit } from '../types'
import { SEASON_LABELS, CATEGORY_SCALE } from '../types'
import { TransparentImg } from './TransparentImg'

interface Props {
  outfit: Outfit
  wardrobeItems: ClothingItem[]
  shoppingItems: ShoppingItem[]
  onRemove: (id: string) => void
  onEdit: (outfit: Outfit) => void
}

function getItemScale(itemId: string, allItems: (ClothingItem | ShoppingItem)[]): number {
  const item = allItems.find((i) => i.id === itemId)
  if (!item) return 1
  return CATEGORY_SCALE[item.category] ?? 1
}

function computeBounds(positions: Outfit['itemPositions'], allItems: (ClothingItem | ShoppingItem)[]) {
  if (!positions.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of positions) {
    const s = getItemScale(p.itemId, allItems)
    const w = 25 * s
    const h = w * 1.33
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + w > maxX) maxX = p.x + w
    if (p.y + h > maxY) maxY = p.y + h
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

function OutfitPreview({ outfit, wardrobeItems, shoppingItems }: { outfit: Outfit; wardrobeItems: ClothingItem[]; shoppingItems: ShoppingItem[] }) {
  const allItems = [...wardrobeItems, ...shoppingItems]
  const positions = outfit.itemPositions ?? []
  const bounds = computeBounds(positions, allItems)

  if (!bounds || !positions.length) return null

  const padding = 4
  const bx = bounds.minX - padding
  const by = bounds.minY - padding
  const bw = bounds.w + padding * 2
  const bh = bounds.h + padding * 2
  const scale = Math.min(100 / bw, 100 / bh)
  const offsetX = (100 - bw * scale) / 2
  const offsetY = (100 - bh * scale) / 2

  return (
    <div className="relative w-full aspect-[3/4] overflow-hidden">
      {positions.map((pos) => {
        const item = allItems.find((i) => i.id === pos.itemId)
        if (!item) return null
        const itemScale = getItemScale(pos.itemId, allItems)
        const itemW = 25 * itemScale
        return (
          <div
            key={pos.itemId}
            className="absolute"
            style={{
              left: `${(pos.x - bx) * scale + offsetX}%`,
              top: `${(pos.y - by) * scale + offsetY}%`,
              width: `${itemW * scale}%`,
            }}
          >
            <div className="aspect-[3/4]">
              {item.imageUrl ? (
                <TransparentImg src={item.imageUrl} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-zinc-200 rounded-lg flex items-center justify-center text-zinc-400 text-xs">
                  {(item.name ?? '?')[0]}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function OutfitCard({ outfit, wardrobeItems, shoppingItems, onRemove, onEdit }: Props) {
  const hasPositions = (outfit.itemPositions ?? []).length > 0

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-zinc-50 cursor-pointer active:scale-[0.98] transition-transform group"
      onClick={() => onEdit(outfit)}
    >
      {hasPositions ? (
        <OutfitPreview outfit={outfit} wardrobeItems={wardrobeItems} shoppingItems={shoppingItems} />
      ) : (
        <div className="w-full aspect-[3/4] flex items-center justify-center text-zinc-300 text-4xl font-light">
          ?
        </div>
      )}

      <div className="p-3">
        <p className="text-sm font-medium leading-tight truncate">{outfit.name}</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {SEASON_LABELS[outfit.season]}
          {outfit.occasion ? ` · ${outfit.occasion}` : ''}
        </p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(outfit.id) }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white/80 backdrop-blur rounded-full p-1.5 transition-opacity z-10"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
