import { describe, expect, it } from 'vitest'
import type { Room } from '../types'
import { publicRooms } from './publicSite'

const base = { rateSencilla: 850, rateDoble: 1100 }
const room = (o: Partial<Room>): Room => ({ id: 'room-1', name: '1', type: 'sencilla', capacity: 1, active: true, ...o })

describe('publicRooms', () => {
  it('no publica habitaciones ocultas ni inactivas', () => {
    const out = publicRooms([room({}), room({ id: 'room-2', status: 'oculta' }), room({ id: 'room-3', active: false })], base)
    expect(out.map((r) => r.id)).toEqual(['room-1'])
  })
  it('el precio solo sale si se activó y usa el base si no hay precio propio', () => {
    expect(publicRooms([room({})], base)[0].price).toBeNull()
    expect(publicRooms([room({ showPrice: true })], base)[0].price).toBe(850)
    expect(publicRooms([room({ showPrice: true, type: 'doble', publicPrice: 1500 })], base)[0].price).toBe(1500)
  })
  it('no-disponible se publica con su estado', () => {
    expect(publicRooms([room({ status: 'no-disponible' })], base)[0].status).toBe('no-disponible')
  })
})
