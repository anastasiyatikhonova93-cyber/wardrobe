import type { ClothingCategory, ClothingItem, ShoppingItem, Outfit } from '../types'

/** Соотношение сторон холста образа (ширина:высота) — как `aspect-[3/4]` превью/редактора и ячейки PNG. */
export const CANVAS_ASPECT = 3 / 4

/**
 * Целевая высота вещи как доля высоты холста. Источник правды о взаимных размерах:
 * платья/верхняя одежда крупнее, обувь/аксессуары мельче. Пропорции соотносятся с
 * `ROW_HEIGHT` доски всего гардероба (`board-layout.ts`). Ширина вещи берётся из
 * реального соотношения сторон обрезанной картинки, а не из фиксированного бокса —
 * поэтому «лежачая» обувь больше не схлопывается в полоску.
 */
export const CATEGORY_HEIGHT: Record<ClothingCategory, number> = {
  dresses: 0.52,
  outerwear: 0.46,
  bottoms: 0.36,
  knitwear: 0.33,
  tops: 0.31,
  bags: 0.15,
  shoes: 0.13,
  accessories: 0.13,
}

const DEFAULT_HEIGHT = 0.31

/** Карта вещей по id — чтобы не сканировать массив `.find`'ом на каждую позицию образа. */
export type ItemLookup = Map<string, ClothingItem | ShoppingItem>

export function buildItemLookup(items: (ClothingItem | ShoppingItem)[]): ItemLookup {
  return new Map(items.map((i) => [i.id, i]))
}

/** Высота вещи (доля высоты холста) = база по категории × ручной множитель. */
export function getItemHeight(item: ClothingItem | ShoppingItem | undefined, userScale: number | undefined): number {
  const base = item ? (CATEGORY_HEIGHT[item.category] ?? DEFAULT_HEIGHT) : DEFAULT_HEIGHT
  return base * (userScale ?? 1)
}

/**
 * Размеры бокса вещи в долях холста: высота — по категории, ширина — из реального
 * соотношения сторон `aspect` (= natW/natH обрезанной картинки). `wFrac` нормирована
 * к ширине холста (поэтому делим на CANVAS_ASPECT), `hFrac` — к высоте холста.
 */
export function itemBoxFrac(
  item: ClothingItem | ShoppingItem | undefined,
  userScale: number | undefined,
  aspect: number,
): { hFrac: number; wFrac: number } {
  const hFrac = getItemHeight(item, userScale)
  const wFrac = (hFrac * aspect) / CANVAS_ASPECT
  return { hFrac, wFrac }
}

/**
 * Bounding box позиций вещей образа в координатах превью: ось X в %ширины холста
 * (`x … x + wFrac×100`), ось Y в %высоты холста (`y … y + hFrac×100`).
 */
export function computeBounds(
  positions: Outfit['itemPositions'],
  byId: ItemLookup,
  aspectOf: (itemId: string) => number,
) {
  if (!positions.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of positions) {
    const { hFrac, wFrac } = itemBoxFrac(byId.get(p.itemId), p.userScale, aspectOf(p.itemId))
    const w = wFrac * 100
    const h = hFrac * 100
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
