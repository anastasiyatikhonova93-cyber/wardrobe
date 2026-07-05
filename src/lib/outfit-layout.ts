import type { ClothingCategory, ClothingItem, ShoppingItem, Outfit } from '../types'

/** Соотношение сторон холста образа (ширина:высота) — как `aspect-[3/4]` превью/редактора и ячейки PNG. */
export const CANVAS_ASPECT = 3 / 4

/**
 * Целевая ШИРИНА вещи как доля ширины холста — «footprint» категории. Источник
 * правды о взаимных размерах: верхняя одежда/платья самые широкие, топы уже низа,
 * сумки/обувь мелкие (иерархия как в эталонной плоской раскладке).
 *
 * Почему ширина, а не площадь/высота: в плоской раскладке размер вещи читается прежде
 * всего по ШИРИНЕ. Площадь-по-категории не лечила широкие/квадратные кадры (топ-запах
 * «крестом» снят почти 1:1) — при равной площади квадратный топ выходил шире узких
 * штанов и казался огромным. Фиксируя ширину по категории (высота = ширина / аспект),
 * мы гарантируем: топ не шире низа, обувь мельче, как бы вещь ни сфотографировали.
 * Для фото с «нормальным» аспектом (≈3:4) размеры почти не меняются — ужимаются лишь
 * аномально широкие кадры.
 */
export const CATEGORY_WIDTH: Record<ClothingCategory, number> = {
  outerwear: 0.46,
  dresses: 0.40,
  bottoms: 0.34,
  knitwear: 0.32,
  tops: 0.30,
  bags: 0.20,
  accessories: 0.18,
  shoes: 0.17,
}

const DEFAULT_WIDTH = 0.30

/** Границы аспекта для раскладки: страхуют от кривого bbox после вырезания фона,
 *  чтобы патологически вытянутая картинка не дала абсурдную высоту. */
const MIN_ASPECT = 0.3
const MAX_ASPECT = 3.2
/** Потолок высоты (доля холста): очень узкая вещь (платье, брюки) не должна занимать
 *  почти весь холст. При срабатывании ужимаем и ширину тем же коэффициентом — аспект
 *  сохраняется. Ширина и так ограничена `CATEGORY_WIDTH` (≤ 0.46), отдельного капа не нужно. */
const MAX_H_FRAC = 0.62

/** Карта вещей по id — чтобы не сканировать массив `.find`'ом на каждую позицию образа. */
export type ItemLookup = Map<string, ClothingItem | ShoppingItem>

export function buildItemLookup(items: (ClothingItem | ShoppingItem)[]): ItemLookup {
  return new Map(items.map((i) => [i.id, i]))
}

/**
 * Размеры бокса вещи в долях холста из целевой ширины категории и реального аспекта
 * `aspect` (= natW/natH обрезанной картинки). Ширина фиксирована по категории, высота
 * выводится из аспекта: при a' = aspect / CANVAS_ASPECT (= wFrac/hFrac в единицах
 * холста) hFrac = wFrac / a'. Если высота упирается в потолок — ужимаем обе стороны
 * единым коэффициентом (аспект сохраняется). `userScale` — линейный ручной множитель
 * поверх (перетаскивание-ресайз остаётся линейным по видимой стороне).
 */
export function itemBoxFrac(
  item: ClothingItem | ShoppingItem | undefined,
  userScale: number | undefined,
  aspect: number,
): { hFrac: number; wFrac: number } {
  const w = item ? (CATEGORY_WIDTH[item.category] ?? DEFAULT_WIDTH) : DEFAULT_WIDTH
  const a = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect)) / CANVAS_ASPECT
  const h = w / a
  // Потолок высоты: ужимаем обе стороны единым коэффициентом → аспект сохраняется.
  const fit = Math.min(1, MAX_H_FRAC / h)
  const scale = (userScale ?? 1) * fit
  return { hFrac: h * scale, wFrac: w * scale }
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
