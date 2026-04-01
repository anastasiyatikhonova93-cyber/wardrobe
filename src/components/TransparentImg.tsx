import { useState, useEffect } from 'react'
import { makeTransparent } from '../lib/transparent-image'

interface Props {
  src: string
  alt?: string
  className?: string
  draggable?: boolean
}

export function TransparentImg({ src, alt, className, draggable }: Props) {
  const [url, setUrl] = useState(src)

  useEffect(() => {
    let cancelled = false
    makeTransparent(src).then((result) => {
      if (!cancelled) setUrl(result)
    })
    return () => { cancelled = true }
  }, [src])

  return <img src={url} alt={alt ?? ''} className={className} draggable={draggable} />
}
