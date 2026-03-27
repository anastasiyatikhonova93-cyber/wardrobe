const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i

export function isDirectImageUrl(url: string): boolean {
  return IMAGE_EXTENSIONS.test(url)
}

export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(`/api/og-image?url=${encodeURIComponent(pageUrl)}`)
    if (!resp.ok) return null
    const data = await resp.json()
    return data.imageUrl ?? null
  } catch {
    return null
  }
}
