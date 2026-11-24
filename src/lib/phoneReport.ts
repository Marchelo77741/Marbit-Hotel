import type { Reservation, Room, Settings } from '../types'
import { balance, isActive } from './availability'
import { addDays, formatShort, todayISO, weekdayShort } from './dates'
import { money } from './messages'
import { reservationsForPeriod } from './pdf'

/** Datos del reporte «para celular» (hoy y 3 días): lo urgente primero y letra grande. */

export interface PhoneCard {
  id: string
  guest: string
  rooms: string
  guests: number
  time: string
  pending: boolean
  paid: boolean
  /** «PAGADO» o «DEBE $1,500» */
  pay: string
}

export interface PhoneDay {
  date: string
  label: string
  isToday: boolean
  arrivals: PhoneCard[]
  departures: PhoneCard[]
  stays: PhoneCard[]
}

export interface PhoneReport {
  title: string
  range: string
  /** frases cortas de resumen, p. ej. «2 llegan» */
  summary: string[]
  days: PhoneDay[]
}

function card(r: Reservation, rooms: Room[]): PhoneCard {
  const names = r.rooms.map((a) => rooms.find((x) => x.id === a.roomId)?.name ?? '?')
  const b = balance(r)
  return {
    id: r.id,
    guest: r.guest.trim() || 'Sin nombre',
    rooms: names.length ? names.join('·') : 'Por asignar',
    guests: r.guests,
    time: r.arrivalTime || '',
    pending: r.status !== 'confirmada',
    paid: b <= 0,
    pay: b > 0 ? `DEBE ${money(b).replace(/\.00$/, '')}` : 'PAGADO',
  }
}

const byTime = (a: PhoneCard, b: PhoneCard) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.guest.localeCompare(b.guest)

export function buildPhoneReport(
  data: { reservations: Reservation[]; rooms: Room[]; settings: Settings },
  o: { start: string; days: number; includePending: boolean },
  today = todayISO(),
): PhoneReport {
  const { rooms } = data
  const list = reservationsForPeriod(data.reservations, o)
  const days: PhoneDay[] = []
  let arrivals = 0
  let departures = 0
  for (let i = 0; i < o.days; i++) {
    const d = addDays(o.start, i)
    const arr = list.filter((r) => r.checkIn === d).map((r) => card(r, rooms)).sort(byTime)
    const dep = list.filter((r) => r.checkOut === d).map((r) => card(r, rooms)).sort((a, b) => a.guest.localeCompare(b.guest))
    const stay = list.filter((r) => r.checkIn < d && r.checkOut > d).map((r) => card(r, rooms)).sort((a, b) => a.guest.localeCompare(b.guest))
    arrivals += arr.length
    departures += dep.length
    const rel = d === today ? 'HOY' : d === addDays(today, 1) ? 'MAÑANA' : ''
    days.push({ date: d, label: rel ? `${rel} · ${weekdayShort(d)} ${formatShort(d)}` : `${weekdayShort(d).toUpperCase()} ${formatShort(d)}`, isToday: d === today, arrivals: arr, departures: dep, stays: stay })
  }
  const summary = [`${arrivals} ${arrivals === 1 ? 'llega' : 'llegan'}`, `${departures} ${departures === 1 ? 'sale' : 'salen'}`]
  if (o.days === 1) {
    // habitaciones ocupadas esa noche
    const active = rooms.filter((r) => r.active)
    const busy = new Set<string>()
    for (const r of data.reservations) {
      if (!isActive(r) || r.status === 'cancelada') continue
      if (r.checkIn <= o.start && r.checkOut > o.start) for (const a of r.rooms) busy.add(a.roomId)
    }
    const free = active.filter((r) => !busy.has(r.id)).length
    summary.push(`${free} ${free === 1 ? 'habitación libre' : 'habitaciones libres'} esa noche`)
  }
  const end = addDays(o.start, o.days - 1)
  return {
    title: o.days === 1 ? (o.start === today ? 'Reporte de hoy' : 'Reporte del día') : `Reporte de ${o.days} días`,
    range: o.days === 1 ? `${weekdayShort(o.start)} ${formatShort(o.start)}` : `${formatShort(o.start)} al ${formatShort(end)}`,
    summary,
    days,
  }
}
