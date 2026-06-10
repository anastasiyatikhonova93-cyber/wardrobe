import type { ClothingItem, ShoppingItem, Outfit } from '../types'
import { makeTransparent } from './transparent-image'
import { computeBounds, getItemScale, ITEM_BASE_W, ITEM_ASPECT } from './outfit-layout'
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
  const allItems = [...wardrobe, ...shopping]
  const cols = boardColumns(outfits.length)
  const rows = Math.max(1, Math.ceil(outfits.length / cols))

  // Виртуальные размеры доски.
  const PAD = 48
  const GAP = 32
  const CELL_W = 320
  const CELL_H = Math.round(CELL_W / ITEM_ASPECT) // ячейка 3:4, как превью
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
    const b = computeBounds(positions, allItems)
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
      const item = allItems.find((it) => it.id === pos.itemId)
      if (!item?.imageUrl) continue
      const url = await makeTransparent(item.imageUrl)
      const img = await loadImage(url)
      if (!img) continue

      const itemW = ITEM_BASE_W * getItemScale(pos.itemId, allItems)
      // Бокс вещи в пикселях ячейки (как left/top/width % в превью).
      const boxX = cx + ((pos.x - bx) * fit + offsetX) / 100 * CELL_W
      const boxY = cy + ((pos.y - by) * fit + offsetY) / 100 * CELL_H
      const boxW = (itemW * fit) / 100 * CELL_W
      const boxH = boxW / ITEM_ASPECT

      // object-contain: вписываем картинку в бокс, сохраняя пропорции.
      const ar = (img.naturalWidth || 3) / (img.naturalHeight || 4)
      let drawW = boxW
      let drawH = boxW / ar
      if (drawH > boxH) { drawH = boxH; drawW = boxH * ar }
      ctx.drawImage(img, boxX + (boxW - drawW) / 2, boxY + (boxH - drawH) / 2, drawW, drawH)
    }
  }

  return canvas.toDataURL('image/png')
}
