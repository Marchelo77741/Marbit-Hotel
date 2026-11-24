import { useMemo, useState } from 'react'
import { balance, findDoubleBookings } from '../lib/availability'
import { formatShort, nightsBetween } from '../lib/dates'
import { folioLabel, money, roomNames } from '../lib/messages'
import { useData } from '../store'
import ClientRemindersButton from './ClientRemindersButton'
import type { Nav } from '../nav'

type Filter = 'activas' | 'pendiente' | 'confirmada' | 'cobrar' | 'cancelada' | 'todas'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'activas', label: 'Activas' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'confirmada', label: 'Confirmadas' },
  { id: 'cobrar', label: 'Por cobrar' },
  { id: 'cancelada', label: 'Canceladas' },
  { id: 'todas', label: 'Todas' },
]

export default function Reservations({ nav }: { nav: Nav }) {
  const { reservations, rooms } = useData()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('activas')
  const doubles = useMemo(() => findDoubleBookings(reservations), [reservations])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return reservations
      .filter((r) => {
        if (filter === 'activas' && r.status === 'cancelada') return false
        if (filter === 'pendiente' && r.status !== 'pendiente') return false
        if (filter === 'confirmada' && r.status !== 'confirmada') return false
        if (filter === 'cancelada' && r.status !== 'cancelada') return false
        if (filter === 'cobrar' && !(r.status !== 'cancelada' && balance(r) > 0)) return false
        if (!needle) return true
        return (
          r.guest.toLowerCase().includes(needle) ||
          r.phone.replace(/\D/g, '').includes(needle.replace(/\D/g, '') || '\u0000') ||
          folioLabel(r.folio).toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.folio - b.folio)
  }, [reservations, q, filter])

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <h2>Reservaciones</h2>
          <div className="row">
            <ClientRemindersButton nav={nav} />
            <button className="btn" onClick={() => nav.exportPdf()}>PDF para el equipo</button>
            <button className="btn primary" onClick={() => nav.newReservation()}>＋ Nueva</button>
          </div>
        </div>
        <input className="search" type="search" placeholder="Buscar por nombre, teléfono o folio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'filter active' : 'filter'} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="muted">No hay reservaciones con este filtro.</p>
        ) : (
          <ul className="list">
            {rows.map((r) => {
              const bal = balance(r)
              return (
                <li key={r.id}>
                  <button className="list-item" onClick={() => nav.openReservation(r.id)}>
                    <span className="grow">
                      <strong>{r.guest || 'Sin nombre'}</strong>
                      <small>
                        {formatShort(r.checkIn)} → {formatShort(r.checkOut)} · {nightsBetween(r.checkIn, r.checkOut)} noche(s) · {roomNames(r, rooms)}
                      </small>
                      <small>{folioLabel(r.folio)}</small>
                    </span>
                    <span className="right">
                      <span className={r.status === 'confirmada' ? 'badge ok' : r.status === 'cancelada' ? 'badge off' : 'badge wait'}>{r.status}</span>
                      {r.status !== 'cancelada' && <small className={bal > 0 ? 'owe' : 'paid'}>{bal > 0 ? `Resta ${money(bal)}` : 'Liquidada'}</small>}
                      {doubles.has(r.id) && <small className="owe">⚠ empalme</small>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
