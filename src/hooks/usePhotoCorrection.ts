import { useState } from 'react'
import { removeBackground } from '../lib/background-removal'
import { uploadPhoto } from '../lib/storage'

export function usePhotoCorrection(uid: string | undefined) {
  const [correcting, setCorrecting] = useState(false)

  async function correct(imageUrl: string): Promise<string | null> {
    if (!uid) return null
    setCorrecting(true)
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const processed = await removeBackground(blob)
      const dataUrl = await uploadPhoto(processed, uid)
      return dataUrl
    } catch {
      return null
    } finally {
      setCorrecting(false)
    }
  }

  return { correcting, correct }
}
