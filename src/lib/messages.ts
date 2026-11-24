import type { Payment, Reservation, Room, Settings } from '../types'
import { balance, paidAmount } from './availability'
import { formatDateTime, formatLong, nightsBetween } from './dates'

export const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n)

export const folioLabel = (n: number) => `RES-${String(n).padStart(4, '0')}`
export const receiptLabel = (n: number) => `R-${String(n).padStart(4, '0')}`

export function roomNames(r: Reservation, rooms: Room[]): string {
  if (r.rooms.length === 0) return 'Por asignar'
  const names = r.rooms.map((a) => rooms.find((x) => x.id === a.roomId)?.name ?? '?')
  return (names.length === 1 ? 'Habitación ' : 'Habitaciones ') + names.join(', ')
}

/** Deja solo dígitos y antepone 52 a números mexicanos de 10 dígitos. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  if (digits.length === 12 && digits.startsWith('52')) return digits
  if (digits.length === 13 && digits.startsWith('521')) return `52${digits.slice(3)}`
  return digits
}

export function whatsappLink(phone: string, text: string): string {
  const num = whatsappNumber(phone)
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

/** "Llegada: sáb 5 de dic (hora estimada 15:00)"; si no hay hora estimada, la hora general de entrada de la posada. */
export function arrivalPhrase(r: Reservation, s: Settings): string {
  if (r.arrivalTime) return `hora estimada de llegada: ${r.arrivalTime}`
  return s.checkInTime ? `desde las ${s.checkInTime}` : ''
}

export function confirmationText(r: Reservation, rooms: Room[], s: Settings): string {
  const nights = nightsBetween(r.checkIn, r.checkOut)
  const lines = [
    `*${s.businessName}*`,
    r.status === 'confirmada' ? '✅ *Confirmación de reservación*' : '📝 *Reservación (pendiente de confirmar)*',
    `Folio: ${folioLabel(r.folio)}`,
    '',
    `Huésped: ${r.guest}`,
    `Personas: ${r.guests}`,
    `Llegada: ${formatLong(r.checkIn)}${arrivalPhrase(r, s) ? ` (${arrivalPhrase(r, s)})` : ''}`,
    `Salida: ${formatLong(r.checkOut)}${s.checkOutTime ? ` (hasta las ${s.checkOutTime})` : ''}`,
    `Noches: ${nights}`,
    `${roomNames(r, rooms)}`,
    '',
    `Total: ${money(r.total)}`,
    `Anticipo recibido: ${money(paidAmount(r))}`,
    `Saldo por pagar: ${money(Math.max(0, balance(r)))}`,
  ]
  if (s.address) lines.push('', `📍 ${s.address}`)
  if (s.policyNote) lines.push('', s.policyNote)
  return lines.join('\n')
}

export function receiptText(r: Reservation, p: Payment, rooms: Room[], s: Settings): string {
  const paidUntil = r.payments.filter((x) => x.date <= p.date).reduce((sum, x) => sum + x.amount, 0)
  const lines = [
    `*${s.businessName}*`,
    `🧾 *Recibo ${receiptLabel(p.receiptNo)}*`,
    `Fecha: ${formatDateTime(p.date)}`,
    '',
    `Recibimos de: ${r.guest}`,
    `Concepto: ${p.note || 'Pago'} · reservación ${folioLabel(r.folio)}`,
    `Monto: *${money(p.amount)}* (${p.method})`,
    '',
    `Estancia: ${formatLong(r.checkIn)} al ${formatLong(r.checkOut)}`,
    `${roomNames(r, rooms)}`,
    `Total de la reserva: ${money(r.total)}`,
    `Pagado a la fecha: ${money(paidUntil)}`,
    `Saldo: ${money(Math.max(0, r.total - paidUntil))}`,
  ]
  if (s.policyNote) lines.push('', s.policyNote)
  return lines.join('\n')
}
