import type { ClothingItem } from '../types'
import { uploadStatePhoto } from './storage'

/**
 * Патч для смены основного фото вещи с учётом состояний.
 *
 * Если у вещи есть состояния, `imageUrl` обязан оставаться копией картинки основного
 * состояния (`defaultStateId`) — иначе прямая запись только в `imageUrl` (PhotoEditor,
 * FixPhotos) рассинхронит их, и следующая операция состояний откатит правку фото.
 * Плюс картинку пережимаем под лимит документа Firestore (≤512, `uploadStatePhoto`),
 * т.к. при нескольких инлайн-состояниях полноразмерное фото туда не влезет.
 *
 * У вещи без состояний — обычная замена `imageUrl` (без пережатия, прежнее поведение).
 */
export async function imageUpdatePatch(
  item: ClothingItem,
  url: string,
): Promise<Partial<ClothingItem>> {
  if (!item.states?.length || !item.defaultStateId) return { imageUrl: url }
  // Пережимаем только инлайн data-url (большие байты внутри документа). Внешний URL
  // (прямая ссылка/OG-картинка из PhotoEditor) храним как есть: он лёгкий, а fetch к
  // нему упал бы по CORS и молча потерял бы правку фото.
  const image = url.startsWith('data:')
    ? await uploadStatePhoto(await fetch(url).then((r) => r.blob()))
    : url
  const states = item.states.map((s) =>
    s.id === item.defaultStateId ? { ...s, imageUrl: image } : s,
  )
  return { imageUrl: image, states }
}
