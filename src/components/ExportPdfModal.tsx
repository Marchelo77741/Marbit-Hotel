import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, formatShort, todayISO } from '../lib/dates'
import { buildSchedulePdf, reservationsForPeriod } from '../lib/pdf'
import { useData } from '../store'
import { downloadBlob } from '../lib/util'
import { buildPhoneReport } from '../lib/phoneReport'
import { sheetToPhonePdf, sheetToPng } from '../lib/sheetPdf'
import PhoneSheet, { PHONE_W } from './PhoneSheet'
import { formatDateTime } from '../lib/dates'

const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: 'Hoy' },
  { days: 3, label: '3 días' },
  { days: 7, label: '7 días' },
  { days: 15, label: '15 días' },
  { days: 30, label: '30 días' },
]

export default function ExportPdfModal({ onClose }: { onClose: () => void }) {
  const { reservations, rooms, settings } = useData()
  const [start, setStart] = useState(todayISO())
  const [days, setDays] = useState(3)
  const [format, setFormat] = useState<'celular' | 'hoja'>('celular')
  const [generated] = useState(() => formatDateTime(new Date().toISOString()))
  const sheetRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [sheetH, setSheetH] = useState(800)
  const [includePending, setIncludePending] = useState(true)
  const [includeAmounts, setIncludeAmounts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const count = useMemo(
    () => reservationsForPeriod(reservations, { start, days, includePending }).length,
    [reservations, start, days, includePending],
  )
  const endInclusive = addDays(start, days - 1)
  const opts = { start, days, includePending, includeAmounts }

  const phone = days <= 3 && format === 'celular'
  const report = useMemo(
    () => buildPhoneReport({ reservations, rooms, settings }, { start, days, includePending }),
    [reservations, rooms, settings, start, days, includePending],
  )
  useLayoutEffect(() => {
    if (!phone) return
    const fit = () => {
      const w = boxRef.current?.clientWidth ?? PHONE_W
      setScale(Math.min(1, w / PHONE_W))
      setSheetH(sheetRef.current?.offsetHeight ?? 800)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [phone, report])
  const baseName = `reporte-${days === 1 ? 'hoy' : `${days}-dias`}-${start}`

  const isToday = start === todayISO()
  const title = days === 1 ? (isToday ? 'Reservaciones de hoy' : 'Reservaciones del día') : 'Calendario de reservaciones'
  const span = days === 1 ? formatShort(start) : `${formatShort(start)} al ${formatShort(endInclusive)}`
  const summary = `${title} de ${settings.businessName}: ${span} (${count} ${count === 1 ? 'reservación' : 'reservaciones'}).`
  const emails = settings.teamEmails.split(/[,;\s]+/).filter(Boolean).join(',')

  async function shareImage() {
    if (!sheetRef.current) return
    setBusy(true); setMsg('')
    try {
      const blob = await sheetToPng(sheetRef.current)
      const file = new File([blob], `${baseName}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: summary })
      } else {
        downloadBlob(`${baseName}.png`, blob)
        setMsg('Imagen descargada. Adjúntala en WhatsApp con el botón de abajo.')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('No se pudo generar la imagen.')
    } finally { setBusy(false) }
  }
  async function downloadImage() {
    if (!sheetRef.current) return
    setBusy(true); setMsg('')
    try { downloadBlob(`${baseName}.png`, await sheetToPng(sheetRef.current)); setMsg('Imagen descargada.') }
    catch { setMsg('No se pudo generar la imagen.') }
    finally { setBusy(false) }
  }
  async function downloadPhonePdf() {
    if (!sheetRef.current) return
    setBusy(true); setMsg('')
    try { downloadBlob(`${baseName}.pdf`, await sheetToPhonePdf(sheetRef.current)); setMsg('PDF descargado.') }
    catch { setMsg('No se pudo generar el PDF.') }
    finally { setBusy(false) }
  }

  function make() {
    return buildSchedulePdf({ reservations, rooms, settings }, opts)
  }

  async function share() {
    setBusy(true)
    setMsg('')
    try {
      const { blob, fileName } = make()
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: summary })
      } else {
        downloadBlob(fileName, blob)
        setMsg('Este dispositivo no permite compartir archivos desde el navegador. El PDF se descargó: adjúntalo en WhatsApp o en el correo con los botones de abajo.')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('No se pudo generar el PDF.')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    setMsg('')
    try {
      const { blob, fileName } = make()
      downloadBlob(fileName, blob)
      setMsg('PDF descargado. Adjúntalo en el chat o en el correo.')
    } catch {
      setMsg('No se pudo generar el PDF.')
    }
  }

  const waNumber = settings.teamWhatsapp.replace(/\D/g, '')
  const waHref = `${waNumber ? `https://wa.me/${waNumber.length === 10 ? '52' + waNumber : waNumber}` : 'https://wa.me/'}?text=${encodeURIComponent(summary + '\n(Te comparto el archivo adjunto)')}`
  const mailHref = `mailto:${emails}?subject=${encodeURIComponent(`${title} ${span}`)}&body=${encodeURIComponent(summary + '\n\nAdjunto el PDF con el calendario y el detalle de las reservaciones.')}`

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>PDF para el equipo</h2>
          <button className="btn small" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <p className="muted">{phone ? 'Una sola pantalla angosta con letra grande: quién llega (con hora), quién sale y si ya pagó o cuánto debe. Se comparte como imagen para verla directo en WhatsApp, sin hacer zoom.' : 'Un solo archivo con dos hojas: el calendario (o el movimiento del día en periodos cortos) con los nombres de los huéspedes, y la lista con hora de llegada, si ya pagó o cuánto debe y demás detalles.'}</p>

        <div className="field">
          <span>Periodo</span>
          <div className="row wrap" role="group" aria-label="Periodo del reporte">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={`btn small${days === p.days ? ' primary' : ''}`}
                aria-pressed={days === p.days}
                onClick={() => {
                  setDays(p.days)
                  if (p.days <= 3) setFormat('celular')
                  if (p.days === 1) setStart(todayISO())
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {days <= 3 && (
          <div className="field">
            <span>Formato</span>
            <div className="row wrap" role="group" aria-label="Formato del reporte">
              <button type="button" className={`btn small${format === 'celular' ? ' primary' : ''}`} aria-pressed={format === 'celular'} onClick={() => setFormat('celular')}>Para celular (letra grande)</button>
              <button type="button" className={`btn small${format === 'hoja' ? ' primary' : ''}`} aria-pressed={format === 'hoja'} onClick={() => setFormat('hoja')}>Hoja completa (PDF)</button>
            </div>
          </div>
        )}
        <label className="field">
          <span>{days === 1 ? 'Día' : 'Desde'}</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <div className="checks">
          <label className="check"><input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} /> Incluir pendientes de confirmar</label>
          {!phone && <label className="check"><input type="checkbox" checked={includeAmounts} onChange={(e) => setIncludeAmounts(e.target.checked)} /> Incluir también total y pagado</label>}
        </div>
        <div className="banner info">
          {span}: <strong>{count}</strong> {count === 1 ? 'reservación' : 'reservaciones'}.
          {' Cada reservación lleva su hora de llegada y si ya está pagada o cuánto debe.'}{!includeAmounts && ' El total y lo pagado no se incluyen, para compartir solo lo que el equipo necesita.'}
        </div>

        {phone && (
          <div className="ps-preview" ref={boxRef} style={{ height: sheetH * scale }}>
            <div className="ps-preview-inner" style={{ transform: `scale(${scale})`, width: PHONE_W }}>
              <PhoneSheet ref={sheetRef} report={report} businessName={settings.businessName} generated={generated} />
            </div>
          </div>
        )}
        {phone ? (
          <div className="row wrap">
            <button className="btn primary" onClick={shareImage} disabled={busy}>Compartir imagen (WhatsApp)</button>
            <button className="btn" onClick={downloadImage} disabled={busy}>Descargar imagen</button>
            <button className="btn" onClick={downloadPhonePdf} disabled={busy}>Descargar PDF (celular)</button>
          </div>
        ) : (
          <div className="row wrap">
            <button className="btn primary" onClick={share} disabled={busy}>Compartir (WhatsApp, correo…)</button>
            <button className="btn" onClick={download}>Descargar PDF</button>
          </div>
        )}
        <h3>Si Compartir no te muestra WhatsApp o correo</h3>
        <p className="muted">Descarga el PDF y abre el chat o el correo; el navegador no puede adjuntar archivos por su cuenta.</p>
        <div className="row wrap">
          <a className="btn" href={waHref} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
          <a className="btn" href={mailHref}>Abrir correo</a>
        </div>
        {!emails && <p className="muted">Puedes guardar los correos y el WhatsApp del equipo en Ajustes para que se llenen solos.</p>}
        {msg && <div className="banner info" role="status">{msg}</div>}
      </div>
    </div>
  )
}
