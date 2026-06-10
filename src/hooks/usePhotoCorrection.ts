import { useState } from 'react'
import { cleanupPhoto } from '../lib/photo-cleanup'
import { uploadPhoto } from '../lib/storage'

export function usePhotoCorrection(uid: string | undefined) {
  const [correcting, setCorrecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function correct(imageUrl: string): Promise<string | null> {
    if (!uid) return null
    setCorrecting(true)
    setError(null)
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const processed = await cleanupPhoto(blob)
      const dataUrl = await uploadPhoto(processed, uid)
      return dataUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать фото')
      return null
    } finally {
      setCorrecting(false)
    }
  }

  return { correcting, error, correct }
}
