import { toBlob } from 'html-to-image'
import { useRef, useState } from 'react'
import { balance, paidAmount } from '../lib/availability'
import { formatDateTime, formatLong, nightsBetween } from '../lib/dates'
import {
  confirmationText,
  folioLabel,
  money,
  receiptLabel,
  receiptText,
  roomNames,
  whatsappLink,
} from '../lib/messages'
import { useData } from '../store'
import { downloadBlob, slug } from '../lib/util'
import type { DocRequest } from '../nav'
import { logoDataUrl } from '../lib/brand'

export default function DocModal({ request, onClose }: { request: DocRequest; onClose: () => void }) {
  const { reservations, rooms, settings } = useData()
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const r = reservations.find((x) => x.id === request.reservationId)
  if (!r) return null
  const payment = request.type === 'receipt' ? r.payments.find((p) => p.id === request.paymentId) : undefined
  if (request.type === 'receipt' && !payment) return null

  const isReceipt = request.type === 'receipt' && payment
  const text = isReceipt ? receiptText(r, payment, rooms, settings) : confirmationText(r, rooms, settings)
  const fileName = isReceipt ? `recibo-${receiptLabel(payment.receiptNo)}-${slug(r.guest)}.png` : `confirmacion-${folioLabel(r.folio)}-${slug(r.guest)}.png`

  const paidUntil = isReceipt ? r.payments.filter((x) => x.date <= payment.date).reduce((s, x) => s + x.amount, 0) : paidAmount(r)
  const balanceShown = isReceipt ? r.total - paidUntil : balance(r)

  async function makeImage(): Promise<Blob | null> {
    if (!ref.current) return null
    return toBlob(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
  }

  async function shareImage() {
    setBusy(true)
    setMsg('')
    try {
      const blob = await makeImage()
      if (!blob) throw new Error('sin imagen')
      const file = new File([blob], fileName, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
      } else {
        downloadBlob(fileName, blob)
        setMsg('Imagen descargada. Adjúntala en el chat de WhatsApp.')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('No se pudo generar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadImage() {
    setBusy(true)
    try {
      const blob = await makeImage()
      if (blob) downloadBlob(fileName, blob)
    } finally {
      setBusy(false)
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Texto copiado.')
    } catch {
      setMsg('No se pudo copiar.')
    }
  }

  return (
    <div className="modal-back doc-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row between no-print">
          <h2>{isReceipt ? 'Recibo de pago' : 'Confirmación de reservación'}</h2>
          <button className="btn small" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="doc-print">
          <div className="doc" ref={ref}>
            <div className="doc-head">
              <img className="doc-logo" src={logoDataUrl} alt="" />
              <strong>{settings.businessName}</strong>
              {settings.address && <small>{settings.address}</small>}
              {settings.phone && <small>Tel. {settings.phone}</small>}
            </div>
            <div className="doc-title">
              {isReceipt ? (
                <>
                  <span>RECIBO</span>
                  <b>{receiptLabel(payment.receiptNo)}</b>
                </>
              ) : (
                <>
                  <span>{r.status === 'confirmada' ? 'CONFIRMACIÓN' : 'RESERVACIÓN PENDIENTE'}</span>
                  <b>{folioLabel(r.folio)}</b>
                </>
              )}
            </div>
            <table className="doc-table">
              <tbody>
                {isReceipt && (
                  <tr><td>Fecha</td><td>{formatDateTime(payment.date)}</td></tr>
                )}
                <tr><td>Huésped</td><td>{r.guest}</td></tr>
                {!isReceipt && <tr><td>Personas</td><td>{r.guests}</td></tr>}
                <tr><td>Llegada</td><td>{formatLong(r.checkIn)}{r.arrivalTime ? ` · hora estimada ${r.arrivalTime}` : settings.checkInTime ? ` · desde ${settings.checkInTime}` : ''}</td></tr>
                <tr><td>Salida</td><td>{formatLong(r.checkOut)}{settings.checkOutTime ? ` · hasta ${settings.checkOutTime}` : ''}</td></tr>
                <tr><td>Noches</td><td>{nightsBetween(r.checkIn, r.checkOut)}</td></tr>
                <tr><td>Alojamiento</td><td>{roomNames(r, rooms)}</td></tr>
                {isReceipt && (
                  <>
                    <tr><td>Concepto</td><td>{payment.note || 'Pago'} · reservación {folioLabel(r.folio)}</td></tr>
                    <tr><td>Forma de pago</td><td>{payment.method}</td></tr>
                  </>
                )}
              </tbody>
            </table>
            {isReceipt && (
              <div className="doc-amount">
                <span>Monto recibido</span>
                <b>{money(payment.amount)}</b>
              </div>
            )}
            <table className="doc-table sums">
              <tbody>
                <tr><td>Total de la reserva</td><td>{money(r.total)}</td></tr>
                <tr><td>{isReceipt ? 'Pagado a la fecha' : 'Anticipo recibido'}</td><td>{money(paidUntil)}</td></tr>
                <tr className="strong"><td>Saldo pendiente</td><td>{money(Math.max(0, balanceShown))}</td></tr>
              </tbody>
            </table>
            {settings.policyNote && <p className="doc-note">{settings.policyNote}</p>}
          </div>
        </div>

        <div className="row wrap no-print">
          <a className="btn primary" href={whatsappLink(r.phone, text)} target="_blank" rel="noreferrer">Enviar por WhatsApp (texto)</a>
          <button className="btn" onClick={shareImage} disabled={busy}>{busy ? 'Generando…' : 'Compartir como imagen'}</button>
        </div>
        <div className="row wrap no-print">
          <button className="btn small" onClick={downloadImage} disabled={busy}>Descargar imagen</button>
          <button className="btn small" onClick={() => window.print()}>Imprimir / PDF</button>
          <button className="btn small" onClick={copyText}>Copiar texto</button>
        </div>
        {!r.phone && <div className="banner warn no-print">Esta reservación no tiene teléfono; WhatsApp abrirá sin destinatario y tú eliges el chat.</div>}
        {msg && <div className="banner info no-print">{msg}</div>}
      </div>
    </div>
  )
}
