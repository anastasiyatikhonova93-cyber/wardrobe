import type { ClothingItem, ShoppingItem, Outfit } from '../types'
import { makeTransparent } from './transparent-image'
import { computeBounds, itemBoxFrac, buildItemLookup, CANVAS_ASPECT } from './outfit-layout'
import { fitCanvasScale } from './board-layout'

/**
 * Рендер доски образов в PNG: заголовок сверху + сетка ячеек, в каждой ячейке —
 * коллаж вещей образа (по его `itemPositions`). Повторяет раскладку превью из
 * `OutfitPreview` (та же геометрия из outfit-layout), чтобы картинка совпадала с экраном.
 */

/** Сколько колонок в сетке для n образов (как на референсе — широкая сетка, максимум 5). */
export function boardColumns(n: number): number {
  if (n <= 1) return 1
  return Math.min(5, Math.ceil(Math.sqrt(n)))
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = src
  })
}

/** Серый плейсхолдер вещи без картинки — повторяет div-заглушку из `OutfitPreview`. */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  name: string | undefined,
) {
  const r = Math.min(8, w / 2, h / 2)
  ctx.fillStyle = '#e4e4e7' // zinc-200
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h) // фолбэк для старых iOS Safari без roundRect
  ctx.fill()
  ctx.fillStyle = '#a1a1aa' // zinc-400
  // max(1,…): у крошечного бокса round(…*0.4) даёт 0px, а canvas «0px» игнорирует и
  // откатывается на дефолтный ~10px шрифт → буква вылезла бы за бокс в экспорте.
  ctx.font = `300 ${Math.max(1, Math.round(Math.min(w, h) * 0.4))}px -apple-system, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((name ?? '?')[0] ?? '?', x + w / 2, y + h / 2)
  ctx.textAlign = 'start' // вернуть дефолт для последующего текста
}

export interface RenderBoardOpts {
  title: string
  outfits: Outfit[]
  wardrobe: ClothingItem[]
  shopping: ShoppingItem[]
}

/**
 * Рисует доску на canvas и отдаёт PNG data-URL. Фиксированная виртуальная ширина,
 * белый фон, безопасный масштаб через fitCanvasScale (лимиты iOS Safari).
 */
export async function renderOutfitBoardToPng({ title, outfits, wardrobe, shopping }: RenderBoardOpts): Promise<string> {
  const byId = buildItemLookup([...wardrobe, ...shopping])
  const cols = boardColumns(outfits.length)
  const rows = Math.max(1, Math.ceil(outfits.length / cols))

  // Виртуальные размеры доски.
  const PAD = 48
  const GAP = 32
  const CELL_W = 320
  const CELL_H = Math.round(CELL_W / CANVAS_ASPECT) // ячейка 3:4, как превью
  const TITLE_H = title.trim() ? 90 : PAD

  const width = PAD * 2 + cols * CELL_W + (cols - 1) * GAP
  const height = TITLE_H + PAD + rows * CELL_H + (rows - 1) * GAP + PAD

  const scale = fitCanvasScale(width, height)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Заголовок.
  if (title.trim()) {
    ctx.fillStyle = '#18181b'
    ctx.font = '500 34px -apple-system, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(title.trim(), PAD, TITLE_H / 2 + PAD / 2)
  }

  // Ячейки образов.
  for (let i = 0; i < outfits.length; i++) {
    const outfit = outfits[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = PAD + col * (CELL_W + GAP)
    const cy = TITLE_H + PAD + row * (CELL_H + GAP)

    const positions = outfit.itemPositions ?? []

    // Пред-проход: грузим обрезанные картинки и их реальные пропорции (как в превью),
    // чтобы раскладка совпадала с экраном. Картинки независимы → грузим параллельно;
    // порядок рисования (z-order) задаётся отдельным циклом по positions, не загрузкой.
    const loaded = new Map<string, HTMLImageElement>()
    await Promise.all(positions.map(async (pos) => {
      const item = byId.get(pos.itemId)
      if (!item?.imageUrl) return
      const img = await loadImage(await makeTransparent(item.imageUrl))
      if (img) loaded.set(pos.itemId, img)
    }))
    const aspectOf = (itemId: string) => {
      const img = loaded.get(itemId)
      return img ? (img.naturalWidth || 3) / (img.naturalHeight || 4) : CANVAS_ASPECT
    }

    const b = computeBounds(positions, byId, aspectOf)
    if (!b) continue

    // Та же вписывающая раскладка, что в OutfitPreview.
    const padBox = 4
    const bx = b.minX - padBox
    const by = b.minY - padBox
    const bw = b.w + padBox * 2
    const bh = b.h + padBox * 2
    const fit = Math.min(100 / bw, 100 / bh)
    const offsetX = (100 - bw * fit) / 2
    const offsetY = (100 - bh * fit) / 2

    for (const pos of positions) {
      const item = byId.get(pos.itemId)
      const img = loaded.get(pos.itemId)

      const { hFrac, wFrac } = itemBoxFrac(item, pos.userScale, aspectOf(pos.itemId))
      // Бокс вещи в пикселях ячейки (как left/top/width/height % в превью). Бокс уже
      // в пропорциях картинки → рисуем её ровно в бокс, без доп. вписывания.
      const boxX = cx + ((pos.x - bx) * fit + offsetX) / 100 * CELL_W
      const boxY = cy + ((pos.y - by) * fit + offsetY) / 100 * CELL_H
      const boxW = wFrac * fit * CELL_W
      const boxH = hFrac * fit * CELL_H
      if (img) {
        ctx.drawImage(img, boxX, boxY, boxW, boxH)
      } else if (item) {
        // Вещь есть, но без картинки: рисуем серый плейсхолдер с первой буквой имени —
        // как в превью (`OutfitPreview`), иначе экспорт сместился бы относительно него
        // (`computeBounds` резервирует бокс под такую вещь, а раньше цикл её пропускал).
        drawPlaceholder(ctx, boxX, boxY, boxW, boxH, item.name)
      }
      // else: вещь удалена из гардероба (нет в byId) — `OutfitPreview` тоже ничего не
      // рисует (`if (!item) return null`); бокс всё равно зарезервирован в computeBounds,
      // так что центрирование превью и PNG совпадает.
    }
  }

  return canvas.toDataURL('image/png')
}
