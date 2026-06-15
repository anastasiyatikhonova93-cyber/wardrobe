import type { ClothingCategory, Season } from '../types'

// Прототип мульти-распознавания: одно фото (зеркальное селфи / фото образа) →
// список отдельных вещей с рамками. Рамки приходят от Gemini (см. api/detect.ts)
// в формате box_2d = [ymin, xmin, ymax, xmax], нормировка 0..1000.

export interface DetectedItem {
  label: string
  category: ClothingCategory
  color: string
  seasons: Season[]
  // Нормированная рамка 0..1 (уже переведённая из gemini-овской 0..1000).
  box: { top: number; left: number; bottom: number; right: number }
}

const VALID_CATEGORIES: ClothingCategory[] = [
  'tops', 'bottoms', 'dresses', 'outerwear', 'knitwear', 'shoes', 'bags', 'accessories',
]

const VALID_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

function validateCategory(cat: unknown): ClothingCategory {
  return VALID_CATEGORIES.includes(cat as ClothingCategory) ? (cat as ClothingCategory) : 'tops'
}

// Сезоны от Gemini — необязательны; оставляем только валидные. Пусто — значит
// модель не уверена, пользователь доставит вручную в карточке.
function validateSeasons(raw: unknown): Season[] {
  if (!Array.isArray(raw)) return []
  return VALID_SEASONS.filter((s) => raw.includes(s))
}

/** Тот же приём, что в classify-photo: ужать до компактного JPEG перед отправкой. */
function fileToCompactDataUrl(file: File, maxDim = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height
        if (width > maxDim || height > maxDim) {
          const r = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * r)
          height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(e instanceof Error ? e : new Error('encode failed'))
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to read file'))
    }
    img.src = url
  })
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Распознать несколько вещей на одном фото. Пустой массив — если ничего не нашли. */
export async function detectItems(file: File): Promise<DetectedItem[]> {
  const image = await fileToCompactDataUrl(file)
  const res = await fetch('/api/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Детекция не удалась (${res.status}). ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  const raw = Array.isArray(data?.items) ? data.items : []
  const out: DetectedItem[] = []
  for (const it of raw) {
    const box = it?.box_2d
    if (!Array.isArray(box) || box.length < 4) continue
    // Берём только числовые координаты: Number('')/Number(null) дают 0 и
    // пропустили бы вырожденную рамку (мусорная плитка), поэтому отбрасываем
    // всё, что не конечное число, до деления.
    const coords = box.slice(0, 4)
    if (!coords.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) continue
    const [ymin, xmin, ymax, xmax] = coords.map((v: number) => v / 1000)
    out.push({
      label: typeof it.label === 'string' ? it.label : '',
      category: validateCategory(it.category),
      color: typeof it.color === 'string' ? it.color : '',
      seasons: validateSeasons(it.seasons),
      box: {
        top: clamp01(Math.min(ymin, ymax)),
        left: clamp01(Math.min(xmin, xmax)),
        bottom: clamp01(Math.max(ymin, ymax)),
        right: clamp01(Math.max(xmin, xmax)),
      },
    })
  }
  return out
}

/** Вырезать одну вещь по рамке в data-URL (PNG). Небольшой паддинг по краям. */
export function cropItem(img: HTMLImageElement, box: DetectedItem['box'], pad = 0.02): string {
  const W = img.naturalWidth || img.width
  const H = img.naturalHeight || img.height
  const left = clamp01(box.left - pad) * W
  const top = clamp01(box.top - pad) * H
  const right = clamp01(box.right + pad) * W
  const bottom = clamp01(box.bottom + pad) * H
  const w = Math.max(1, Math.round(right - left))
  const h = Math.max(1, Math.round(bottom - top))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, Math.round(left), Math.round(top), w, h, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}
