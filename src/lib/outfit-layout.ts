import type { ClothingCategory, ClothingItem, ShoppingItem, Outfit } from '../types'

/** Соотношение сторон холста образа (ширина:высота) — как `aspect-[3/4]` превью/редактора и ячейки PNG. */
export const CANVAS_ASPECT = 3 / 4

/**
 * Целевая ПЛОЩАДЬ вещи как доля площади холста (в единицах wFrac×hFrac, где wFrac
 * нормирована к ширине холста, hFrac — к высоте). Источник правды о взаимных размерах:
 * платья/верхняя одежда крупнее, обувь/аксессуары мельче.
 *
 * Почему площадь, а не высота: размер вещи воспринимается по визуальной массе, а не
 * по одной стороне. Высота-по-категории не устойчива к разбросу пропорций фото —
 * широко снятую вещь (топ «крестом», обувь сбоку) раздувало по ширине: топ выходил
 * гигантским, а обувь — шире штанов. При фиксированной площади ширина и высота
 * выводятся из аспекта так, что масса вещи постоянна для категории независимо от
 * того, как сфотографировали. Значения ≈ квадрату прежних высот (для фото с «нормальным»
 * аспектом 3:4 размер почти не меняется), сумки чуть крупнее, чтобы не терялись.
 */
export const CATEGORY_AREA: Record<ClothingCategory, number> = {
  dresses: 0.25,
  outerwear: 0.21,
  bottoms: 0.135,
  knitwear: 0.105,
  tops: 0.095,
  bags: 0.030,
  shoes: 0.011,
  accessories: 0.017,
}

const DEFAULT_AREA = 0.095

/** Границы аспекта для раскладки: страхуют от кривого bbox после вырезания фона,
 *  чтобы патологически вытянутая картинка не раздулась по одной стороне. */
const MIN_ASPECT = 0.3
const MAX_ASPECT = 3.2
/** Потолок размера вещи (доля холста) по каждой стороне: даже очень узкое платье или
 *  очень широкая вещь не должны занимать почти весь холст / вылезать за край. Кап
 *  применяется к обеим сторонам единым коэффициентом, поэтому аспект сохраняется. */
const MAX_H_FRAC = 0.62
const MAX_W_FRAC = 0.9

/** Карта вещей по id — чтобы не сканировать массив `.find`'ом на каждую позицию образа. */
export type ItemLookup = Map<string, ClothingItem | ShoppingItem>

export function buildItemLookup(items: (ClothingItem | ShoppingItem)[]): ItemLookup {
  return new Map(items.map((i) => [i.id, i]))
}

/**
 * Размеры бокса вещи в долях холста из целевой площади категории и реального аспекта
 * `aspect` (= natW/natH обрезанной картинки). При площади S и аспекте a (в единицах
 * холста a' = a / CANVAS_ASPECT): hFrac = √(S / a'), wFrac = √(S · a'), их произведение
 * = S. Затем единый кап под потолки сторон (сохраняет аспект). `userScale` — линейный
 * ручной множитель поверх капа (площадь меняется как userScale², но перетаскивание-
 * ресайз остаётся линейным по видимой стороне).
 */
export function itemBoxFrac(
  item: ClothingItem | ShoppingItem | undefined,
  userScale: number | undefined,
  aspect: number,
): { hFrac: number; wFrac: number } {
  const area = item ? (CATEGORY_AREA[item.category] ?? DEFAULT_AREA) : DEFAULT_AREA
  const a = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect)) / CANVAS_ASPECT
  const h = Math.sqrt(area / a)
  const w = h * a
  // Кап под потолки обеих сторон единым коэффициентом → аспект сохраняется.
  const fit = Math.min(1, MAX_H_FRAC / h, MAX_W_FRAC / w)
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
