const MAX_DIMENSION = 800
const JPEG_QUALITY = 0.7
// Насыщенные цвета (малиновый, фуксия) при сильном сжатии WebP дают видимые
// полосы/бандинг. Держим качество высоким; если итог не влезает под лимит
// документа, размер ужимается циклом в compressToDataUrl.
const WEBP_QUALITY = 0.92
// Документ Firestore ограничен ~1 MiB. Держим картинку с запасом под прочие поля.
const MAX_DATA_URL = 900_000

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export async function uploadPhoto(file: File | Blob, _uid: string): Promise<string> {
  const objectUrl = blobToObjectUrl(file)
  try {
    const img = await loadImage(objectUrl)
    return compressToDataUrl(img)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// У вещи может быть несколько состояний (картинок) в одном документе Firestore
// (~1 MiB на документ). Поэтому состояния сжимаем плотнее основного фото — меньший
// размер, — чтобы уложиться в лимит вместе с основным изображением.
const STATE_MAX_DIMENSION = 512

export async function uploadStatePhoto(blob: Blob): Promise<string> {
  const objectUrl = blobToObjectUrl(blob)
  try {
    const img = await loadImage(objectUrl)
    return compressToDataUrl(img, STATE_MAX_DIMENSION)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function hasTransparency(img: HTMLImageElement): boolean {
  const c = document.createElement('canvas')
  c.width = Math.min(img.naturalWidth || img.width, 64)
  c.height = Math.min(img.naturalHeight || img.height, 64)
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 250) return true
  }
  return false
}

function fitDims(img: HTMLImageElement, maxDim: number): { width: number; height: number } {
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }
  return { width, height }
}

function render(
  img: HTMLImageElement,
  width: number,
  height: number,
  transparent: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (!transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

function encode(canvas: HTMLCanvasElement, transparent: boolean, quality: number): string {
  if (transparent) {
    // WebP с альфой — в разы легче PNG. Если браузер не умеет кодировать WebP
    // (старый Safari), toDataURL вернёт PNG — это ловит проверка префикса.
    const webp = canvas.toDataURL('image/webp', WEBP_QUALITY)
    if (webp.startsWith('data:image/webp')) return webp
    return canvas.toDataURL('image/png')
  }
  return canvas.toDataURL('image/jpeg', quality)
}

export function compressToDataUrl(
  img: HTMLImageElement,
  maxDim = MAX_DIMENSION,
  quality = JPEG_QUALITY,
): string {
  const transparent = hasTransparency(img)

  let dim = maxDim
  let { width, height } = fitDims(img, dim)
  let out = encode(render(img, width, height, transparent), transparent, quality)

  // Гарантируем, что итог влезет в документ Firestore: при необходимости
  // уменьшаем размер, пока не уложимся под лимит.
  while (out.length > MAX_DATA_URL && dim > 240) {
    dim = Math.round(dim * 0.82)
    ;({ width, height } = fitDims(img, dim))
    out = encode(render(img, width, height, transparent), transparent, quality)
  }

  return out
}
