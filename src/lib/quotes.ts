import type { CatalogItem, Quote, QuoteLine, Settings } from '../types'
import { formatLong, formatShort, isValidISO, nightsBetween, todayISO, weekdayShort } from './dates'
import { money } from './messages'

export const quoteMoney = (n: number) => `${money(n)} MXN`

export const shortWithYear = (iso: string) => (iso ? `${formatShort(iso)} ${iso.slice(0, 4)}` : '')
export const dayWithYear = (iso: string) => (iso ? `${weekdayShort(iso)} ${shortWithYear(iso)}` : '')

export function defaultCatalog(): CatalogItem[] {
  return [
    { id: 'hab1', type: 'Hospedaje', name: 'Renta de Habitación Sencilla', desc: 'Hospedaje por noche (Capacidad para 1 persona)', price: 850, cap: 1 },
    { id: 'hab2', type: 'Hospedaje', name: 'Renta de Habitación Doble', desc: 'Hospedaje por noche (Capacidad para 2 personas por habitación)', price: 1100, cap: 2 },
    { id: 'desa', type: 'Alimento', name: 'Desayuno a Elegir', desc: 'Incluye café y jugo por persona', price: 169.9, cap: 0 },
  ]
}

export const DEFAULT_QUOTE_NOTES =
  'Precios expresados en Pesos Mexicanos (MXN).\nCotización sujeta a disponibilidad al momento de confirmar la reserva.\nPara garantizar las fechas de su estancia, favor de comunicarse al {tel}.'

// ---------- número a letras ----------
const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function centenas(x: number): string {
  if (x === 100) return 'CIEN'
  const c = Math.floor(x / 100)
  const r = x % 100
  let s = C[c]
  if (r) s += (s ? ' ' : '') + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : ''))
  return s
}

export function numLetras(n: number): string {
  const cents = Math.round((Number(n) || 0) * 100)
  const e = Math.floor(cents / 100)
  const c = cents % 100
  let s = ''
  if (e === 0) s = 'CERO'
  else {
    const mill = Math.floor(e / 1e6)
    const mil = Math.floor((e % 1e6) / 1000)
    const r = e % 1000
    if (mill) s += mill === 1 ? 'UN MILLÓN' : centenas(mill) + ' MILLONES'
    if (mil) s += (s ? ' ' : '') + (mil === 1 ? 'MIL' : centenas(mil) + ' MIL')
    if (r) s += (s ? ' ' : '') + centenas(r)
    if (e % 1e6 === 0) s += ' DE'
  }
  return `${s} ${e === 1 ? 'PESO' : 'PESOS'} ${String(c).padStart(2, '0')}/100 M.N.`
}

// ---------- folios ----------
export function previewQuoteFolio(s: Settings, year = new Date().getFullYear()): { folio: string; patch: Partial<Settings> } {
  const reset = s.quoteAnnual && s.quoteYear !== year
  const n = reset ? 1 : Math.max(1, Math.floor(s.nextQuote) || 1)
  const prefix = s.quotePrefix.trim() || 'COT'
  const folio = s.quoteAnnual ? `${prefix}-${year}-${String(n).padStart(3, '0')}` : `${prefix}-${String(n).padStart(4, '0')}`
  return { folio, patch: { nextQuote: n + 1, quoteYear: year } }
}

// ---------- cálculos ----------
export function newQuote(settings: Settings, catalog: CatalogItem[], base: Partial<Quote> = {}): Quote {
  const guests = base.guests ?? 2
  const hab = catalog.find((c) => c.type === 'Hospedaje' && c.cap >= 2) ?? catalog.find((c) => c.type === 'Hospedaje')
  const lines: QuoteLine[] = hab ? [lineFrom(hab, suggestedQty(hab, guests), true)] : []
  return {
    id: crypto.randomUUID(),
    folio: '',
    date: todayISO(),
    client: '',
    phone: '',
    email: '',
    guests,
    arrival: '',
    departure: '',
    nights: 1,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    roomsText: '',
    note: '',
    lines,
    status: 'abierta',
    createdAt: new Date().toISOString(),
    ...base,
  }
}

export function lineFrom(it: CatalogItem, qty = 1, auto = false): QuoteLine {
  return { id: crypto.randomUUID(), catId: it.id, type: it.type, name: it.name, desc: it.desc, price: Number(it.price), qty, auto }
}

