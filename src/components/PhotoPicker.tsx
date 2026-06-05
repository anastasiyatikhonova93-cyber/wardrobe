import { useState, useRef } from 'react'
import { Camera, Link, X, Loader2 } from 'lucide-react'
import { uploadPhoto } from '../lib/storage'
import { useAuth } from '../lib/auth'
import { isDirectImageUrl, fetchOgImage } from '../lib/og'

interface Props {
  value: string
  onChange: (url: string) => void
  onImageSelected?: (source: { file?: File; url?: string }) => void
  processing?: boolean
  processingStatus?: string | null
}

export function PhotoPicker({ value, onChange, onImageSelected, processing, processingStatus }: Props) {
  const { user } = useAuth()
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!user) return
    setUploading(true)
    try {
      const url = await uploadPhoto(file, user.uid)
      onChange(url)
      onImageSelected?.({ file, url })
    } catch { /* ignore */ }
    setUploading(false)
  }

  async function handleUrlConfirm() {
    const trimmed = urlDraft.trim()
    if (!trimmed) return

    let finalUrl = trimmed
    if (!isDirectImageUrl(trimmed)) {
      setResolving(true)
      const img = await fetchOgImage(trimmed)
      finalUrl = img ?? trimmed
      setResolving(false)
    }
    onChange(finalUrl)
    onImageSelected?.({ url: finalUrl })
    setShowUrlInput(false)
    setUrlDraft('')
  }

  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">Фото</label>
      {value ? (
        <Preview src={value} processing={processing} status={processingStatus} onClear={() => onChange('')} />
      ) : resolving ? (
        <div className="w-full aspect-[4/3] rounded-xl bg-zinc-50 border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-2">
          <Loader2 size={24} className="text-zinc-300 animate-spin" />
          <span className="text-xs text-zinc-400">Ищу фото на странице...</span>
        </div>
      ) : showUrlInput ? (
        <UrlInput
          value={urlDraft}
          onChange={setUrlDraft}
          onConfirm={handleUrlConfirm}
          onCancel={() => { setShowUrlInput(false); setUrlDraft('') }}
        />
      ) : (
        <DropZone
          uploading={uploading}
          fileRef={fileRef}
          onFile={handleFile}
          onShowUrl={() => setShowUrlInput(true)}
        />
      )}
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

function Preview({ src, processing, status, onClear }: {
  src: string; processing?: boolean; status?: string | null; onClear: () => void
}) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className="w-full aspect-[4/3] rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center">
        <p className="text-xs text-red-400">Не удалось загрузить</p>
        <button onClick={onClear} className="ml-2 text-xs text-zinc-500 underline">Убрать</button>
      </div>
    )
  }
  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-100">
      <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
      {!processing && (
        <button
          onClick={onClear}
          className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 backdrop-blur"
        >
          <X size={14} />
        </button>
      )}
      {processing && (
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-white">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-xs">{status ?? 'Обрабатываю…'}</span>
        </div>
      )}
    </div>
  )
}

function UrlInput({ value, onChange, onConfirm, onCancel }: {
  value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">Вставьте ссылку на фото или страницу товара</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
          placeholder="https://..."
          autoFocus
          className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-50 text-sm border border-zinc-100"
        />
        <button onClick={onConfirm} className="px-3 py-2 rounded-xl bg-black text-white text-xs">OK</button>
        <button onClick={onCancel} className="px-2 py-2 rounded-xl bg-zinc-100 text-zinc-500 text-xs">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function DropZone({ uploading, fileRef, onFile, onShowUrl }: {
  uploading: boolean
  fileRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void
  onShowUrl: () => void
}) {
  return (
    <div
      className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-3 bg-zinc-50/50 cursor-pointer transition-colors hover:border-zinc-300"
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f?.type.startsWith('image/')) onFile(f)
      }}
    >
      {uploading ? (
        <Loader2 size={24} className="text-zinc-300 animate-spin" />
      ) : (
        <>
          <Camera size={24} className="text-zinc-300" />
          <span className="text-xs text-zinc-400">Нажмите или перетащите фото</span>
          <button
            onClick={(e) => { e.stopPropagation(); onShowUrl() }}
            className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
          >
            <Link size={10} />
            Вставить ссылку
          </button>
        </>
      )}
    </div>
  )
}
