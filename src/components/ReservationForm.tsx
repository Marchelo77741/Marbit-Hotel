import { useEffect, useMemo, useState } from 'react'
import {
  computeAvailability,
  nightlyDefault,
  reservationTotal,
  suggestRooms,
} from '../lib/availability'
import { addDays, isValidISO, nightsBetween, todayISO } from '../lib/dates'
import { money } from '../lib/messages'
import { ConflictError, saveReservation, useData } from '../store'
import { parseAmount } from '../lib/util'
import type { Nav, Prefill } from '../nav'
import type { PayMethod, Status } from '../types'

interface Props {
  editId?: string
  prefill?: Prefill
  nav: Nav
}

export default function ReservationForm({ editId, prefill, nav }: Props) {
  const { rooms, reservations, settings, quotes } = useData()
  const existing = editId ? reservations.find((r) => r.id === editId) : undefined
  const today = todayISO()

  const quote = prefill?.quoteId ? quotes.find((q) => q.id === prefill.quoteId) : undefined
  const fromQuote = Boolean(quote && prefill?.total !== undefined)
  const [guest, setGuest] = useState(existing?.guest ?? prefill?.guest ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? prefill?.phone ?? '')
  const [guests, setGuests] = useState(String(existing?.guests ?? prefill?.guests ?? 1))
  const [checkIn, setCheckIn] = useState(existing?.checkIn ?? prefill?.checkIn ?? today)
  const [arrivalTime, setArrivalTime] = useState(existing?.arrivalTime ?? '')
  const [checkOut, setCheckOut] = useState(existing?.checkOut ?? prefill?.checkOut ?? addDays(today, 1))
  const [status, setStatus] = useState<Status>(existing?.status ?? 'pendiente')
  const [notes, setNotes] = useState(existing?.notes ?? prefill?.notes ?? '')
  const [rates, setRates] = useState<Record<string, string>>(
    existing
      ? Object.fromEntries(existing.rooms.map((a) => [a.roomId, String(a.nightlyRate)]))
      : (() => {
          const room = prefill?.roomId ? rooms.find((r) => r.id === prefill.roomId) : undefined
          return room ? { [room.id]: String(nightlyDefault(room, settings.rateSencilla, settings.rateDoble)) } : {}
        })(),
  )
  const [touched, setTouched] = useState(Boolean(existing) || Boolean(prefill?.roomId))
  const [totalOverride, setTotalOverride] = useState<string | null>(existing ? String(existing.total) : fromQuote ? String(prefill!.total) : null)
  const [advance, setAdvance] = useState('')
  const [method, setMethod] = useState<PayMethod>('efectivo')
  const [error, setError] = useState('')

  const nights = nightsBetween(checkIn, checkOut)
  const datesOk = isValidISO(checkIn) && isValidISO(checkOut) && nights >= 1
  const people = Math.max(1, parseInt(guests, 10) || 1)

  const availability = useMemo(
    () => (datesOk ? computeAvailability(rooms, reservations, checkIn, checkOut, editId) : []),
    [rooms, reservations, checkIn, checkOut, editId, datesOk],
  )
  const freeRooms = availability.filter((a) => a.free).map((a) => a.room)
  const selectedIds = Object.keys(rates)

  // Sugerencia automática mientras el usuario no haya tocado la selección a mano
  useEffect(() => {
    if (touched || !datesOk) return
    const suggested = suggestRooms(freeRooms, people)
    setRates(
      Object.fromEntries(suggested.map((r) => [r.id, String(nightlyDefault(r, settings.rateSencilla, settings.rateDoble))])),
    )
    if (!fromQuote) setTotalOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, datesOk, people, checkIn, checkOut, rooms, reservations])

  const assignments = selectedIds.map((roomId) => ({ roomId, nightlyRate: parseAmount(rates[roomId] ?? '0') }))
  const computedTotal = datesOk ? reservationTotal(assignments, checkIn, checkOut) : 0
  const total = totalOverride !== null ? parseAmount(totalOverride) : computedTotal
  const capacity = selectedIds.reduce((s, id) => s + (rooms.find((r) => r.id === id)?.capacity ?? 0), 0)
  const advanceNum = parseAmount(advance)

  function toggleRoom(id: string) {
    setTouched(true)
    if (!fromQuote) setTotalOverride(null)
    setRates((prev) => {
      const next = { ...prev }
      if (id in next) delete next[id]
      else {
        const room = rooms.find((r) => r.id === id)!
        next[id] = String(nightlyDefault(room, settings.rateSencilla, settings.rateDoble))
      }
      return next
    })
  }

  function resuggest() {
    setTouched(false)
  }

  function onCheckIn(v: string) {
    setCheckIn(v)
    if (isValidISO(v) && nightsBetween(v, checkOut) < 1) setCheckOut(addDays(v, 1))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!guest.trim()) return setError('Escribe el nombre del huésped.')
    if (!datesOk) return setError('Revisa las fechas: la salida debe ser después de la llegada.')
    if (selectedIds.length === 0 && !confirm('No elegiste habitación. ¿Guardar como "por asignar"?')) return
    if (advanceNum > total) return setError('El anticipo no puede ser mayor al total.')
    try {
      const saved = saveReservation(
        {
          id: existing?.id,
          guest: guest.trim(),
          phone: phone.trim(),
          guests: people,
          checkIn,
          checkOut,
          arrivalTime,
          rooms: assignments,
          total,
          status,
          notes: notes.trim(),
          quoteId: existing?.quoteId ?? quote?.id,
        },
        existing ? undefined : { amount: advanceNum, method },
      )
      nav.openReservation(saved.id)
      nav.go('reservas')
      if (!existing) nav.showDoc({ type: 'confirmation', reservationId: saved.id })
    } catch (err) {
      setError(err instanceof ConflictError ? err.message : 'No se pudo guardar la reservación.')
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <section className="card">
        <h2>{existing ? `Editar reservación` : 'Nueva reservación'}</h2>
        {quote && !existing && (
          <div className="banner info">
            Desde la cotización <strong>{quote.folio}</strong>: el total ({money(prefill?.total ?? 0)}) incluye los servicios cotizados. Elige las habitaciones libres y registra el anticipo.
          </div>
        )}
        <div className="grid2">
          <label className="field">
            <span>Huésped</span>
            <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Nombre completo" autoComplete="off" />
          </label>
          <label className="field">
            <span>Teléfono / WhatsApp</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="55 1234 5678" />
          </label>
          <label className="field">
            <span>Llegada</span>
            <input type="date" value={checkIn} onChange={(e) => onCheckIn(e.target.value)} />
          </label>
          <label className="field">
            <span>Hora de llegada (aprox., opcional)</span>
            <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Salida</span>
            <input type="date" value={checkOut} min={isValidISO(checkIn) ? addDays(checkIn, 1) : undefined} onChange={(e) => setCheckOut(e.target.value)} />
          </label>
          <label className="field">
            <span>Personas</span>
            <input type="number" min={1} max={30} value={guests} onChange={(e) => setGuests(e.target.value)} />
          </label>
          <div className="field">
            <span>Noches</span>
            <div className="summary"><strong>{datesOk ? nights : '—'}</strong></div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row between wrap">
          <h2>Habitaciones</h2>
          <button type="button" className="btn small" onClick={resuggest}>Sugerir de nuevo</button>
        </div>
        {!datesOk ? (
          <p className="muted">Elige fechas válidas para ver la disponibilidad.</p>
        ) : (
          <>
            <p className="muted">
              {freeRooms.length === 0
                ? 'No hay habitaciones libres en ese periodo.'
                : `${freeRooms.length} libres para ${nights} noche${nights === 1 ? '' : 's'}. Sugerencia para ${people} persona${people === 1 ? '' : 's'} marcada; puedes cambiarla.`}
            </p>
            <div className="chips">
              {availability.map((a) => {
                const on = a.room.id in rates
                const cls = a.free || on ? (on ? 'room-chip pick' : 'room-chip free') : 'room-chip busy'
                return (
                  <button
                    type="button"
                    key={a.room.id}
                    className={cls}
                    disabled={!a.free && !on}
                    onClick={() => toggleRoom(a.room.id)}
                    aria-pressed={on}
                  >
                    <b>{a.room.name}</b>
                    <span>{a.room.type === 'doble' ? 'doble' : 'sencilla'} · {a.room.capacity}p</span>
                    <em>{a.free ? (on ? 'elegida' : 'libre') : `ocupada: ${a.blockedBy[0].guest.split(' ')[0]}`}</em>
                  </button>
                )
              })}
            </div>
            {selectedIds.length > 0 && capacity < people && (
              <div className="banner warn">La capacidad elegida ({capacity}) es menor a las {people} personas. Agrega otra habitación o ajusta.</div>
            )}
            {selectedIds.length > 0 && freeRooms.length > 0 && selectedIds.length > 0 && capacity >= people + 2 && (
              <div className="banner info">Sobran {capacity - people} lugares en las habitaciones elegidas.</div>
            )}
            {freeRooms.length > 0 && suggestRooms(freeRooms, people).length === 0 && (
              <div className="banner warn">Con las habitaciones libres no alcanza para {people} personas en todo el periodo. Prueba con otras fechas o divide la estancia en dos reservaciones.</div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Precio y anticipo</h2>
        {selectedIds.length > 0 && (
          <div className="rates">
            {selectedIds.map((id) => {
              const room = rooms.find((r) => r.id === id)!
              return (
                <label className="field" key={id}>
                  <span>Hab. {room.name} · por noche</span>
                  <input
                    inputMode="decimal"
                    value={rates[id]}
                    onChange={(e) => {
                      if (!fromQuote) setTotalOverride(null)
                      setRates((p) => ({ ...p, [id]: e.target.value }))
                    }}
                  />
                </label>
              )
            })}
          </div>
        )}
        <div className="grid2">
          <label className="field">
            <span>Total de la reserva {totalOverride !== null && <button type="button" className="link" onClick={() => setTotalOverride(null)}>(recalcular)</button>}</span>
            <input inputMode="decimal" value={totalOverride ?? String(computedTotal)} onChange={(e) => setTotalOverride(e.target.value)} />
          </label>
          <label className="field">
            <span>Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="pendiente">Pendiente de confirmar</option>
              <option value="confirmada">Confirmada</option>
              {existing && <option value="cancelada">Cancelada</option>}
            </select>
          </label>
          {!existing && (
            <>
              <label className="field">
                <span>Anticipo recibido</span>
                <input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
              </label>
              <label className="field">
                <span>Forma de pago</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </label>
            </>
          )}
        </div>
        <div className="totals">
          <span>Total <strong>{money(total)}</strong></span>
          {!existing && <span>Anticipo <strong>{money(advanceNum)}</strong></span>}
          {!existing && <span>Resta <strong>{money(Math.max(0, total - advanceNum))}</strong></span>}
        </div>
        <label className="field">
          <span>Notas</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. viene de Suecia, llega tarde, grupo de 3 habitaciones…" />
        </label>
      </section>

      {error && <div className="banner danger" role="alert">{error}</div>}
      <div className="row">
        <button className="btn primary" type="submit">{existing ? 'Guardar cambios' : 'Guardar y generar confirmación'}</button>
        <button className="btn" type="button" onClick={() => nav.go('reservas')}>Cancelar</button>
      </div>
    </form>
  )
}