/** Reajusta las cantidades automáticas (habitaciones y alimentos) al cambiar el número de huéspedes. */
export function applyGuests(lines: QuoteLine[], catalog: CatalogItem[], guests: number): QuoteLine[] {
  return lines.map((l) => {
    if (!l.auto) return l
    const it = catalog.find((c) => c.id === l.catId)
    if (!it) return l
    return { ...l, qty: suggestedQty(it, guests) }
  })
}

/** Cantidad sugerida al agregar un concepto del catálogo. */
export function suggestedQty(it: CatalogItem, guests: number): number {
  if (it.type === 'Alimento') return Math.max(1, guests)
  if (it.type === 'Hospedaje' && it.cap) return Math.max(1, Math.ceil(Math.max(1, guests) / it.cap))
  return 1
}

export function quoteNights(q: Pick<Quote, 'arrival' | 'departure' | 'nights'>): number {
  if (isValidISO(q.arrival) && isValidISO(q.departure)) {
    const n = nightsBetween(q.arrival, q.departure)
    if (n > 0) return n
  }
  return Math.max(1, Math.floor(q.nights) || 1)
}

export function quoteTotals(q: Quote) {
  const t = { Hospedaje: 0, Servicio: 0, Alimento: 0, night: 0, stay: 0 }
  for (const l of q.lines) t[l.type] += l.price * l.qty
  t.night = t.Hospedaje + t.Servicio + t.Alimento
  t.stay = Math.round(t.night * quoteNights(q) * 100) / 100
  return t
}

/** Número de habitaciones solicitadas en la cotización (suma de líneas de hospedaje). */
export function roomsRequested(q: Quote): number {
  return q.lines.filter((l) => l.type === 'Hospedaje').reduce((s, l) => s + l.qty, 0)
}

export function quoteRoomsText(q: Quote): string {
  if (q.roomsText) return q.roomsText
  const h = q.lines.filter((l) => l.type === 'Hospedaje' && l.qty > 0)
  if (!h.length) return '—'
  return h
    .map((l) => {
      const nom = l.name.replace(/^Renta de\s+/i, '').replace(/^Habitaci[oó]n\s+/i, '')
      const plural = l.qty === 1 ? '' : /[aeiouáéíóú]$/i.test(nom) ? 's' : 'es'
      return `${l.qty} habitaci${l.qty === 1 ? 'ón' : 'ones'} ${nom.toLowerCase()}${plural}`
    })
    .join(', ')
}

export function quoteExtras(q: Quote): string {
  return q.lines
    .filter((l) => l.type !== 'Hospedaje' && l.qty > 0)
    .map((l) => `${l.qty} x ${l.name}`)
    .join(', ')
}

export function quoteStayText(q: Quote): string {
  if (q.arrival || q.departure) return `${shortWithYear(q.arrival) || '-'} al ${shortWithYear(q.departure) || '-'}`
  const n = quoteNights(q)
  return `${n} noche${n === 1 ? '' : 's'}`
}

export function quoteMessage(q: Quote, s: Settings): { subject: string; text: string } {
  const t = quoteTotals(q)
  const n = quoteNights(q)
  const text =
    `Hola ${q.client}, le compartimos su cotización de hospedaje.\n\n` +
    `Folio: ${q.folio}\nHuéspedes: ${q.guests}\nHabitaciones: ${quoteRoomsText(q)}\nEstancia: ${quoteStayText(q)}\n` +
    `Total por noche: ${quoteMoney(t.night)}\n${n > 1 ? `Total ${n} noches: ${quoteMoney(t.stay)}\n` : ''}` +
    `\nCotización sujeta a disponibilidad. Cualquier duda estamos a sus órdenes.\n${s.businessName} · ${s.phone}`
  return { subject: `Cotización ${q.folio} · ${s.businessName}`, text }
}

export function quoteNoteLines(s: Settings, q: Quote): string[] {
  const lines = s.quoteNotes
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replaceAll('{tel}', s.phone))
  if (q.note.trim()) lines.push(q.note.trim())
  return lines
}

/** Datos para abrir la reservación a partir de una cotización. */
export function quoteToPrefill(q: Quote) {
  const extras = quoteExtras(q)
  return {
    quoteId: q.id,
    guest: q.client,
    phone: q.phone,
    guests: q.guests,
    checkIn: isValidISO(q.arrival) ? q.arrival : undefined,
    checkOut: isValidISO(q.departure) ? q.departure : undefined,
    total: quoteTotals(q).stay,
    notes: [`Cotización ${q.folio}`, extras ? `Incluye: ${extras}` : ''].filter(Boolean).join('. '),
  }
}

export const quoteDateLong = (iso: string) => (iso ? formatLong(iso) : '')
