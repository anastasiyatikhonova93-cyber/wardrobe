import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { ClothingItem, ShoppingItem, Outfit } from '../types'
import { SEASON_LABELS } from '../types'
import { useOutfitCategories } from '../store'
import { TransparentImg } from './TransparentImg'
import { computeBounds, itemBoxFrac, buildItemLookup } from '../lib/outfit-layout'
import { useAspectRatios } from '../lib/use-image-aspect'

interface Props {
  outfit: Outfit
  wardrobeItems: ClothingItem[]
  shoppingItems: ShoppingItem[]
  onRemove: (id: string) => void
  onEdit: (outfit: Outfit) => void
}

export function OutfitPreview({ outfit, wardrobeItems, shoppingItems }: { outfit: Outfit; wardrobeItems: ClothingItem[]; shoppingItems: ShoppingItem[] }) {
  // Ссылки массивов из стора стабильны между несвязанными ре-рендерами → строим
  // карту id→вещь один раз, а не на каждый рендер каждой карточки.
  const byId = useMemo(() => buildItemLookup([...wardrobeItems, ...shoppingItems]), [wardrobeItems, shoppingItems])
  const positions = outfit.itemPositions ?? []

  const aspectBySrc = useAspectRatios(positions.map((p) => byId.get(p.itemId)?.imageUrl))
  const aspectOf = (itemId: string) => aspectBySrc(byId.get(itemId)?.imageUrl)

  const bounds = computeBounds(positions, byId, aspectOf)

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
        const item = byId.get(pos.itemId)
        if (!item) return null
        const { hFrac, wFrac } = itemBoxFrac(item, pos.userScale, aspectOf(pos.itemId))
        return (
          <div
            key={pos.itemId}
            // Аспекты картинок догружаются асинхронно (`useAspectRatios` отдаёт фолбэк
            // 3:4 до загрузки) → бокс может разок перескочить. Плавный переход смягчает
            // этот скачок; в превью нет перетаскивания, так что анимация не мешает.
            className="absolute transition-[left,top,width,height] duration-200 ease-out"
            style={{
              left: `${(pos.x - bx) * scale + offsetX}%`,
              top: `${(pos.y - by) * scale + offsetY}%`,
              width: `${wFrac * 100 * scale}%`,
              height: `${hFrac * 100 * scale}%`,
            }}
          >
            {item.imageUrl ? (
              <TransparentImg src={item.imageUrl} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-zinc-200 rounded-lg flex items-center justify-center text-zinc-400 text-xs">
                {(item.name ?? '?')[0]}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function OutfitCard({ outfit, wardrobeItems, shoppingItems, onRemove, onEdit }: Props) {
  const hasPositions = (outfit.itemPositions ?? []).length > 0
  const allCategories = useOutfitCategories()
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]))
  const categoryNames = (outfit.categories ?? [])
    .map((id) => nameById.get(id))
    .filter(Boolean) as string[]

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
        <p className="text-xs text-zinc-400 mt-0.5 truncate">
          {[
            outfit.season ? SEASON_LABELS[outfit.season] : null,
            ...categoryNames,
          ].filter(Boolean).join(' · ')}
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
