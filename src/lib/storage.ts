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

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}
