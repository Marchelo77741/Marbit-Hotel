import { describe, expect, it } from 'vitest'
import type { Reservation } from '../types'
import { buildPhoneReport } from './phoneReport'
import { defaultRooms, defaultSettings } from '../store'

const rooms = defaultRooms()
function res(id: string, guest: string, ci: string, co: string, nums: number[], total = 1000, paid = 0, time?: string): Reservation {
  return {
    id, folio: Number(id), guest, phone: '', guests: 2, checkIn: ci, checkOut: co, status: 'confirmada', notes: '',
    payments: paid ? [{ id: 'p' + id, amount: paid, date: ci, method: 'efectivo' } as never] : [], total, createdAt: '', arrivalTime: time,
    rooms: nums.map((n) => ({ roomId: `room-${n}`, nightlyRate: 500 })),
  }
}

describe('phoneReport', () => {
  it('ordena llegadas por hora y marca PAGADO / DEBE', () => {
    const data = [res('1', 'Tarde', '2026-11-13', '2026-11-15', [2], 1000, 0, '18:00'), res('2', 'Temprano', '2026-11-13', '2026-11-14', [3], 1000, 1000, '09:00'), res('3', 'Sale', '2026-11-10', '2026-11-13', [4])]
    const r = buildPhoneReport({ reservations: data, rooms, settings: defaultSettings }, { start: '2026-11-13', days: 1, includePending: true }, '2026-11-13')
    const d = r.days[0]
    expect(d.label.startsWith('HOY')).toBe(true)
    expect(d.arrivals.map((c) => c.guest)).toEqual(['Temprano', 'Tarde'])
    expect(d.arrivals[0].pay).toBe('PAGADO')
    expect(d.arrivals[1].pay).toBe('DEBE $1,000')
    expect(d.departures.map((c) => c.guest)).toEqual(['Sale'])
    expect(r.summary[0]).toBe('2 llegan')
  })
})
