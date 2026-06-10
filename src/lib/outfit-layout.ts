import type { ClothingItem, ShoppingItem, Outfit } from '../types'
import { CATEGORY_SCALE } from '../types'

/** Базовая ширина бокса вещи в координатах превью (% холста). */
export const ITEM_BASE_W = 25
/** Соотношение сторон бокса вещи (ширина:высота), как inner aspect-[3/4] в превью. */
export const ITEM_ASPECT = 3 / 4

/** Масштаб вещи по её категории (платья крупнее, аксессуары мельче). */
export function getItemScale(itemId: string, allItems: (ClothingItem | ShoppingItem)[]): number {
  const item = allItems.find((i) => i.id === itemId)
  if (!item) return 1
  return CATEGORY_SCALE[item.category] ?? 1
}

/** Bounding box позиций вещей образа в координатах превью. */
export function computeBounds(
  positions: Outfit['itemPositions'],
  allItems: (ClothingItem | ShoppingItem)[],
) {
  if (!positions.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of positions) {
    const s = getItemScale(p.itemId, allItems)
    const w = ITEM_BASE_W * s
    const h = w * 1.33
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + w > maxX) maxX = p.x + w
    if (p.y + h > maxY) maxY = p.y + h
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/** Подходит ли образ под фильтр доски/списка (повод + вещь). */
export function matchesOutfitFilter(o: Outfit, category: string | 'all', itemId: string | null): boolean {
  const okCategory = category === 'all' || (o.categories ?? []).includes(category)
  const okItem = !itemId || (o.wardrobeItemIds ?? []).includes(itemId)
  return okCategory && okItem
}
