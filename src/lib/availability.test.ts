import { describe, expect, it } from 'vitest'
import type { Reservation } from '../types'
import { computeAvailability, findDoubleBookings, reservationTotal, suggestRooms } from './availability'
import { addDays, nightsBetween, overlaps } from './dates'
import { buildIcs, dueReminders } from './reminders'
import { defaultRooms, defaultSettings } from '../store'
import { whatsappNumber } from './messages'

const rooms = defaultRooms()

function res(id: string, guest: string, checkIn: string, checkOut: string, roomNums: number[], status: Reservation['status'] = 'confirmada'): Reservation {
  return {
    id, folio: 1, guest, phone: '', guests: 1, checkIn, checkOut, status, notes: '', payments: [], total: 0, createdAt: '',
    rooms: roomNums.map((n) => ({ roomId: `room-${n}`, nightlyRate: 850 })),
  }
}

describe('fechas', () => {
  it('cuenta noches y respeta salida = llegada del siguiente', () => {
    expect(nightsBetween('2026-11-12', '2026-11-16')).toBe(4)
    expect(overlaps('2026-11-12', '2026-11-16', '2026-11-16', '2026-11-18')).toBe(false)
    expect(overlaps('2026-11-12', '2026-11-16', '2026-11-15', '2026-11-18')).toBe(true)
    expect(addDays('2026-11-29', 2)).toBe('2026-12-01')
  })
})

describe('disponibilidad con datos del Excel', () => {
  const data = [
    res('a', 'Martín Vargas', '2026-11-07', '2026-11-09', [2]),
    res('b', 'rafael elizondo', '2026-11-13', '2026-11-16', [3]),
    res('c', 'consuelo', '2026-11-12', '2026-11-16', [7, 8, 9]),
    res('d', 'cancelada', '2026-11-13', '2026-11-16', [4], 'cancelada'),
  ]

  it('marca ocupadas solo las habitaciones que cruzan el periodo', () => {
    const av = computeAvailability(rooms, data, '2026-11-14', '2026-11-15')
    const busy = av.filter((x) => !x.free).map((x) => x.room.name)
    expect(busy).toEqual(['3', '7', '8', '9'])
  })

  it('una reservación cancelada no bloquea', () => {
    const av = computeAvailability(rooms, data, '2026-11-13', '2026-11-16')
    expect(av.find((x) => x.room.name === '4')?.free).toBe(true)
  })

  it('el día de salida queda libre para otra llegada', () => {
    const av = computeAvailability(rooms, data, '2026-11-09', '2026-11-10')
    expect(av.find((x) => x.room.name === '2')?.free).toBe(true)
  })

  it('al editar se excluye la propia reservación', () => {
    const av = computeAvailability(rooms, data, '2026-11-13', '2026-11-16', 'b')
    expect(av.find((x) => x.room.name === '3')?.free).toBe(true)
  })

  it('detecta el empalme Constanza / Rafael en la habitación 3', () => {
    const conflict = [...data, res('e', 'Constanza', '2026-11-12', '2026-11-16', [3], 'pendiente')]
    const dbl = findDoubleBookings(conflict)
    expect(dbl.has('b')).toBe(true)
    expect(dbl.has('e')).toBe(true)
    expect(dbl.has('a')).toBe(false)
  })
})

describe('sugerencia de habitaciones', () => {
  const free = rooms
  it('1 persona: la sencilla más baja', () => {
    expect(suggestRooms(free, 1).map((r) => r.name)).toEqual(['1'])
  })
  it('2 personas: una doble antes que dos sencillas', () => {
    expect(suggestRooms(free, 2).map((r) => r.name)).toEqual(['2'])
  })
  it('2 personas sin dobles libres: dos sencillas contiguas', () => {
    const sin = rooms.filter((r) => r.type === 'sencilla')
    expect(suggestRooms(sin, 2).map((r) => r.name)).toEqual(['3', '4'])
  })
  it('4 personas: doble + doble', () => {
    expect(suggestRooms(free, 4).map((r) => r.name).sort()).toEqual(['2', '6'])
  })
  it('sin capacidad suficiente devuelve vacío', () => {
    expect(suggestRooms(rooms.slice(0, 1), 3)).toEqual([])
  })
})

describe('totales y teléfonos', () => {
  it('suma tarifa por noche de todas las habitaciones', () => {
    expect(reservationTotal([{ nightlyRate: 850 }, { nightlyRate: 1100 }], '2026-11-12', '2026-11-16')).toBe(7800)
  })
  it('normaliza teléfonos mexicanos', () => {
    expect(whatsappNumber('55 1827 5943')).toBe('525518275943')
    expect(whatsappNumber('+52 1 55 1827 5943')).toBe('525518275943')
    expect(whatsappNumber('56952286916')).toBe('56952286916')
  })
})

describe('recordatorios', () => {
  const r = res('x', 'Ixchel', '2026-11-14', '2026-11-15', [2])
  it('a las 9:00 del 9 nov toca el aviso de 5 días', () => {
    const due = dueReminders([r], defaultSettings, [], new Date(2026, 10, 9, 9, 5))
    expect(due.map((d) => d.kind)).toEqual(['d5'])
  })
  it('el día de llegada a mediodía toca "hoy"', () => {
    const due = dueReminders([r], defaultSettings, [], new Date(2026, 10, 14, 12, 1))
    expect(due.map((d) => d.kind)).toContain('d0')
  })
  it('no repite los ya mostrados ni avisa cosas de hace más de un día', () => {
    const first = dueReminders([r], defaultSettings, [], new Date(2026, 10, 9, 9, 5))
    expect(dueReminders([r], defaultSettings, [first[0].key], new Date(2026, 10, 9, 9, 6))).toEqual([])
    expect(dueReminders([r], defaultSettings, [], new Date(2026, 10, 11, 10, 0)).map((d) => d.kind)).not.toContain('d5')
  })
  it('el .ics trae alarmas con las horas correctas', () => {
    const ics = buildIcs([r], rooms, defaultSettings)
    expect(ics).toContain('TRIGGER;RELATED=START:-PT111H')
    expect(ics).toContain('TRIGGER;RELATED=START:-PT39H')
    expect(ics).toContain('TRIGGER;RELATED=START:-PT15H')
    expect(ics).toContain('TRIGGER;RELATED=START:PT12H')
  })
})
