import { useState } from 'react'
import { balance, findDoubleBookings, paidAmount } from '../lib/availability'
import { formatDateTime, formatLong, nightsBetween } from '../lib/dates'
import { folioLabel, money, receiptLabel, roomNames, whatsappLink } from '../lib/messages'
import { reminderText } from '../lib/clientReminders'
import { buildIcs } from '../lib/reminders'
import { ConflictError, addPayment, deleteReservation, removePayment, setStatus, useData } from '../store'
import { download, parseAmount, slug } from '../lib/util'
import type { Nav } from '../nav'
import type { PayMethod } from '../types'

interface Props {
  id: string
  nav: Nav
  onClose: () => void
}

export default function ReservationDetail({ id, nav, onClose }: Props) {
  const { reservations, rooms, settings, quotes } = useData()
  const r = reservations.find((x) => x.id === id)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('efectivo')
  const [note, setNote] = useState('Anticipo')
  const [error, setError] = useState('')

  if (!r) return null
  const bal = balance(r)
  const paid = paidAmount(r)
  const clashes = findDoubleBookings(reservations).get(r.id) ?? []

  function pay(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = parseAmount(amount)
    if (n <= 0) return setError('Escribe un monto mayor a cero.')
    if (n > bal + 0.001 && !confirm(`El pago (${money(n)}) es mayor al saldo (${money(bal)}). ¿Registrarlo de todos modos?`)) return
    const p = addPayment(r!.id, n, method, note.trim() || 'Pago')
    setAmount('')
    setNote('Pago')
    nav.showDoc({ type: 'receipt', reservationId: r!.id, paymentId: p.id })
  }

  function changeStatus(s: 'pendiente' | 'confirmada' | 'cancelada') {
    setError('')
    if (s === 'cancelada' && !confirm('¿Cancelar esta reservación? Las habitaciones quedarán libres.')) return
    try {
      setStatus(r!.id, s)
    } catch (err) {
      setError(err instanceof ConflictError ? err.message : 'No se pudo cambiar el estado.')
    }
  }

  function remove() {
    if (!confirm(`¿Eliminar definitivamente la reservación de ${r!.guest}? Esto borra también sus pagos y no se puede deshacer.`)) return
    deleteReservation(r!.id)
    onClose()
  }

  function downloadIcs() {
    download(`llegada-${slug(r!.guest)}.ics`, buildIcs([r!], rooms, settings), 'text/calendar')
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h2>{r.guest || 'Sin nombre'}</h2>
            <small className="muted">{folioLabel(r.folio)}</small>
          </div>
          <button className="btn small" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {clashes.length > 0 && (
          <div className="banner danger">Empalme de habitación con: {clashes.map((c) => c.guest).join(', ')}. Edita las habitaciones de una de las dos.</div>
        )}

        <dl className="facts">
          <dt>Estado</dt>
          <dd><span className={r.status === 'confirmada' ? 'badge ok' : r.status === 'cancelada' ? 'badge off' : 'badge wait'}>{r.status}</span></dd>
          <dt>Llegada</dt><dd>{formatLong(r.checkIn)}{r.arrivalTime ? ` · hora estimada ${r.arrivalTime}` : ''}</dd>
          <dt>Salida</dt><dd>{formatLong(r.checkOut)} · {nightsBetween(r.checkIn, r.checkOut)} noche(s)</dd>
          <dt>Habitaciones</dt><dd>{roomNames(r, rooms)}</dd>
          <dt>Personas</dt><dd>{r.guests}</dd>
          <dt>Teléfono</dt><dd>{r.phone || '—'}</dd>
          {r.quoteId && quotes.find((q) => q.id === r.quoteId) && (<><dt>Cotización</dt><dd>{quotes.find((q) => q.id === r.quoteId)!.folio}</dd></>)}
          {r.notes && (<><dt>Notas</dt><dd>{r.notes}</dd></>)}
        </dl>

        <div className="totals big">
          <span>Total <strong>{money(r.total)}</strong></span>
          <span>Pagado <strong>{money(paid)}</strong></span>
          <span className={bal > 0 ? 'owe' : 'paid'}>Resta <strong>{money(Math.max(0, bal))}</strong></span>
        </div>

        <div className="row wrap actions">
          {r.status !== 'confirmada' && r.status !== 'cancelada' && <button className="btn primary" onClick={() => changeStatus('confirmada')}>Confirmar</button>}
          {r.status === 'confirmada' && <button className="btn" onClick={() => changeStatus('pendiente')}>Marcar pendiente</button>}
          {r.status === 'cancelada' && <button className="btn" onClick={() => changeStatus('pendiente')}>Reactivar</button>}
          <button className="btn" onClick={() => nav.showDoc({ type: 'confirmation', reservationId: r.id })}>Confirmación / WhatsApp</button>
          <button className="btn" onClick={() => nav.editReservation(r.id)}>Editar</button>
        </div>

        <h3>Pagos y recibos</h3>
        {r.payments.length === 0 ? (
          <p className="muted">Aún no hay pagos registrados.</p>
        ) : (
          <ul className="list">
            {r.payments.map((p) => (
              <li key={p.id} className="pay-row">
                <span className="grow">
                  <strong>{money(p.amount)}</strong> <small>{p.note} · {p.method}</small>
                  <small>{receiptLabel(p.receiptNo)} · {formatDateTime(p.date)}</small>
                </span>
                <button className="btn small" onClick={() => nav.showDoc({ type: 'receipt', reservationId: r.id, paymentId: p.id })}>Recibo</button>
                <button
                  className="btn small ghost"
                  aria-label="Eliminar pago"
                  onClick={() => confirm(`¿Eliminar el pago ${receiptLabel(p.receiptNo)} de ${money(p.amount)}?`) && removePayment(r.id, p.id)}
                >🗑</button>
              </li>
            ))}
          </ul>
        )}

        {r.status !== 'cancelada' && (
          <form className="pay-form" onSubmit={pay}>
            <div className="grid3">
              <label className="field">
                <span>Monto</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={bal > 0 ? String(bal) : '0'} />
              </label>
              <label className="field">
                <span>Forma de pago</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </label>
              <label className="field">
                <span>Concepto</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="row wrap">
              <button className="btn primary" type="submit">Registrar pago y generar recibo</button>
              {bal > 0 && <button type="button" className="btn small" onClick={() => setAmount(String(bal))}>Poner saldo completo</button>}
            </div>
          </form>
        )}

        {error && <div className="banner danger" role="alert">{error}</div>}

        <h3>Recordatorios</h3>
        <div className="row wrap">
          <a className="btn" href={whatsappLink(r.phone, reminderText(r, rooms, settings))} target="_blank" rel="noreferrer">Recordar al huésped por WhatsApp</a>
          <button className="btn" onClick={downloadIcs}>Añadir llegada al calendario (.ics)</button>
        </div>

        <div className="row wrap danger-zone">
          {r.status !== 'cancelada' && <button className="btn ghost" onClick={() => changeStatus('cancelada')}>Cancelar reservación</button>}
          <button className="btn ghost" onClick={remove}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}
