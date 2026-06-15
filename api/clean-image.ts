import type { IncomingMessage, ServerResponse } from 'http'

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Общий хвост промта — единые требования к качеству для всех типов вещей.
const COMMON =
  ' If the item is being worn or held by a person, completely remove the person, ' +
  'foot, leg, hand and any visible skin, and render ONLY the empty product. Never let ' +
  'skin tone remain on the item or show through it: any see-through or mesh part must ' +
  'show the item\'s own material/color or the empty inside, never beige skin. ' +
  'Keep the item exactly the same: true natural color, real material and texture, ' +
  'all details, logos and hardware. Do not add, remove, restyle or redraw any part ' +
  'of the item, do not change its proportions. Pure solid white #FFFFFF background, ' +
  'item centered with small even margins, even soft studio lighting, no cast shadows, ' +
  'no reflections, no halo or outline around the edges. Output a sharp, ' +
  'high-resolution e-commerce product photo.'

// Промты по типу вещи (категории из распознавания).
const PROMPTS: Record<string, string> = {
  clothing:
    'Professional e-commerce product photo of this single clothing item. Remove the ' +
    'hanger, clips, hands, wall and all background. Lay the garment straight and ' +
    'symmetric, gently smoothing out wrinkles and creases.' + COMMON,
  shoes:
    'Professional e-commerce product photo of this footwear. Remove the chair, floor, ' +
    'wall, hands and all background. Render the footwear EMPTY — no foot, leg or skin ' +
    'inside or showing through; the inner lining and insole must be the shoe\'s own ' +
    'material and color, not skin tone. Show the shoes cleanly; if it is a pair, keep ' +
    'both neatly arranged together in a natural product angle (a clean three-quarter ' +
    'view).' + COMMON,
  bags:
    'Professional e-commerce product photo of this bag. Remove the hook, hanger, hand, ' +
    'wall and all background. Arrange the bag facing front with its strap laid out ' +
    'neatly and symmetrically. Keep the same straps and handles as in the original — the ' +
    'same number, each one whole and intact as a single continuous piece; do not add an ' +
    'extra handle or strap that is not there, and do not tear, split, duplicate or ' +
    'otherwise modify them.' + COMMON,
  accessory:
    'Professional e-commerce product photo of this accessory (jewelry/belt/etc). ' +
    'Remove any packaging card, price tag, hand, fingers, clothing and all background. ' +
    'Show only the accessory itself, arranged neatly and symmetrically.' + COMMON,
}

function promptForCategory(category: unknown): string {
  if (category === 'shoes') return PROMPTS.shoes
  if (category === 'bags') return PROMPTS.bags
  if (category === 'accessories') return PROMPTS.accessory
  return PROMPTS.clothing
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default async function handler(req: IncomingMessage, res: Res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(501).json({ error: 'GEMINI_API_KEY is not configured' })
  }

  try {
    const body = await readJsonBody(req)
    const image = typeof body?.image === 'string' ? body.image : null
    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' })
    }
    const { mimeType, data } = parseDataUrl(image)
    const prompt = promptForCategory(body?.category)

    const reqBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data } },
          ],
        },
      ],
      generationConfig: { responseModalities: ['IMAGE'] },
    })

    const gemini = await callGeminiWithRetry(reqBody, apiKey)
    if (!gemini.ok) {
      return res.status(502).json({ error: `gemini ${gemini.status}`, detail: gemini.detail.slice(0, 300) })
    }

    const out = extractImage(gemini.json)
    if (!out) {
      return res.status(502).json({ error: 'gemini returned no image' })
    }
    return res.json({ image: `data:${out.mimeType};base64,${out.data}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return res.status(500).json({ error: 'failed to clean image', detail: message })
  }
}

// 429 здесь = квота/биллинг (повтор не поможет), а 503 = временная перегрузка.
async function callGeminiWithRetry(
  reqBody: string,
  apiKey: string,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; detail: string }> {
  let last = { status: 0, detail: '' }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(90000),
      body: reqBody,
    })
    if (res.ok) return { ok: true, json: await res.json() }
    last = { status: res.status, detail: await res.text().catch(() => '') }
    if (res.status === 500 || res.status === 503) {
      await delay(800 * (attempt + 1))
      continue
    }
    break
  }
  return { ok: false, ...last }
}

function parseDataUrl(input: string): { mimeType: string; data: string } {
  const match = input.match(/^data:([^;]+);base64,(.*)$/s)
  if (match) return { mimeType: match[1], data: match[2] }
  return { mimeType: 'image/jpeg', data: input }
}

function extractImage(json: unknown): { mimeType: string; data: string } | null {
  const parts = (json as any)?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data
    if (inline?.data && typeof inline.data === 'string') {
      return { mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png', data: inline.data }
    }
  }
  return null
}

function readJsonBody(req: IncomingMessage): Promise<{ image?: unknown; category?: unknown } | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 8 * 1024 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}
