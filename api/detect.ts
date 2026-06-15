import type { IncomingMessage, ServerResponse } from 'http'

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

// Детекция нескольких вещей на одном фото (зеркальное селфи / фото образа).
// Gemini 2.5 умеет возвращать bounding box'ы по картинке — это бесплатный
// vision-тариф (тот же, что у /api/classify), биллинг не нужен.
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Просим список вещей с рамками. Формат box_2d у Gemini — [ymin, xmin, ymax, xmax],
// нормировка 0..1000 (origin — верхний левый угол). Это документированный формат.
const PROMPT = `На фото человек (часто это зеркальное селфи) или одежда на вешалке.
Найди КАЖДЫЙ отдельный предмет одежды, обувь и аксессуары, которые НАДЕТЫ на
человеке или которые он держит (например: рубашка, джинсы, кроссовки, сумка,
ремень — это пять разных предметов).

ВАЖНО — что выделять и что НЕ выделять:
- Выделяй ТОЛЬКО предметы гардероба на самом человеке.
- НЕ выделяй и НЕ принимай за вещи: само зеркало и его раму/оправу (даже если она
  плетёная или текстурная — это НЕ сумка и НЕ обувь), мебель, декор, предметы
  интерьера, стены, пол, ковры, растения, телефон в руке, части тела, лицо,
  причёску, отражение комнаты и любой фон.
- Если сомневаешься, предмет это гардероба на человеке или элемент обстановки —
  НЕ включай его.

Ответь СТРОГО JSON-массивом, по одному объекту на предмет:
[
  {
    "label": "краткое название на русском, например: Голубые джинсы прямого кроя",
    "category": "одна из: tops, bottoms, dresses, outerwear, knitwear, shoes, bags, accessories",
    "color": "цвет на русском одним-двумя словами",
    "seasons": ["сезоны, для которых вещь подходит, из: spring, summer, autumn, winter; для всесезонных вещей перечисли все четыре"],
    "box_2d": [ymin, xmin, ymax, xmax]
  }
]

box_2d — рамка предмета в нормировке 0..1000 (верхний левый угол — начало координат).
Если предмет частично скрыт — выдели видимую часть. Не дублируй один предмет
несколькими рамками.`

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
    const inline = await resolveInlineImage(body)
    if (!inline) {
      return res.status(400).json({ error: 'image or imageUrl is required' })
    }

    const reqBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: inline.mimeType, data: inline.data } },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    })

    const gemini = await callGeminiWithRetry(reqBody, apiKey)
    if (!gemini.ok) {
      return res.status(502).json({ error: `gemini ${gemini.status}`, detail: gemini.detail.slice(0, 300) })
    }
    const json = gemini.json
    const text = (json as any)?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text)
      .filter(Boolean)
      .join('')
    const items = extractJsonArray(text)
    if (!items) {
      return res.status(502).json({ error: 'gemini returned no json array' })
    }
    return res.json({ items })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return res.status(500).json({ error: 'failed to detect', detail: message })
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Бесплатный тариф Gemini периодически отвечает 503 (перегрузка) — повторяем.
async function callGeminiWithRetry(
  reqBody: string,
  apiKey: string,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; detail: string }> {
  let last = { status: 0, detail: '' }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(30000),
      body: reqBody,
    })
    if (res.ok) return { ok: true, json: await res.json() }
    last = { status: res.status, detail: await res.text().catch(() => '') }
    if (res.status === 429 || res.status === 500 || res.status === 503) {
      await delay(600 * (attempt + 1))
      continue
    }
    break
  }
  return { ok: false, ...last }
}

async function resolveInlineImage(
  body: { image?: unknown; imageUrl?: unknown } | null,
): Promise<{ mimeType: string; data: string } | null> {
  if (body && typeof body.image === 'string' && body.image) {
    return parseDataUrl(body.image)
  }
  if (body && typeof body.imageUrl === 'string' && body.imageUrl) {
    const resp = await fetch(body.imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'image/*',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!resp.ok) return null
    const mimeType = resp.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await resp.arrayBuffer())
    return { mimeType: mimeType.split(';')[0], data: buf.toString('base64') }
  }
  return null
}

function parseDataUrl(input: string): { mimeType: string; data: string } {
  const match = input.match(/^data:([^;]+);base64,(.*)$/s)
  if (match) return { mimeType: match[1], data: match[2] }
  return { mimeType: 'image/jpeg', data: input }
}

function extractJsonArray(text: unknown): unknown[] | null {
  if (typeof text !== 'string') return null
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readJsonBody(req: IncomingMessage): Promise<{ image?: unknown; imageUrl?: unknown } | null> {
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
