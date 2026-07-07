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
    'symmetric, gently smoothing out wrinkles and creases. ' +
    'If the garment opens at the front (a jacket, blazer, coat, trench, cardigan, ' +
    'shirt or blouse with buttons or a zip), show it fully OPEN and UNBUTTONED / ' +
    'unzipped: the two front panels relaxed apart and symmetric, lapels and collar ' +
    'laid flat, the inner lining partly visible — exactly like an open, unbuttoned ' +
    'jacket worn casually open. Never button, zip, belt or close such a garment. ' +
    'Garments without a front opening (dresses, t-shirts, knit tops, sweaters, ' +
    'trousers, skirts) keep exactly as they are, do not cut or open them.' + COMMON,
  shoes:
    'Professional e-commerce product photo of this footwear. Remove the chair, floor, ' +
    'wall, hands and all background. Render the footwear EMPTY — no foot, leg or skin ' +
    'inside or showing through; the inner lining and insole must be the shoe\'s own ' +
    'material and color, not skin tone. Show the shoes cleanly; if it is a pair, keep ' +
    'both neatly arranged together in a natural product angle (a clean three-quarter ' +
    'view).' + COMMON,
  bags:
    'Professional e-commerce product photo of this bag. Remove the hook, hanger, hand, ' +
    'wall and all background. Show the bag facing front; let its strap hang naturally in ' +
    'a single simple loop as one continuous piece. Keep exactly the same straps and ' +
    'handles as in the original — the same number, each one whole and intact; do NOT lay ' +
    'the strap out separately, coil it or draw it more than once, do NOT add an extra ' +
    'handle or strap that is not there, and do not tear, split or duplicate them.' +
    COMMON,
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

// Промт для мульти-распознавания (когда передан label): предмет снят НА ЧЕЛОВЕКЕ,
// поэтому упор — верность оригиналу, а не «студийная укладка». Общий clothing-промт
// (для массовой загрузки с вешалки) намеренно разглаживает вещь — здесь это как раз
// портит: перерисовывает пуговицы, добавляет складки, отбеливает цвет. Убираем
// «lay straight / smooth wrinkles», добавляем точечные требования верности.
function detectPrompt(label: string, category: unknown): string {
  let extra = ''
  if (category === 'shoes') {
    extra = ' Render the footwear EMPTY — no foot, leg or skin inside or showing through.'
  } else if (category === 'bags') {
    extra =
      ' Arrange the strap(s) and handle(s) neatly — hanging straight and untangled, not' +
      ' twisted, kinked or folded over — but keep the same number, width, material and' +
      ' color; do not add, remove or duplicate any.'
  }
  return (
    `Extract ONLY this one item from the photo: "${label}". Remove the person, skin, hands, ` +
    `legs, any other clothing and objects, and all background.${extra} ` +
    `Reproduce the item EXACTLY as it looks in the photo: the SAME color and shade (do NOT ` +
    `brighten, whiten or shift the color), the SAME number and state of buttons, zippers and ` +
    `fasteners (do NOT unbutton, unzip, close or restyle it), the SAME real drape, folds and ` +
    `length (do NOT iron, smooth, re-drape, add or remove folds or wrinkles), the SAME cut and ` +
    `proportions. Do not add, remove or redraw any detail. Preserve every piece of metal hardware ` +
    `exactly — buckles, rings, studs, buttons, zips, chains, clasps and logos — keeping their real ` +
    `metal color and finish (gold stays gold, silver stays silver); do not simplify, recolor or omit ` +
    `them. Pure solid white #FFFFFF background, ` +
    `item centered with small even margins, even soft studio lighting, no cast shadows, no ` +
    `reflections, no halo or outline. Output a sharp, high-resolution e-commerce product photo.`
  )
}

// Режим «состояния вещи»: на входе уже товарное фото одной вещи, задача — показать ТУ ЖЕ
// вещь в другом виде по свободной команде («застегни», «завяжи концы спереди»). Здесь,
// в отличие от detect/clothing-промтов, изменение вида — цель, а не артефакт; поэтому
// COMMON (который запрещает restyle) не используем, а собираем свой хвост.
function transformPrompt(instruction: string): string {
  return (
    `You are given a product photo of ONE clothing item on a plain background. ` +
    `Show the SAME item but restyle it exactly as instructed: "${instruction}". ` +
    `Apply ONLY the change described by the instruction. Keep it strictly the same ` +
    `garment — the same color and shade, the same print, pattern, fabric, texture, ` +
    `hardware, proportions and size. Do NOT change the color, do NOT turn it into a ` +
    `different item, do NOT add or remove parts beyond what the instruction requires. ` +
    `If a person, hand or skin is visible, remove them and show only the item. ` +
    `Pure solid white #FFFFFF background, item centered with small even margins, even ` +
    `soft studio lighting, no cast shadows, no reflections, no halo or outline around ` +
    `the edges. Output a sharp, high-resolution e-commerce product photo.`
  )
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
    // Необязательная подсказка: какой именно предмет извлечь. Нужна, когда кроп
    // содержит несколько вещей (мульти-распознавание): без неё модель оставляет
    // самый «заметный» предмет, а не нужный. С названием — извлекает именно его.
    const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null
    // Свободная команда-трансформация (фича «состояния вещи»): показать ту же вещь в
    // другом виде. Имеет приоритет над label/категорией.
    const transform =
      typeof body?.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : null
    // С transform — режим состояний; с label (мульти-распознавание, вещь на человеке) —
    // промт верности оригиналу; без обоих (массовая загрузка с вешалки) — «студийный»
    // промт по категории.
    const prompt = transform
      ? transformPrompt(transform)
      : label
        ? detectPrompt(label, body?.category)
        : promptForCategory(body?.category)

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

function readJsonBody(req: IncomingMessage): Promise<{ image?: unknown; category?: unknown; label?: unknown } | null> {
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
