const MAX_DIMENSION = 800
const JPEG_QUALITY = 0.7

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

function hasTransparency(img: HTMLImageElement): boolean {
  const c = document.createElement('canvas')
  c.width = Math.min(img.width, 64)
  c.height = Math.min(img.height, 64)
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 250) return true
  }
  return false
}

export function compressToDataUrl(
  img: HTMLImageElement,
  maxDim = MAX_DIMENSION,
  quality = JPEG_QUALITY,
): string {
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const transparent = hasTransparency(img)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  if (!transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }

  ctx.drawImage(img, 0, 0, width, height)

  if (transparent) {
    return canvas.toDataURL('image/png')
  }
  return canvas.toDataURL('image/jpeg', quality)
}
