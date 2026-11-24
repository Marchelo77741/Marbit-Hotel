import type { Reservation, Room } from '../types'
import { nightsBetween, overlaps } from './dates'

export interface RoomAvailability {
  room: Room
  free: boolean
  /** reservaciones activas que ocupan la habitación en el periodo */
  blockedBy: Reservation[]
}

export function isActive(r: Reservation): boolean {
  return r.status !== 'cancelada'
}

/** Reservaciones activas que ocupan una habitación en el periodo [checkIn, checkOut). */
export function conflictsForRoom(
  roomId: string,
  checkIn: string,
  checkOut: string,
  reservations: Reservation[],
  excludeId?: string,
): Reservation[] {
  return reservations.filter(
    (r) =>
      isActive(r) &&
      r.id !== excludeId &&
      r.rooms.some((x) => x.roomId === roomId) &&
      overlaps(r.checkIn, r.checkOut, checkIn, checkOut),
  )
}

export function computeAvailability(
  rooms: Room[],
  reservations: Reservation[],
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): RoomAvailability[] {
  return rooms
    .filter((r) => r.active)
    .map((room) => {
      const blockedBy = conflictsForRoom(room.id, checkIn, checkOut, reservations, excludeId)
      return { room, free: blockedBy.length === 0, blockedBy }
    })
}

/** Empalmes existentes (mismo cuarto, fechas cruzadas) dentro de una lista de reservaciones. */
export function findDoubleBookings(reservations: Reservation[]): Map<string, Reservation[]> {
  const result = new Map<string, Reservation[]>()
  const active = reservations.filter(isActive)
  for (const a of active) {
    for (const b of active) {
      if (a.id >= b.id) continue
      if (!overlaps(a.checkIn, a.checkOut, b.checkIn, b.checkOut)) continue
      const shared = a.rooms.some((x) => b.rooms.some((y) => y.roomId === x.roomId))
      if (!shared) continue
      result.set(a.id, [...(result.get(a.id) ?? []), b])
      result.set(b.id, [...(result.get(b.id) ?? []), a])
    }
  }
  return result
}

function roomNumber(room: Room): number {
  const n = parseInt(room.name.replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

/**
 * Sugiere en qué habitaciones ubicar a `guests` personas entre las libres.
 * Prioridad: menos habitaciones, menos lugares sobrantes, habitaciones contiguas, números bajos.
 * Devuelve [] si la capacidad libre no alcanza.
 */
export function suggestRooms(freeRooms: Room[], guests: number): Room[] {
  const people = Math.max(1, Math.floor(guests))
  const candidates = [...freeRooms].sort((a, b) => roomNumber(a) - roomNumber(b))
  const n = Math.min(candidates.length, 14)
  let best: { rooms: Room[]; score: number[] } | null = null

  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }

  for (let mask = 1; mask < 1 << n; mask++) {
    const picked: Room[] = []
    let cap = 0
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        picked.push(candidates[i])
        cap += candidates[i].capacity
      }
    }
    if (cap < people || picked.length > 6) continue
    // cada habitación debe aportar: quitar la de menor capacidad no debe seguir alcanzando
    const minCap = Math.min(...picked.map((r) => r.capacity))
    if (picked.length > 1 && cap - minCap >= people) continue
    const nums = picked.map(roomNumber)
    const gaps = Math.max(...nums) - Math.min(...nums) + 1 - picked.length
    const score = [picked.length, cap - people, gaps, nums.reduce((s, x) => s + x, 0)]
    if (!best || compare(score, best.score) < 0) best = { rooms: picked, score }
  }
  return best ? best.rooms : []
}

export function nightlyDefault(room: Room, rateSencilla: number, rateDoble: number): number {
  return room.type === 'doble' ? rateDoble : rateSencilla
}

export function reservationTotal(
  rooms: { nightlyRate: number }[],
  checkIn: string,
  checkOut: string,
): number {
  const nights = Math.max(0, nightsBetween(checkIn, checkOut))
  return rooms.reduce((sum, r) => sum + r.nightlyRate, 0) * nights
}

export function paidAmount(r: Reservation): number {
  return r.payments.reduce((s, p) => s + p.amount, 0)
}

export function balance(r: Reservation): number {
  return r.total - paidAmount(r)
}
