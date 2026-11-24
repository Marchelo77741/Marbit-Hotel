import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { quoteMessage } from '../lib/quotes'
import { sheetToPdf } from '../lib/sheetPdf'
import { whatsappLink } from '../lib/messages'
import { useData } from '../store'
import { downloadBlob, slug } from '../lib/util'
import type { Quote } from '../types'
import QuoteSheet from './QuoteSheet'

const SHEET_W = 816

export default function QuoteDocModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { settings } = useData()
  const sheetRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [sheetH, setSheetH] = useState(1056)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useLayoutEffect(() => {
    const fit = () => {
      const w = boxRef.current?.clientWidth ?? SHEET_W
      setScale(Math.min(1, w / SHEET_W))
      setSheetH(sheetRef.current?.offsetHeight ?? 1056)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [quote])

  useEffect(() => {
    const h = sheetRef.current?.offsetHeight
    if (h) setSheetH(h)
  })

  const { subject, text } = quoteMessage(quote, settings)
  const fileName = `cotizacion-${quote.folio}-${slug(quote.client || 'cliente')}.pdf`

  async function share() {
    if (!sheetRef.current) return
    setBusy(true)
    setMsg('')
    try {
      const blob = await sheetToPdf(sheetRef.current)
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: subject, text })
      } else {
        downloadBlob(fileName, blob)
        setMsg('PDF descargado. Adjúntalo en WhatsApp o en el correo.')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('No se pudo generar el PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    if (!sheetRef.current) return
    setBusy(true)
    setMsg('')
    try {
      downloadBlob(fileName, await sheetToPdf(sheetRef.current))
    } catch {
      setMsg('No se pudo generar el PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Texto copiado.')
    } catch {
      setMsg('No se pudo copiar.')
    }
  }

  const mail = `mailto:${quote.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`

  return (
    <div className="modal-back doc-back" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row between no-print">
          <h2>Cotización {quote.folio}</h2>
          <button className="btn small" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="qpreview doc-print" ref={boxRef} style={{ height: sheetH * scale }}>
          <div style={{ width: SHEET_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <QuoteSheet ref={sheetRef} quote={quote} settings={settings} folio={quote.folio} />
          </div>
        </div>

        <div className="row wrap no-print">
          <a className="btn primary" href={whatsappLink(quote.phone, text)} target="_blank" rel="noreferrer">Enviar por WhatsApp (texto)</a>
          <button className="btn" onClick={share} disabled={busy}>{busy ? 'Generando…' : 'Compartir PDF'}</button>
          <button className="btn" onClick={download} disabled={busy}>Descargar PDF</button>
        </div>
        <div className="row wrap no-print">
          <a className="btn small" href={mail}>Correo</a>
          <button className="btn small" onClick={() => window.print()}>Imprimir</button>
          <button className="btn small" onClick={copy}>Copiar texto</button>
        </div>
        {!quote.phone && <div className="banner warn no-print">Sin teléfono: WhatsApp abrirá sin destinatario y tú eliges el chat.</div>}
        {msg && <div className="banner info no-print" role="status">{msg}</div>}
      </div>
    </div>
  )
}
