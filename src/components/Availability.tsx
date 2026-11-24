import { useMemo, useState } from 'react'
import { computeAvailability, findDoubleBookings, isActive } from '../lib/availability'
import { addDays, dayOfMonth, formatShort, nightsBetween, todayISO, weekdayShort } from '../lib/dates'
import { daysUntil } from '../lib/reminders'
import { roomNames } from '../lib/messages'
import { useData } from '../store'
import ClientRemindersButton from './ClientRemindersButton'
import type { Nav } from '../nav'

const DAYS_SHOWN = 14

export default function Availability({ nav }: { nav: Nav }) {
  const { rooms, reservations } = useData()
  const today = todayISO()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 1))
  const [start, setStart] = useState(today)
  /** modo «elige habitación» y habitación por confirmar */
  const [picking, setPicking] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const nights = nightsBetween(from, to)
  const validRange = nights >= 1
  const availability = useMemo(
    () => (validRange ? computeAvailability(rooms, reservations, from, to) : []),
    [rooms, reservations, from, to, validRange],
  )
  const freeCount = availability.filter((a) => a.free).length
  const doubles = useMemo(() => findDoubleBookings(reservations), [reservations])

  const arrivals = reservations
    .filter((r) => isActive(r) && daysUntil(r.checkIn, today) >= 0 && daysUntil(r.checkIn, today) <= 5)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(start, i))
  const activeRooms = rooms.filter((r) => r.active)

  function cellReservations(roomId: string, day: string) {
    return reservations.filter(
      (r) => isActive(r) && r.rooms.some((x) => x.roomId === roomId) && r.checkIn <= day && day < r.checkOut,
    )
  }

  const confirmRoom = confirmId ? availability.find((a) => a.room.id === confirmId && a.free)?.room : undefined

  function chooseRoom(id: string) {
    setConfirmId(id)
    setPicking(false)
  }

  function reserve() {
    if (!confirmRoom) return
    const roomId = confirmRoom.id
    setConfirmId(null)
    nav.newReservation({ checkIn: from, checkOut: to, roomId })
  }

  function onFromChange(v: string) {
    setConfirmId(null)
    setFrom(v)
    if (v && nightsBetween(v, to) < 1) setTo(addDays(v, 1))
  }

  return (
    <div className="stack">
      {doubles.size > 0 && (
        <div className="banner danger">
          Hay {doubles.size} reservaciones empalmadas en la misma habitación. Revísalas en <button className="link" onClick={() => nav.go('reservas')}>Reservas</button>.
        </div>
      )}

      <section className="card">
        <h2>¿Hay lugar?</h2>
        <div className="row wrap">
          <label className="field">
            <span>Llegada</span>
            <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
          </label>
          <label className="field">
            <span>Salida</span>
            <input type="date" value={to} min={addDays(from, 1)} onChange={(e) => { setConfirmId(null); setTo(e.target.value) }} />
          </label>
          <div className="field grow">
            <span>Resumen</span>
            <div className="summary">
              {validRange ? (
                <>
                  <strong>{nights}</strong> noche{nights === 1 ? '' : 's'} · <strong>{freeCount}</strong> de {availability.length} libres
                </>
              ) : (
                'Elige fechas válidas'
              )}
            </div>
          </div>
        </div>

        {validRange && picking && (
          <div className="banner info" role="status">Toca la habitación en verde que quieres reservar.</div>
        )}
        {validRange && (
          <div className="chips">
            {availability.map((a) =>
              a.free ? (
                <button
                  key={a.room.id}
                  type="button"
                  className={`room-chip free${confirmId === a.room.id ? ' pick' : ''}`}
                  onClick={() => chooseRoom(a.room.id)}
                  aria-label={`Reservar la habitación ${a.room.name}`}
                >
                  <b>{a.room.name}</b>
                  <span>{a.room.type === 'doble' ? 'doble' : 'sencilla'}</span>
                  <em>libre</em>
                </button>
              ) : (
                <div key={a.room.id} className="room-chip busy">
                  <b>{a.room.name}</b>
                  <span>{a.room.type === 'doble' ? 'doble' : 'sencilla'}</span>
                  <em>{a.blockedBy.map((b) => b.guest.split(' ')[0]).join(', ')}</em>
                </div>
              ),
            )}
          </div>
        )}

        {confirmRoom && (
          <div className="banner info" role="alertdialog" aria-label="Confirmar reserva">
            <p>
              ¿Reservar la habitación <strong>{confirmRoom.name}</strong> para el <strong>{formatShort(from)}</strong> al{' '}
              <strong>{formatShort(to)}</strong> ({nights} noche{nights === 1 ? '' : 's'})?
            </p>
            <div className="row wrap">
              <button className="btn primary" onClick={reserve}>Sí, reservar</button>
              <button className="btn" onClick={() => setConfirmId(null)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="row">
          <button className="btn primary" disabled={!validRange || freeCount === 0} onClick={() => { setConfirmId(null); setPicking(true) }}>
            Reservar estas fechas
          </button>
          {picking && <button className="btn" onClick={() => setPicking(false)}>Cancelar</button>}
        </div>
      </section>

      <section className="card">
        <div className="row between wrap">
          <h2>Próximas llegadas</h2>
          <ClientRemindersButton nav={nav} primary />
        </div>
        {arrivals.length === 0 ? (
          <p className="muted">Sin llegadas en los próximos 5 días.</p>
        ) : (
          <ul className="list">
            {arrivals.map((r) => {
              const d = daysUntil(r.checkIn, today)
              return (
                <li key={r.id}>
                  <button className="list-item" onClick={() => nav.openReservation(r.id)}>
                    <span className={d === 0 ? 'pill today' : 'pill'}>{d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}</span>
                    <span className="grow">
                      <strong>{r.guest}</strong>
                      <small>
                        {roomNames(r, rooms)} · {formatShort(r.checkIn)} → {formatShort(r.checkOut)}
                      </small>
                    </span>
                    <span className={r.status === 'confirmada' ? 'badge ok' : 'badge wait'}>{r.status}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="row between wrap">
          <h2>Ocupación</h2>
          <div className="row">
            <button className="btn small" onClick={() => setStart(addDays(start, -7))}>◀ 7 días</button>
            <button className="btn small" onClick={() => setStart(today)}>Hoy</button>
            <button className="btn small" onClick={() => setStart(addDays(start, 7))}>7 días ▶</button>
            <button className="btn small primary" onClick={() => nav.exportPdf()}>PDF para el equipo</button>
          </div>
        </div>
        <div className="legend">
          <span><i className="sw ok" /> confirmada</span>
          <span><i className="sw wait" /> pendiente</span>
          <span><i className="sw clash" /> empalme</span>
          <span className="muted">Toca un día libre para consultar esa noche.</span>
        </div>
        <div className="tape-wrap">
          <table className="tape">
            <thead>
              <tr>
                <th className="sticky">Hab.</th>
                {days.map((d) => (
                  <th key={d} className={d === today ? 'today' : ''}>
                    <small>{weekdayShort(d)}</small>
                    {dayOfMonth(d)}
                    {dayOfMonth(d) === 1 || d === start ? <small>{formatShort(d).split(' ')[1]}</small> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRooms.map((room) => (
                <tr key={room.id}>
                  <th
                    className="sticky"
                    onClick={() => {
                      if (validRange && availability.find((a) => a.room.id === room.id)?.free) chooseRoom(room.id)
                    }}
                    title={`Reservar la habitación ${room.name} en las fechas de arriba`}
                  >
                    {room.name}
                    <small>{room.type === 'doble' ? 'doble' : 'sencilla'}</small>
                  </th>
                  {days.map((d) => {
                    const hits = cellReservations(room.id, d)
                    if (hits.length === 0) {
                      return (
                        <td key={d} className="free-cell" onClick={() => { setFrom(d); setTo(addDays(d, 1)) }} title="Libre" />
                      )
                    }
                    const r = hits[0]
                    const label = r.checkIn === d || d === start ? r.guest.split(' ')[0] : ''
                    const cls = hits.length > 1 ? 'clash' : r.status === 'confirmada' ? 'ok' : 'wait'
                    return (
                      <td key={d} className={`busy-cell ${cls}`} onClick={() => nav.openReservation(r.id)} title={hits.map((h) => h.guest).join(' / ')}>
                        {label}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
