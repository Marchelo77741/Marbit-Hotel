import { describe, expect, it } from 'vitest'
import type { Reservation } from '../types'
import { clientReminders, currentKind, renderTemplate, DEFAULT_CLIENT_TEMPLATE } from './clientReminders'
import { defaultRooms, defaultSettings } from '../store'

const rooms = defaultRooms()
const base: Reservation = {
  id: 'a', folio: 1, guest: 'Ana María López', phone: '5512345678', guests: 2, checkIn: '2026-12-10', checkOut: '2026-12-12',
  rooms: [{ roomId: 'room-2', nightlyRate: 1100 }], total: 2200, status: 'confirmada', notes: '', payments: [], createdAt: '',
}
const s = { ...defaultSettings, clientRemind3: true, clientRemind1: true, clientRemind7: false, clientRemind0: false }

describe('recordatorios a clientes', () => {
  it('elige el recordatorio más cercano a la llegada entre los activados', () => {
    const k = [3, 1] as const
    expect(currentKind('2026-12-10', '2026-12-01', [...k])).toBeNull() // faltan 9 días: aún no toca
    expect(currentKind('2026-12-10', '2026-12-07', [...k])).toBe(3)
    expect(currentKind('2026-12-10', '2026-12-08', [...k])).toBe(3) // 2 días: sigue pendiente el de 3
    expect(currentKind('2026-12-10', '2026-12-09', [...k])).toBe(1)
    expect(currentKind('2026-12-10', '2026-12-10', [...k])).toBe(1) // el día de llegada sigue valiendo el de 1
    expect(currentKind('2026-12-10', '2026-12-11', [...k])).toBeNull() // ya pasó
  })
  it('separa por enviar y enviados, y omite canceladas', () => {
    const sent = { ...base, id: 'b', clientReminders: { '3': '2026-12-07T10:00:00Z' } }
    const canc = { ...base, id: 'c', status: 'cancelada' as const }
    const r = clientReminders([base, sent, canc], s, '2026-12-07')
    expect(r.due.map((x) => x.r.id)).toEqual(['a'])
    expect(r.sent.map((x) => x.r.id)).toEqual(['b'])
    // al pasar a 1 día antes, lo enviado de 3 ya no cuenta: vuelve a tocar
    expect(clientReminders([sent], s, '2026-12-09').due).toHaveLength(1)
  })
  it('arma el mensaje con nombre, fecha, hora y saldo', () => {
    const t = renderTemplate(DEFAULT_CLIENT_TEMPLATE, { ...base, arrivalTime: '15:30' }, rooms, s, '2026-12-09')
    expect(t).toContain('Hola Ana,')
    expect(t).toContain('mañana')
    expect(t).toContain('a las 15:30')
    expect(t).toContain('Saldo pendiente: $2,200.00')
    expect(t).not.toContain('{')
  })
  it('omite líneas sin datos (sin dirección ni teléfono)', () => {
    const t = renderTemplate(DEFAULT_CLIENT_TEMPLATE, base, rooms, { ...s, address: '', phone: '' }, '2026-12-09')
    expect(t).not.toContain('📍')
    expect(t).not.toContain('Cualquier duda')
    expect(t).toContain('desde las 13:00')
  })
})
