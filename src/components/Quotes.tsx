import { useMemo, useState } from 'react'
import { computeAvailability, suggestRooms } from '../lib/availability'
import { addDays, isValidISO, todayISO } from '../lib/dates'
import { folioLabel } from '../lib/messages'
import {
  applyGuests,
  lineFrom,
  newQuote,
  previewQuoteFolio,
  quoteMoney,
  quoteNights,
  quoteStayText,
  quoteToPrefill,
  quoteTotals,
  roomsRequested,
  suggestedQty,
} from '../lib/quotes'
import { deleteQuote, saveQuote, setQuoteStatus, useData } from '../store'
import { parseAmount } from '../lib/util'
import type { Nav } from '../nav'
import type { Quote, QuoteStatus } from '../types'
import QuoteDocModal from './QuoteDocModal'

type Filter = QuoteStatus | 'todas'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'abierta', label: 'Abiertas' },
  { id: 'reservada', label: 'Reservadas' },
  { id: 'descartada', label: 'Descartadas' },
  { id: 'todas', label: 'Todas' },
]

export default function Quotes({ nav }: { nav: Nav }) {
  const { quotes, settings, catalog } = useData()
  const [editing, setEditing] = useState<Quote | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [docOf, setDocOf] = useState<Quote | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('abierta')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return quotes
      .filter((x) => filter === 'todas' || x.status === filter)
      .filter((x) => !needle || x.client.toLowerCase().includes(needle) || x.folio.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [quotes, q, filter])

  function start() {
    setEditing(newQuote(settings, catalog))
    setIsNew(true)
  }

  if (editing) {
    return (
      <>
        <QuoteEditor
          key={editing.id}
          initial={editing}
          isNew={isNew}
          nav={nav}
          onClose={() => setEditing(null)}
          onShowDoc={(saved) => setDocOf(saved)}
          onDuplicate={(src) => {
            setEditing(newQuote(settings, catalog, { ...src, id: crypto.randomUUID(), folio: '', status: 'abierta', reservationId: undefined, date: todayISO(), createdAt: new Date().toISOString() }))
            setIsNew(true)
          }}
        />
        {docOf && <QuoteDocModal quote={docOf} onClose={() => setDocOf(null)} />}
      </>
    )
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <h2>Cotizaciones</h2>
          <button className="btn primary" onClick={start}>＋ Nueva cotización</button>
        </div>
        <input className="search" type="search" placeholder="Buscar por cliente o folio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'filter active' : 'filter'} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="muted">No hay cotizaciones con este filtro.</p>
        ) : (
          <ul className="list">
            {rows.map((x) => (
              <li key={x.id}>
                <button className="list-item" onClick={() => { setEditing(x); setIsNew(false) }}>
                  <span className="grow">
                    <strong>{x.client || 'Sin nombre'}</strong>
                    <small>{x.folio} · {quoteStayText(x)} · {x.guests} persona{x.guests === 1 ? '' : 's'}</small>
                  </span>
                  <span className="right">
                    <strong>{quoteMoney(quoteTotals(x).stay)}</strong>
                    <span className={x.status === 'reservada' ? 'badge ok' : x.status === 'descartada' ? 'badge off' : 'badge wait'}>{x.status}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {docOf && <QuoteDocModal quote={docOf} onClose={() => setDocOf(null)} />}
    </div>
  )
}

interface EditorProps {
  initial: Quote
  isNew: boolean
  nav: Nav
  onClose: () => void
  onShowDoc: (q: Quote) => void
  onDuplicate: (q: Quote) => void
}

function QuoteEditor({ initial, isNew, nav, onClose, onShowDoc, onDuplicate }: EditorProps) {
  const { catalog, rooms, reservations, settings, quotes } = useData()
  const [d, setD] = useState<Quote>(initial)
  const [pick, setPick] = useState(catalog[0]?.id ?? '')
  const [error, setError] = useState('')

  const stored = quotes.find((x) => x.id === d.id)
  const status = stored?.status ?? 'abierta'
  const nights = quoteNights(d)
  const totals = quoteTotals(d)
  const datesOk = isValidISO(d.arrival) && isValidISO(d.departure) && d.departure > d.arrival
  const folioShown = stored?.folio || previewQuoteFolio(settings).folio

  const set = (patch: Partial<Quote>) => setD((prev) => ({ ...prev, ...patch }))

  function onArrival(v: string) {
    const patch: Partial<Quote> = { arrival: v }
    if (isValidISO(v) && (!isValidISO(d.departure) || d.departure <= v)) patch.departure = addDays(v, 1)
    set(patch)
  }

  function addLine() {
    const it = catalog.find((c) => c.id === pick)
    if (!it) return
    const existing = d.lines.find((l) => l.catId === it.id)
    if (existing) set({ lines: d.lines.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + 1, auto: false } : l)) })
    else set({ lines: [...d.lines, lineFrom(it, suggestedQty(it, d.guests), true)] })
  }

  const availability = useMemo(
    () => (datesOk ? computeAvailability(rooms, reservations, d.arrival, d.departure) : null),
    [rooms, reservations, d.arrival, d.departure, datesOk],
  )
  const free = availability?.filter((a) => a.free).map((a) => a.room) ?? []
  const needed = roomsRequested(d)
  const fits = availability ? suggestRooms(free, d.guests).length > 0 : true

  function save(): Quote | null {
    setError('')
    if (!d.client.trim()) {
      setError('Escribe el nombre del cliente.')
      return null
    }
    const draft: Quote = { ...d, client: d.client.trim(), nights, date: d.date }
    const saved = saveQuote(draft)
    setD(saved)
    return saved
  }

  function convert() {
    const saved = save()
    if (!saved) return
    nav.newReservation(quoteToPrefill(saved))
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <div>
            <h2>{isNew && !stored ? 'Nueva cotización' : `Cotización ${stored?.folio}`}</h2>
            <small className="muted">Folio: {folioShown}{!stored && ' (se asigna al guardar)'}</small>
          </div>
          <div className="row">
            {stored && <span className={status === 'reservada' ? 'badge ok' : status === 'descartada' ? 'badge off' : 'badge wait'}>{status}</span>}
            <button className="btn small" onClick={onClose}>← Volver</button>
          </div>
        </div>

        <div className="grid2">
          <label className="field">
            <span>Cliente</span>
            <input value={d.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nombre completo" autoComplete="off" />
          </label>
          <label className="field">
            <span>Teléfono / WhatsApp</span>
            <input value={d.phone} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="55 1234 5678" />
          </label>
          <label className="field">
            <span>Correo (opcional)</span>
            <input value={d.email} type="email" onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label className="field">
            <span>Huéspedes</span>
            <input type="number" min={1} max={40} value={d.guests} onChange={(e) => { const g = Math.max(1, Number(e.target.value) || 1); set({ guests: g, lines: applyGuests(d.lines, catalog, g) }) }} />
          </label>
          <label className="field">
            <span>Llegada (opcional)</span>
            <input type="date" value={d.arrival} onChange={(e) => onArrival(e.target.value)} />
          </label>
          <label className="field">
            <span>Salida (opcional)</span>
            <input type="date" value={d.departure} min={isValidISO(d.arrival) ? addDays(d.arrival, 1) : undefined} onChange={(e) => set({ departure: e.target.value })} />
          </label>
          <label className="field">
            <span>Noches {datesOk && '(según fechas)'}</span>
            <input type="number" min={1} max={90} value={nights} disabled={datesOk} onChange={(e) => set({ nights: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <div className="grid2 tight">
            <label className="field">
              <span>Check-in</span>
              <input type="time" value={d.checkInTime} onChange={(e) => set({ checkInTime: e.target.value })} />
            </label>
            <label className="field">
              <span>Check-out</span>
              <input type="time" value={d.checkOutTime} onChange={(e) => set({ checkOutTime: e.target.value })} />
            </label>
          </div>
        </div>
        <label className="field">
          <span>Habitaciones (texto opcional; vacío = se arma con los conceptos)</span>
          <input value={d.roomsText} onChange={(e) => set({ roomsText: e.target.value })} placeholder="Ej. 2 habitaciones dobles" />
        </label>

        {datesOk && availability && (
          <div className={`banner ${free.length === 0 ? 'danger' : !fits || needed > free.length ? 'warn' : 'info'}`}>
            {free.length === 0
              ? 'No hay habitaciones libres en esas fechas.'
              : `Hay ${free.length} habitaciones libres en esas fechas (${free.map((r) => r.name).join(', ')}).`}
            {free.length > 0 && needed > free.length && ` La cotización pide ${needed}.`}
            {free.length > 0 && !fits && ` No alcanzan para ${d.guests} personas.`}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Conceptos</h2>
        {d.lines.length === 0 && <p className="muted">Agrega habitaciones, servicios o alimentos del catálogo.</p>}
        <div className="qlines">
          {d.lines.map((l) => (
            <div className="qline" key={l.id}>
              <div className="grow">
                <strong>{l.name}</strong>
                <small>{l.type}</small>
              </div>
              <label className="field mini">
                <span>Cant.</span>
                <input type="number" min={0} value={l.qty} onChange={(e) => set({ lines: d.lines.map((x) => (x.id === l.id ? { ...x, qty: Math.max(0, Number(e.target.value) || 0), auto: false } : x)) })} />
              </label>
              <label className="field mini wide">
                <span>Precio</span>
                <input inputMode="decimal" value={l.price} onChange={(e) => set({ lines: d.lines.map((x) => (x.id === l.id ? { ...x, price: parseAmount(e.target.value) } : x)) })} />
              </label>
              <button className="btn small ghost" aria-label="Quitar" onClick={() => set({ lines: d.lines.filter((x) => x.id !== l.id) })}>✕</button>
            </div>
          ))}
        </div>
        <div className="row wrap">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Concepto del catálogo" className="grow-select">
            {catalog.length === 0 && <option value="">Catálogo vacío (agrega conceptos en Ajustes)</option>}
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {quoteMoney(c.price)}</option>
            ))}
          </select>
          <button className="btn" onClick={addLine} disabled={!pick}>＋ Agregar</button>
        </div>
        <div className="totals big">
          <span>Por noche <strong>{quoteMoney(totals.night)}</strong></span>
          {nights > 1 && <span>{nights} noches <strong>{quoteMoney(totals.stay)}</strong></span>}
        </div>
        <label className="field">
          <span>Nota para esta cotización (aparece en la hoja)</span>
          <textarea rows={2} value={d.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
      </section>

      {error && <div className="banner danger" role="alert">{error}</div>}
      <div className="row wrap">
        <button className="btn primary" onClick={() => { const s = save(); if (s) onShowDoc(s) }}>Guardar y ver documento</button>
        <button className="btn" onClick={() => { const s = save(); if (s) onClose() }}>Guardar</button>
        {status === 'reservada' && stored?.reservationId ? (
          <button className="btn" onClick={() => { const r = reservations.find((x) => x.id === stored.reservationId); if (r) { nav.go('reservas'); nav.openReservation(r.id) } }}>
            Ver reservación {folioLabel(reservations.find((x) => x.id === stored.reservationId)?.folio ?? 0)}
          </button>
        ) : (
          <button className="btn" onClick={convert} disabled={status === 'descartada'}>Convertir en reservación</button>
        )}
      </div>
      {stored && (
        <div className="row wrap danger-zone">
          <button className="btn small" onClick={() => onDuplicate(stored)}>Duplicar</button>
          {status === 'abierta' && <button className="btn small ghost" onClick={() => { setQuoteStatus(stored.id, 'descartada'); onClose() }}>Descartar</button>}
          {status === 'descartada' && <button className="btn small" onClick={() => setQuoteStatus(stored.id, 'abierta')}>Reabrir</button>}
          <button className="btn small ghost" onClick={() => confirm(`¿Eliminar la cotización ${stored.folio}?`) && (deleteQuote(stored.id), onClose())}>Eliminar</button>
        </div>
      )}
    </div>
  )
}
