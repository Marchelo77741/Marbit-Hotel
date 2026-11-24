import { describe, expect, it } from 'vitest'
import { normalizeData } from '../store'
import { fingerprint, mergeData } from './merge'
import type { AppData, Reservation } from '../types'

const T = (m: number) => `2026-11-08T10:${String(m).padStart(2, '0')}:00.000Z`

function res(id: string, folio: number, over: Partial<Reservation> = {}): Reservation {
  return {
    id, folio, guest: `Huésped ${id}`, phone: '', guests: 2, checkIn: '2026-12-01', checkOut: '2026-12-03',
    rooms: [{ roomId: 'room-1', nightlyRate: 850 }], total: 1700, status: 'pendiente', notes: '', payments: [],
    createdAt: T(0), updatedAt: T(0), ...over,
  }
}
function data(rs: Reservation[], extra: Partial<AppData> = {}): AppData {
  return { ...normalizeData({}), reservations: rs, ...extra }
}

describe('mergeData', () => {
  it('une reservaciones nuevas de ambos lados', () => {
    const a = data([res('a', 1)])
    const b = data([res('b', 2)])
    const m = mergeData(a, b)
    expect(m.reservations.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(m.settings.nextFolio).toBe(3)
  })

  it('gana la modificación más reciente', () => {
    const a = data([res('x', 1, { guest: 'Viejo', updatedAt: T(1) })])
    const b = data([res('x', 1, { guest: 'Nuevo', updatedAt: T(5) })])
    expect(mergeData(a, b).reservations[0].guest).toBe('Nuevo')
    expect(mergeData(b, a).reservations[0].guest).toBe('Nuevo')
  })

  it('no pierde pagos registrados en dispositivos distintos', () => {
    const p1 = { id: 'p1', receiptNo: 1, amount: 500, method: 'efectivo' as const, date: T(2), note: '' }
    const p2 = { id: 'p2', receiptNo: 1, amount: 300, method: 'tarjeta' as const, date: T(3), note: '' }
    const a = data([res('x', 1, { payments: [p1], updatedAt: T(2) })])
    const b = data([res('x', 1, { payments: [p2], updatedAt: T(3) })])
    const m = mergeData(a, b)
    expect(m.reservations[0].payments.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(m.settings.nextReceipt).toBe(2)
  })

  it('un borrado se propaga y no resucita', () => {
    const a = data([], { tombstones: { x: T(9) } })
    const b = data([res('x', 1, { updatedAt: T(5) })])
    expect(mergeData(a, b).reservations).toHaveLength(0)
    expect(mergeData(b, a).reservations).toHaveLength(0)
  })

  it('una edición posterior al borrado gana', () => {
    const a = data([], { tombstones: { x: T(3) } })
    const b = data([res('x', 1, { updatedAt: T(8) })])
    expect(mergeData(a, b).reservations).toHaveLength(1)
  })

  it('un pago borrado no regresa', () => {
    const p1 = { id: 'p1', receiptNo: 1, amount: 500, method: 'efectivo' as const, date: T(2), note: '' }
    const a = data([res('x', 1, { payments: [], updatedAt: T(6) })], { tombstones: { p1: T(6) } })
    const b = data([res('x', 1, { payments: [p1], updatedAt: T(2) })])
    expect(mergeData(a, b).reservations[0].payments).toHaveLength(0)
  })

  it('los contadores nunca retroceden y los ajustes siguen al más reciente', () => {
    const base = normalizeData({}).settings
    const a = data([], { settings: { ...base, nextFolio: 7, phone: 'A', address: 'Dir A' }, settingsAt: { phone: T(1), address: T(6) } })
    const b = data([], { settings: { ...base, nextFolio: 3, phone: 'B', address: 'Dir B' }, settingsAt: { phone: T(4), address: T(2) } })
    const m = mergeData(a, b)
    expect(m.settings.nextFolio).toBe(7)
    expect(m.settings.phone).toBe('B') // cada ajuste sigue a su cambio más reciente
    expect(m.settings.address).toBe('Dir A')
  })

  it('es simétrico: ambos lados llegan a lo mismo (sin ping-pong)', () => {
    const a = data([res('a', 1), res('c', 3, { guest: 'A', updatedAt: T(4) })])
    const b = data([res('b', 2), res('c', 3, { guest: 'B', updatedAt: T(7) })], { tombstones: { z: T(1) } })
    expect(fingerprint(mergeData(a, b))).toBe(fingerprint(mergeData(b, a)))
    const m = mergeData(a, b)
    expect(fingerprint(mergeData(m, b))).toBe(fingerprint(m))
    expect(fingerprint(mergeData(m, a))).toBe(fingerprint(m))
  })
})
