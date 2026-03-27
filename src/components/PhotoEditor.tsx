import { useState, useRef, useEffect } from 'react'
import { Camera, Link, Loader2 } from 'lucide-react'
import { uploadPhoto } from '../lib/storage'
import { useAuth } from '../lib/auth'
import { isDirectImageUrl, fetchOgImage } from '../lib/og'

interface Props {
  itemId: string
  currentUrl?: string
  shopUrl?: string
  onUpdateImage: (id: string, imageUrl: string) => void
  onClose: () => void
}

export function PhotoEditor({ itemId, currentUrl, shopUrl, onUpdateImage, onClose }: Props) {
  const { user } = useAuth()
  const [urlDraft, setUrlDraft] = useState(currentUrl ?? '')
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const displayUrl = resolvedUrl ?? urlDraft.trim()
  const isDirect = isDirectImageUrl(displayUrl)

  useEffect(() => {
    if (shopUrl && !currentUrl) {
      resolveUrl(shopUrl)
    }
  }, [])

  async function resolveUrl(url: string) {
    const trimmed = url.trim()
    if (!trimmed) return
    if (isDirectImageUrl(trimmed)) {
      setResolvedUrl(null)
      return
    }
    setResolving(true)
    setResolvedUrl(null)
    const img = await fetchOgImage(trimmed)
    setResolvedUrl(img)
    setResolving(false)
  }

  function handleUrlChange(v: string) {
    setUrlDraft(v)
    setResolvedUrl(null)
  }

  async function handleUrlBlur() {
    const trimmed = urlDraft.trim()
    if (trimmed && !isDirectImageUrl(trimmed)) {
      await resolveUrl(trimmed)
    }
  }

  async function handleFile(file: File) {
    if (!user) return
    setUploading(true)
    try {
      const url = await uploadPhoto(file, user.uid)
      onUpdateImage(itemId, url)
      onClose()
    } catch { /* ignore */ }
    setUploading(false)
  }

  function handleSave() {
    const finalUrl = resolvedUrl ?? urlDraft.trim()
    if (finalUrl) {
      onUpdateImage(itemId, finalUrl)
      onClose()
    }
  }

  function handleUseShopUrl() {
    if (!shopUrl) return
    setUrlDraft(shopUrl)
    resolveUrl(shopUrl)
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full py-3 rounded-xl bg-zinc-100 text-sm font-medium flex items-center justify-center gap-2 active:bg-zinc-200 transition-colors"
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        {uploading ? 'Загружаю...' : 'Загрузить фото'}
      </button>

      <div>
        <div className="flex items-center gap-1 mb-1">
          <Link size={12} className="text-zinc-400" />
          <label className="text-xs text-zinc-400">Или вставьте ссылку на товар или фото</label>
        </div>
        <input
          value={urlDraft}
          onChange={(e) => handleUrlChange(e.target.value)}
          onBlur={handleUrlBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlBlur()}
          placeholder="https://..."
          className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
        />
        {shopUrl && (
          <button
            onClick={handleUseShopUrl}
            className="mt-2 text-[11px] text-zinc-500 underline underline-offset-2"
          >
            Загрузить фото из ссылки магазина
          </button>
        )}
      </div>

      {resolving && (
        <div className="flex items-center justify-center gap-2 py-3 text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs">Ищу фото на странице...</span>
        </div>
      )}

      {!resolving && displayUrl && (
        <ImgPreview url={displayUrl} isDirect={isDirect} />
      )}

      <button
        onClick={handleSave}
        disabled={!displayUrl || resolving}
        className="w-full py-3 rounded-full bg-black text-white text-sm font-medium disabled:opacity-30 transition-opacity"
      >
        Сохранить
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function ImgPreview({ url, isDirect }: { url: string; isDirect: boolean }) {
  const [ok, setOk] = useState(true)

  if (!ok) {
    return (
      <p className="text-xs text-red-400 text-center">
        {isDirect ? 'Не удалось загрузить изображение' : 'Не удалось найти фото на этой странице'}
      </p>
    )
  }

  return (
    <img
      src={url}
      alt=""
      className="w-full aspect-[4/3] rounded-xl object-cover bg-zinc-100"
      onError={() => setOk(false)}
    />
  )
}
