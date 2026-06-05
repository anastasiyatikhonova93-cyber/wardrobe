import { removeBackground } from './background-removal'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сформировать изображение'))),
      type,
      quality,
    )
  })
}

const TRANSPARENT_ALPHA = 8 // пиксели прозрачнее этого порога не трогаем
const SATURATION = 1.14 // лёгкое усиление насыщенности
const LOW_PCT = 0.005 // 0.5% — нижний перцентиль для авто-контраста
const HIGH_PCT = 0.995 // 99.5% — верхний перцентиль

/**
 * Авто-цветокоррекция «как в онлайн-магазине»: растягивает яркость по перцентилям
 * (авто-контраст/экспозиция) и слегка поднимает насыщенность. Работает только по
 * непрозрачным пикселям вещи, альфа-канал сохраняется. Изменения мягкие — на уже
 * хорошо снятом фото эффект минимальный, тёмное/блёклое заметно оживает.
 */
function autoColorCorrect(data: Uint8ClampedArray): void {
  const hist = new Array(256).fill(0)
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < TRANSPARENT_ALPHA) continue
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
    hist[lum]++
    count++
  }
  if (count === 0) return

  // Перцентили яркости, чтобы отсечь редкие выбросы.
  const loTarget = count * LOW_PCT
  const hiTarget = count * HIGH_PCT
  let acc = 0
  let lo = 0
  let hi = 255
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= loTarget) { lo = v; break }
  }
  acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= hiTarget) { hi = v; break }
  }

  // Один и тот же линейный сдвиг ко всем каналам — баланс белого не «уезжает»,
  // меняется только контраст/экспозиция, оттенки вещи сохраняются.
  const range = hi - lo
  const scale = range > 4 ? 255 / range : 1
  const offset = range > 4 ? lo : 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < TRANSPARENT_ALPHA) continue

    let r = (data[i] - offset) * scale
    let g = (data[i + 1] - offset) * scale
    let b = (data[i + 2] - offset) * scale

    const gray = r * 0.299 + g * 0.587 + b * 0.114
    r = gray + (r - gray) * SATURATION
    g = gray + (g - gray) * SATURATION
    b = gray + (b - gray) * SATURATION

    data[i] = r < 0 ? 0 : r > 255 ? 255 : r
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
}

async function enhance(cutout: Blob): Promise<Blob> {
  const url = URL.createObjectURL(cutout)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    autoColorCorrect(imageData.data)
    ctx.putImageData(imageData, 0, 0)

    // PNG — чтобы сохранить прозрачный фон.
    return canvasToBlob(canvas, 'image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Приводит фото вещи к «гардеробному» виду: вырезает фон локальной нейросетью
 * (@imgly/background-removal, бесплатно, в браузере) — оставляя вещь на прозрачном
 * фоне — и делает авто-цветокоррекцию для презентабельного вида.
 */
export async function cleanupPhoto(source: Blob): Promise<Blob> {
  const cutout = await removeBackground(source)
  return enhance(cutout)
}
