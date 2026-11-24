import { describe, expect, it } from 'vitest'
import { blankCloudData } from '../store/defaults'
import { catalogRow, emptyRows, isUuid, reservationPayload, roomRow, rowsToData, settingsData } from './cloudMap'
import type { Reservation, Room } from '../types'

const T = '11111111-1111-4111-8111-111111111111'
const R1 = '22222222-2222-4222-8222-222222222222'
const RES = '33333333-3333-4333-8333-333333333333'
const PAY = '44444444-4444-4444-8444-444444444444'

describe('cloudMap', () => {
  it('reconoce uuids', () => {
    expect(isUuid(R1)).toBe(true)
    expect(isUuid('room-1')).toBe(false)
  })

  it('una habitación sobrevive el viaje a la nube y de regreso', () => {
    const room: Room = { id: R1, name: '3', type: 'doble', capacity: 2, active: true, description: 'Vista', photos: ['a.jpg'], status: 'oculta', showPrice: true, publicPrice: 1200, updatedAt: '2026-11-24T10:00:00.000Z' }
    const row = roomRow(room, T, 0)
    const { data, stamps } = rowsToData({ ...emptyRows(), rooms: [{ ...row, updated_at: '2026-11-24T10:00:01+00:00' }] }, blankCloudData('X'))
    expect(data.rooms[0]).toEqual(room)
    expect(stamps[R1]).toBe(room.updatedAt)
  })

  it('una fila borrada en la nube se vuelve un borrado local, no un registro', () => {
    const row = { ...roomRow({ id: R1, name: '1', type: 'sencilla', capacity: 1, active: true }, T, 0), deleted_at: '2026-11-24T12:00:00+00:00', updated_at: '2026-11-24T12:00:00+00:00' }
    const { data } = rowsToData({ ...emptyRows(), rooms: [row] }, blankCloudData('X'))
    expect(data.rooms).toHaveLength(0)
    expect(data.tombstones[R1]).toBe('2026-11-24T12:00:00.000Z')
  })

  it('la reservación se arma con habitaciones y pagos, y vuelve igual', () => {
    const r: Reservation = {
      id: RES, folio: 7, guest: 'Ana', phone: '7221234567', guests: 2, checkIn: '2026-12-10', checkOut: '2026-12-12', arrivalTime: '15:30',
      rooms: [{ roomId: R1, nightlyRate: 1000 }], total: 2000, status: 'confirmada', notes: 'n',
      payments: [{ id: PAY, receiptNo: 3, amount: 500, method: 'transferencia', date: '2026-11-24T10:00:00.000Z', note: 'Anticipo' }],
      createdAt: '2026-11-24T09:00:00.000Z', updatedAt: '2026-11-24T10:00:00.000Z', clientReminders: { '3': '2026-12-07T10:00:00.000Z' },
    }
    const p = reservationPayload(r) as Record<string, unknown>
    expect(p.rooms).toEqual([{ room_id: R1, nightly_rate: 1000 }])
    const rows = emptyRows()
    rows.reservations = [{ id: RES, folio: 7, guest: 'Ana', phone: '7221234567', guests: 2, check_in: '2026-12-10', check_out: '2026-12-12', arrival_time: '15:30', total: '2000.00', status: 'confirmada', notes: 'n', client_reminders: { '3': '2026-12-07T10:00:00.000Z' }, quote_id: null, created_at: '2026-11-24T09:00:00+00:00', client_updated_at: '2026-11-24T10:00:00+00:00', updated_at: '2026-11-24T10:00:02+00:00', deleted_at: null }]
    rows.reservation_rooms = [{ reservation_id: RES, room_id: R1, nightly_rate: '1000.00' }]
    rows.payments = [{ id: PAY, reservation_id: RES, receipt_no: 3, amount: '500.00', method: 'transferencia', paid_at: '2026-11-24T10:00:00+00:00', note: 'Anticipo', deleted_at: null, updated_at: '2026-11-24T10:00:02+00:00' }]
    expect(rowsToData(rows, blankCloudData('X')).data.reservations[0]).toEqual(r)
  })

  it('un pago borrado en la nube se anota como borrado y no aparece', () => {
    const rows = emptyRows()
    rows.reservations = [{ id: RES, folio: 1, guest: 'A', check_in: '2026-12-10', check_out: '2026-12-11', created_at: '2026-11-24T09:00:00+00:00', updated_at: '2026-11-24T09:00:00+00:00' }]
    rows.payments = [{ id: PAY, reservation_id: RES, amount: 1, deleted_at: '2026-11-24T11:00:00+00:00', updated_at: '2026-11-24T11:00:00+00:00' }]
    const { data } = rowsToData(rows, blankCloudData('X'))
    expect(data.reservations[0].payments).toHaveLength(0)
    expect(data.tombstones[PAY]).toBeTruthy()
  })

  it('los ajustes no mandan contadores ni el sitio, y el sitio local se conserva si la nube no tiene', () => {
    const d = blankCloudData('Mi Posada')
    const s = settingsData(d.settings)
    expect('nextFolio' in s).toBe(false)
    expect('site' in s).toBe(false)
    expect(rowsToData(emptyRows(), d).data.settings.businessName).toBe('Mi Posada')
  })

  it('el catálogo usa description y conserva el orden', () => {
    const row = catalogRow({ id: R1, type: 'Servicio', name: 'Masaje', desc: '1 hora', price: 500, cap: 0, updatedAt: '2026-11-24T10:00:00.000Z' }, T, 4)
    expect(row.description).toBe('1 hora')
    expect(row.sort).toBe(4)
  })
})

describe('posada nueva en la nube', () => {
  it('empieza sin habitaciones ni contenido de otra posada', () => {
    const d = blankCloudData('Casa Nueva')
    expect(d.rooms).toHaveLength(0)
    expect(d.catalog).toHaveLength(0)
    expect(d.settings.site.gallery).toHaveLength(0)
    expect(d.settings.businessName).toBe('Casa Nueva')
  })
})
