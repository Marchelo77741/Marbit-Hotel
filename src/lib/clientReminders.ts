import type { Reservation, Room, Settings } from '../types'
import { balance, isActive } from './availability'
import { formatLong, nightsBetween, todayISO } from './dates'
import { money, roomNames } from './messages'
import { daysUntil } from './reminders'

/** Recordatorios por WhatsApp para los clientes: qué toca enviar hoy y cómo se escribe el mensaje. */

export const CLIENT_KINDS = [7, 3, 1, 0] as const
export type ClientKind = (typeof CLIENT_KINDS)[number]

export const DEFAULT_CLIENT_TEMPLATE = [
  'Hola {nombre}, te recordamos que {cuando} te esperamos en *{negocio}*.',
  'Llegada: {fecha} {hora}.',
  '{habitaciones} · {noches} noche(s).',
  '{saldo}',
  '📍 {direccion}',
  'Cualquier duda, escríbenos al {telefono}.',
].join('\n')

export const TEMPLATE_FIELDS = ['{nombre}', '{cuando}', '{fecha}', '{hora}', '{habitaciones}', '{noches}', '{saldo}', '{negocio}', '{direccion}', '{telefono}']

export function kindLabel(k: number): string {
  return k === 0 ? 'el día de llegada' : k === 1 ? '1 día antes' : `${k} días antes`
}

export function enabledKinds(s: Settings): ClientKind[] {
  const on: Record<ClientKind, boolean> = { 7: s.clientRemind7, 3: s.clientRemind3, 1: s.clientRemind1, 0: s.clientRemind0 }
  return CLIENT_KINDS.filter((k) => on[k])
}

/** El recordatorio que le toca a una reservación hoy: el más cercano a su llegada entre los activados. */
export function currentKind(checkIn: string, today: string, kinds: ClientKind[]): ClientKind | null {
  const d = daysUntil(checkIn, today)
  if (d < 0) return null
  const fit = kinds.filter((k) => k >= d)
  return fit.length ? (Math.min(...fit) as ClientKind) : null
}

export interface ClientReminder {
  r: Reservation
  kind: ClientKind
  /** ISO de cuando se marcó como enviado, si ya se envió */
  sentAt: string | null
}

export function clientReminders(reservations: Reservation[], s: Settings, today = todayISO()): { due: ClientReminder[]; sent: ClientReminder[] } {
  const kinds = enabledKinds(s)
  const due: ClientReminder[] = []
  const sent: ClientReminder[] = []
  for (const r of reservations) {
    if (!isActive(r) || r.status === 'cancelada') continue
    const kind = currentKind(r.checkIn, today, kinds)
    if (kind === null) continue
    const sentAt = r.clientReminders?.[String(kind)] ?? null
    ;(sentAt ? sent : due).push({ r, kind, sentAt })
  }
  const byDate = (a: ClientReminder, b: ClientReminder) => a.r.checkIn.localeCompare(b.r.checkIn) || a.r.folio - b.r.folio
  return { due: due.sort(byDate), sent: sent.sort(byDate) }
}

function whenText(d: number, checkIn: string): string {
  return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d > 1 ? `en ${d} días` : `el ${formatLong(checkIn)}`
}

export function renderTemplate(template: string, r: Reservation, rooms: Room[], s: Settings, today = todayISO()): string {
  const d = daysUntil(r.checkIn, today)
  const hora = r.arrivalTime ? `a las ${r.arrivalTime}` : s.checkInTime ? `desde las ${s.checkInTime}` : ''
  const saldo = balance(r) > 0 ? `Saldo pendiente: ${money(balance(r))}.` : 'Tu reservación está liquidada.'
  const values: Record<string, string> = {
    nombre: r.guest.trim().split(/\s+/)[0] || '',
    cuando: whenText(d, r.checkIn),
    fecha: formatLong(r.checkIn),
    hora,
    habitaciones: roomNames(r, rooms),
    noches: String(nightsBetween(r.checkIn, r.checkOut)),
    saldo,
    negocio: s.businessName,
    direccion: s.address,
    telefono: s.phone,
  }
  const lines: string[] = []
  for (const raw of (template || DEFAULT_CLIENT_TEMPLATE).split('\n')) {
    const names = [...raw.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => k in values)
    // una línea cuyos datos están todos vacíos (p. ej. sin dirección) se omite
    if (names.length > 0 && names.every((k) => !values[k].trim())) continue
    const line = raw
      .replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m))
      .replace(/ {2,}/g, ' ')
      .replace(/ +([.,])/g, '$1')
      .trimEnd()
    if (line.trim() === '' && (lines.length === 0 || lines[lines.length - 1] === '')) continue
    lines.push(line)
  }
  return lines.join('\n').trim()
}

/** Texto de recordatorio para una reservación (el mismo que usa la lista de recordatorios). */
export function reminderText(r: Reservation, rooms: Room[], s: Settings): string {
  return renderTemplate(s.clientTemplate, r, rooms, s)
}
