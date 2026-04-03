const cache = new Map<string, string>()

export function makeTransparent(src: string): Promise<string> {
  const cached = cache.get(src)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, c.width, c.height)
      const d = imageData.data
      const w = c.width
      const h = c.height

      // Remove white/near-white background
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (r > 245 && g > 245 && b > 245) {
          d[i + 3] = 0
        } else if (r > 225 && g > 225 && b > 225) {
          const brightness = (r + g + b) / 3
          d[i + 3] = Math.round(255 * (1 - (brightness - 225) / 30))
        }
      }

      // Find bounding box of non-transparent pixels
      let minX = w, minY = h, maxX = 0, maxY = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const alpha = d[(y * w + x) * 4 + 3]
          if (alpha > 10) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }

      // If nothing visible, return original
      if (maxX <= minX || maxY <= minY) {
        cache.set(src, src)
        resolve(src)
        return
      }

      // Add small padding
      const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02)
      minX = Math.max(0, minX - pad)
      minY = Math.max(0, minY - pad)
      maxX = Math.min(w - 1, maxX + pad)
      maxY = Math.min(h - 1, maxY + pad)

      const cropW = maxX - minX + 1
      const cropH = maxY - minY + 1

      // Put processed data back then crop
      ctx.putImageData(imageData, 0, 0)
      const cropped = ctx.getImageData(minX, minY, cropW, cropH)

      const out = document.createElement('canvas')
      out.width = cropW
      out.height = cropH
      const outCtx = out.getContext('2d')!
      outCtx.putImageData(cropped, 0, 0)

      const result = out.toDataURL('image/png')
      cache.set(src, result)
      resolve(result)
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}
