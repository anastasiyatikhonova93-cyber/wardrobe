import type { IncomingMessage, ServerResponse } from 'http'

interface Res extends ServerResponse {
  status: (code: number) => Res
  json: (data: unknown) => void
}

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Промт для приведения фото вещи к виду «как в онлайн-магазине».
const PROMPT =
  'Очисти это фото предмета одежды: убери всё лишнее (вешалку, руки, посторонние ' +
  'предметы, фон) и помести вещь на однотонный чистый белый фон. Сделай аккуратную ' +
  'студийную цветокоррекцию и ровное освещение, чтобы вещь выглядела презентабельно, ' +
  'как на фото в интернет-магазине. Не меняй фасон, цвет, фактуру и детали самой вещи, ' +
  'ничего не добавляй и не дорисовывай.'

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

    const reqBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
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

function readJsonBody(req: IncomingMessage): Promise<{ image?: unknown } | null> {
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
