import { describe, expect, it } from 'vitest'
import type { Reservation } from '../types'
import { buildSchedulePdf, compressNumbers, reservationsForPeriod } from './pdf'
import { defaultRooms, defaultSettings } from '../store'

const rooms = defaultRooms()
function res(id: string, guest: string, ci: string, co: string, nums: number[], status: Reservation['status'] = 'confirmada'): Reservation {
  return {
    id, folio: Number(id), guest, phone: '5512345678', guests: 1, checkIn: ci, checkOut: co, status, notes: '', payments: [], total: 1000, createdAt: '',
    rooms: nums.map((n) => ({ roomId: `room-${n}`, nightlyRate: 500 })),
  }
}
const data = [
  { ...res('1', 'Martín Vargas', '2026-11-07', '2026-11-09', [2]), arrivalTime: '15:30' },
  res('2', 'consuelo', '2026-11-12', '2026-11-16', [7, 8, 9]),
  res('3', 'Pendiente Uno', '2026-11-20', '2026-11-22', [4], 'pendiente'),
  res('4', 'Cancelada', '2026-11-10', '2026-11-12', [1], 'cancelada'),
  res('5', 'Fuera de rango', '2027-02-01', '2027-02-03', [1]),
]

describe('pdf', () => {
  it('filtra por periodo, estado y pendientes', () => {
    const o = { start: '2026-11-07', days: 30, includePending: true }
    expect(reservationsForPeriod(data, o).map((r) => r.guest)).toEqual(['Martín Vargas', 'consuelo', 'Pendiente Uno'])
    expect(reservationsForPeriod(data, { ...o, includePending: false }).map((r) => r.guest)).toEqual(['Martín Vargas', 'consuelo'])
  })
  it('quien sale el primer día del periodo aparece; quien salió antes, no', () => {
    expect(reservationsForPeriod(data, { start: '2026-11-09', days: 5, includePending: true }).map((r) => r.guest)).toEqual(['Martín Vargas', 'consuelo'])
    expect(reservationsForPeriod(data, { start: '2026-11-10', days: 5, includePending: true }).map((r) => r.guest)).toEqual(['consuelo'])
  })
  it('comprime números de habitación', () => {
    expect(compressNumbers([9, 7, 8])).toBe('7-9')
    expect(compressNumbers([3, 5, 6])).toBe('3,5-6')
  })
  it('genera un PDF válido con calendario y lista', async () => {
    const r = buildSchedulePdf({ reservations: data, rooms, settings: defaultSettings }, { start: '2026-11-07', days: 30, includePending: true, includeAmounts: false })
    expect(r.count).toBe(3)
    expect(r.fileName).toBe('reservaciones-2026-11-07-a-2026-12-06.pdf')
    const bytes = new Uint8Array(await r.blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(3000)
  })
  it('funciona con periodo vacío', () => {
    const r = buildSchedulePdf({ reservations: [], rooms, settings: defaultSettings }, { start: '2026-11-07', days: 30, includePending: true, includeAmounts: true })
    expect(r.count).toBe(0)
  })
})

describe('pdf periodos cortos', () => {
  for (const days of [1, 3, 7, 15]) {
    it(`genera ${days} día(s)`, async () => {
      const r = buildSchedulePdf({ reservations: data, rooms, settings: defaultSettings }, { start: '2026-11-08', days, includePending: true, includeAmounts: false })
      const bytes = new Uint8Array(await r.blob.arrayBuffer())
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
      expect(r.fileName).toBe(days === 1 ? 'reservaciones-dia-2026-11-08.pdf' : `reservaciones-2026-11-08-a-${['', '', '', '2026-11-10', '', '', '', '2026-11-14'][days] || '2026-11-22'}.pdf`)
    })
  }
})
