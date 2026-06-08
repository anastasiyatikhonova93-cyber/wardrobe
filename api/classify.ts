import type { IncomingMessage, ServerResponse } from 'http'

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const PROMPT = `Определи предмет одежды на фото. Ответь строго JSON по схеме:
{
  "name": "краткое название на русском, например: Бежевый льняной блейзер",
  "category": "одна из: tops, bottoms, dresses, outerwear, knitwear, shoes, bags, accessories",
  "color": "цвет на русском одним-двумя словами",
  "seasons": ["подходящие сезоны из: spring, summer, autumn, winter"]
}`

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
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
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
    const parsed = extractJson(text)
    if (!parsed) {
      return res.status(502).json({ error: 'gemini returned no json' })
    }
    return res.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return res.status(500).json({ error: 'failed to classify', detail: message })
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
    // Картинку забираем на сервере — CORS браузера тут не мешает.
    // UA нужен, иначе часть сайтов (например Wikimedia) отвечает 403.
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

function extractJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
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
