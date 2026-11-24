import { useRef, useState } from 'react'
import { deletePhoto, photoUrl, uploadPhoto } from '../../lib/publicSite'

export interface PhotoItem {
  photo: string
  alt?: string
}

/** Lista de fotos con subir, quitar y mover. Las fotos subidas viven en el servidor; los enlaces https se respetan tal cual. */
export function PhotoList({ items, onChange, withAlt = false, max = 12 }: { items: PhotoItem[]; onChange: (items: PhotoItem[]) => void; withAlt?: boolean; max?: number }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setMsg('')
    let next = items
    try {
      for (const f of Array.from(files)) {
        if (next.length >= max) {
          setMsg(`Máximo ${max} fotos.`)
          break
        }
        const id = await uploadPhoto(f)
        next = [...next, withAlt ? { photo: id, alt: '' } : { photo: id }]
        onChange(next)
      }
    } catch (e) {
      setMsg((e as Error).message || 'No se pudo subir la foto.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  function remove(i: number) {
    if (!confirm('¿Quitar esta foto?')) return
    const gone = items[i].photo
    onChange(items.filter((_, j) => j !== i))
    if (!/^https?:\/\//.test(gone)) void deletePhoto(gone)
  }

  function move(i: number, to: number) {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    ;[next[i], next[to]] = [next[to], next[i]]
    onChange(next)
  }

  return (
    <div className="photo-list">
      <div className="photo-grid">
        {items.map((it, i) => (
          <div className="photo-item" key={`${it.photo}-${i}`}>
            <img src={photoUrl(it.photo)} alt={it.alt || `Foto ${i + 1}`} loading="lazy" />
            {i === 0 && <span className="photo-main">principal</span>}
            <div className="photo-actions">
              <button type="button" className="btn small" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Mover antes">◀</button>
              <button type="button" className="btn small" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Mover después">▶</button>
              <button type="button" className="btn small danger" onClick={() => remove(i)} aria-label="Quitar foto">✕</button>
            </div>
            {withAlt && (
              <input
                className="photo-alt"
                aria-label="Descripción de la foto"
                placeholder="Descripción"
                value={it.alt ?? ''}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
              />
            )}
          </div>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
      <button type="button" className="btn small" disabled={busy || items.length >= max} onClick={() => input.current?.click()}>
        {busy ? 'Subiendo…' : '＋ Agregar fotos'}
      </button>
      {msg && <div className="banner warn" role="status">{msg}</div>}
    </div>
  )
}
