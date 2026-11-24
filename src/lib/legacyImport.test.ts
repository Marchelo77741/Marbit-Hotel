import { describe, expect, it } from 'vitest'
import { isUuid } from './cloudMap'
import { convertIds, legacyPhotoRefs, orphanRoomRefs, overlapCount, remapPhotos, stableUuid } from './legacyImport'
import { emptyData } from '../store/defaults'
import type { AppData } from '../types'

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const RES = '33333333-3333-4333-8333-333333333333'

function legacy(): AppData {
  const d = emptyData() // trae room-1…room-9 y el catálogo hab1, hab2…
  d.rooms[0].photos = ['abc123', 'https://x.test/a.jpg']
  d.reservations = [{
    id: RES, folio: 4, guest: 'Ana', phone: '', guests: 1, checkIn: '2026-12-01', checkOut: '2026-12-03', rooms: [{ roomId: 'room-1', nightlyRate: 850 }],
    total: 1700, status: 'confirmada', notes: '', payments: [{ id: 'pay-legacy', receiptNo: 2, amount: 500, method: 'efectivo', date: '2026-11-01T10:00:00.000Z', note: '' }],
    createdAt: '2026-11-01T10:00:00.000Z', quoteId: 'q-old',
  }]
  d.quotes = [{
    id: 'q-old', folio: 'COT-2026-001', date: '2026-11-01', client: 'Ana', phone: '', email: '', guests: 1, arrival: '', departure: '', nights: 2, checkInTime: '', checkOutTime: '',
    roomsText: '', note: '', lines: [{ id: 'l1', catId: 'hab1', type: 'Hospedaje', name: 'Hab', desc: '', price: 850, qty: 2 }], status: 'reservada', reservationId: RES, createdAt: '2026-11-01T10:00:00.000Z',
  }]
  d.tombstones = { 'room-old': '2026-11-02T00:00:00.000Z' }
  d.settings.site.hero.slides = ['abc123']
  return d
}

describe('traslado desde el programa anterior', () => {
  it('el mismo id antiguo da siempre el mismo uuid, y cambia entre posadas', async () => {
    expect(await stableUuid(T1, 'room-1')).toBe(await stableUuid(T1, 'room-1'))
    expect(await stableUuid(T1, 'room-1')).not.toBe(await stableUuid(T2, 'room-1'))
    expect(isUuid(await stableUuid(T1, 'room-1'))).toBe(true)
  })

  it('convierte todos los ids y conserva las referencias entre registros', async () => {
    const out = await convertIds(legacy(), T1)
    const room1 = out.rooms[0].id
    expect(isUuid(room1)).toBe(true)
    expect(out.reservations[0].rooms[0].roomId).toBe(room1)
    expect(out.reservations[0].id).toBe(RES) // lo que ya era uuid no cambia
    expect(isUuid(out.reservations[0].payments[0].id)).toBe(true)
    expect(out.quotes[0].reservationId).toBe(RES)
    expect(out.reservations[0].quoteId).toBe(out.quotes[0].id)
    expect(out.quotes[0].lines[0].catId).toBe(out.catalog.find((c) => c.name.includes('Sencilla'))!.id)
    expect(Object.keys(out.tombstones).every(isUuid)).toBe(true)
  })

  it('repetir la conversión da lo mismo (no se duplica nada al importar dos veces)', async () => {
    const a = await convertIds(legacy(), T1)
    const b = await convertIds(legacy(), T1)
    expect(a).toEqual(b)
  })

  it('detecta reservaciones con habitaciones inexistentes', async () => {
    const d = legacy()
    d.reservations[0].rooms = [{ roomId: 'room-99', nightlyRate: 1 }]
    expect(orphanRoomRefs(await convertIds(d, T1))).toBe(1)
    expect(orphanRoomRefs(await convertIds(legacy(), T1))).toBe(0)
  })

  it('encuentra y reemplaza las fotos del servidor anterior', () => {
    const d = legacy()
    expect(legacyPhotoRefs(d)).toEqual(['abc123'])
    const out = remapPhotos(d, { abc123: `${T1}/abc123.jpg` })
    expect(out.rooms[0].photos).toEqual([`${T1}/abc123.jpg`, 'https://x.test/a.jpg'])
    expect(out.settings.site.hero.slides).toEqual([`${T1}/abc123.jpg`])
    expect(legacyPhotoRefs(out)).toEqual([])
  })

  it('cuenta reservaciones que se traslapan en la misma habitación (ignora canceladas)', async () => {
    const d = await convertIds(legacy(), T1)
    const base = d.reservations[0]
    const dup = (id: string, status: 'pendiente' | 'cancelada') => ({ ...base, id, status, payments: [] })
    expect(overlapCount({ ...d, reservations: [base, dup('44444444-4444-4444-8444-444444444444', 'pendiente')] })).toBe(1)
    expect(overlapCount({ ...d, reservations: [base, dup('44444444-4444-4444-8444-444444444444', 'cancelada')] })).toBe(0)
  })
})
