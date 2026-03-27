import type { IncomingMessage, ServerResponse } from 'http'

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

interface Req extends IncomingMessage {
  query?: Record<string, string | string[]>
}

export default async function handler(req: Req, res: Res) {
  const url = req.query?.url
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url parameter required' })
  }

  try {
    const imageUrl = await extractViaApi(url) ?? await extractDirect(url)
    if (!imageUrl) {
      return res.status(404).json({ error: 'no image found' })
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.json({ imageUrl })
  } catch {
    return res.status(500).json({ error: 'failed to extract image' })
  }
}

async function extractViaApi(url: string): Promise<string | null> {
  const resp = await fetch(
    `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(12000) },
  )
  if (!resp.ok) return null
  const data = await resp.json()
  return data?.data?.image?.url ?? data?.data?.logo?.url ?? null
}

async function extractDirect(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    const html = await resp.text()
    return extractOgImage(html)
  } catch {
    return null
  }
}

function extractOgImage(html: string): string | null {
  const patterns = [
    /< *meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /< *meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}
