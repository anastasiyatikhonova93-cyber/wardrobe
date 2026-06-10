import type { ClothingItem, ClothingCategory } from '../types'
import { makeTransparent } from './transparent-image'

/** Вещь, подготовленная к раскладке: обрезанная прозрачная картинка + её размеры. */
export interface PreparedItem {
  item: ClothingItem
  /** data-URL прозрачной обрезанной картинки. Пусто, если у вещи нет фото. */
  url: string
  natW: number
  natH: number
}

/** Вещь, размещённая на доске в абсолютных координатах (виртуальные пиксели). */
export interface PlacedItem {
  item: ClothingItem
  url: string
  x: number
  y: number
  w: number
  h: number
}

export interface BoardLayout {
  width: number
  height: number
  placed: PlacedItem[]
}

/** Порядок категорий сверху вниз — как стилист раскладывает капсулу. */
const ORDER: ClothingCategory[] = [
  'outerwear',
  'knitwear',
  'tops',
  'dresses',
  'bottoms',
  'bags',
  'shoes',
  'accessories',
]

/** Базовая высота ряда для каждой категории (виртуальные px). Платья/верхняя — крупнее, аксессуары — мельче. */
const ROW_HEIGHT: Record<ClothingCategory, number> = {
  dresses: 340,
  outerwear: 300,
  bottoms: 270,
  knitwear: 240,
  tops: 230,
  bags: 200,
  shoes: 150,
  accessories: 170,
}

const FALLBACK_ASPECT = 3 / 4 // для вещей без фото

/** Загружает картинку и возвращает её натуральные размеры. */
function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 3, h: img.naturalHeight || 4 })
    img.onerror = () => resolve({ w: 3, h: 4 })
    img.src = src
  })
}

/** Готовит одну вещь: обрезает фон и измеряет результат. */
export async function prepareItem(item: ClothingItem): Promise<PreparedItem> {
  if (!item.imageUrl) {
    return { item, url: '', natW: 3, natH: 4 }
  }
  const url = await makeTransparent(item.imageUrl)
  const { w, h } = await imageSize(url)
  return { item, url, natW: w, natH: h }
}

/**
 * Раскладывает подготовленные вещи на доску: группирует по категориям рядами,
 * внутри ряда пакует слева направо (перенос на новый ряд при переполнении),
 * каждый ряд центрируется по горизонтали. Размер вещи задаётся высотой ряда
 * категории и её реальным соотношением сторон.
 */
export function computeBoardLayout(prepared: PreparedItem[], width = 1040, gap = 28): BoardLayout {
  const byCat = new Map<ClothingCategory, PreparedItem[]>()
  for (const p of prepared) {
    const arr = byCat.get(p.item.category) ?? []
    arr.push(p)
    byCat.set(p.item.category, arr)
  }

  const placed: PlacedItem[] = []
  let cursorY = gap

  // Сначала известные категории в заданном порядке, затем любые неожиданные
  // (на случай «грязных» данных) — чтобы ни одна вещь не пропала с доски.
  const extra = [...byCat.keys()].filter((c) => !ORDER.includes(c))
  for (const cat of [...ORDER, ...extra]) {
    const items = byCat.get(cat)
    if (!items || items.length === 0) continue
    const rowH = ROW_HEIGHT[cat] ?? ROW_HEIGHT.tops
    const maxItemW = width - gap * 2

    let row: { p: PreparedItem; w: number }[] = []
    let rowW = gap

    const flushRow = () => {
      if (row.length === 0) return
      const totalW = row.reduce((s, r) => s + r.w, 0) + gap * (row.length - 1)
      let x = (width - totalW) / 2
      for (const r of row) {
        placed.push({ item: r.p.item, url: r.p.url, x, y: cursorY, w: r.w, h: rowH })
        x += r.w + gap
      }
      cursorY += rowH + gap
      row = []
      rowW = gap
    }

    for (const p of items) {
      const aspect = p.url ? p.natW / p.natH : FALLBACK_ASPECT
      const w = Math.min(maxItemW, rowH * aspect)
      if (row.length > 0 && rowW + w + gap > width - gap) flushRow()
      row.push({ p, w })
      rowW += w + gap
    }
    flushRow()
  }

  return { width, height: Math.max(cursorY, gap), placed }
}

/**
 * Безопасный масштаб canvas под лимиты iOS Safari (сторона/площадь). При большой
 * доске дефолтный масштаб даёт пустой/чёрный PNG — снижаем ровно до лимитов.
 * Общий хелпер для всех canvas-рендеров досок.
 */
export function fitCanvasScale(width: number, height: number, maxScale = 2): number {
  const MAX_SIDE = 8192
  const MAX_AREA = 16_000_000
  const fit = Math.min(
    maxScale,
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_AREA / (width * height)),
  )
  return Number.isFinite(fit) ? Math.max(0.1, fit) : 1
}

/** Рисует доску на canvas и отдаёт PNG data-URL для скачивания. */
export async function renderBoardToPng(layout: BoardLayout, scale = 2): Promise<string> {
  scale = fitCanvasScale(layout.width, layout.height, scale)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(layout.width * scale)
  canvas.height = Math.round(layout.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (const p of layout.placed) {
    if (!p.url) continue
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = p.url
    })
    if (!img) continue
    ctx.drawImage(img, p.x * scale, p.y * scale, p.w * scale, p.h * scale)
  }

  return canvas.toDataURL('image/png')
}
