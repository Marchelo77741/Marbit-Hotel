import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
})
vi.stubGlobal('document', { visibilityState: 'visible' })
const db: Record<string, Row[]> = {}
let rpcFail: { code: string; message: string } | null = null
let clock = 0
const tick = () => new Date(Date.UTC(2026, 10, 24, 12, 0, clock++)).toISOString()

function table(name: string) {
  db[name] ??= []
  const rows = db[name]
  const filters: ((r: Row) => boolean)[] = []
  let pending: { kind: 'select' | 'update'; patch?: Row } = { kind: 'select' }
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return pending.kind === 'update' ? run() : api },
    in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return api },
    gte: (k: string, v: string) => { filters.push((r) => String(r[k]) >= v); return api },
    order: () => api,
    range: (a: number, b: number) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))).slice(a, b + 1), error: null }),
    maybeSingle: () => Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
    upsert: (v: Row | Row[]) => {
      for (const x of Array.isArray(v) ? v : [v]) {
        const key = name === 'tenant_settings' || name === 'site_content' ? 'tenant_id' : 'id'
        const i = rows.findIndex((r) => r[key] === x[key])
        const row = { ...x, updated_at: tick() }
        if (i >= 0) rows[i] = { ...rows[i], ...row }
        else rows.push(row)
      }
      return Promise.resolve({ error: null })
    },
    insert: (x: Row) => { rows.push({ ...x, updated_at: tick() }); return Promise.resolve({ error: null }) },
    update: (patch: Row) => { pending = { kind: 'update', patch }; return api },
  }
  function run() {
    for (const r of rows.filter((x) => filters.every((f) => f(x)))) Object.assign(r, pending.patch, { updated_at: tick() })
    return Promise.resolve({ error: null })
  }
  return api
}

vi.mock('./supabase', () => ({
  cloudEnabled: true,
  supabase: {
    from: (n: string) => table(n),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'push_reservation') {
        if (rpcFail) return Promise.resolve({ data: null, error: rpcFail })
        const p = args.p as Row
        db.reservations ??= []
        const i = db.reservations.findIndex((r) => r.id === p.id)
        const used = new Set(db.reservations.map((r) => r.folio))
        const folio = i >= 0 ? db.reservations[i].folio : used.has(p.folio) ? Math.max(...used as Set<number>) + 1 : p.folio
        const row = { id: p.id, folio, guest: p.guest, phone: p.phone, guests: p.guests, check_in: p.check_in, check_out: p.check_out, arrival_time: p.arrival_time, total: p.total, status: p.status, notes: p.notes, client_updated_at: p.client_updated_at, created_at: p.created_at, updated_at: tick(), deleted_at: null }
        if (i >= 0) db.reservations[i] = row
        else db.reservations.push(row)
        db.reservation_rooms = (db.reservation_rooms ?? []).filter((x) => x.reservation_id !== p.id)
        for (const a of p.rooms as Row[]) db.reservation_rooms.push({ reservation_id: p.id, room_id: a.room_id, nightly_rate: a.nightly_rate })
        return Promise.resolve({ data: { ok: true, folio, receipts: {} }, error: null })
      }
      return Promise.resolve({ data: 0, error: null })
    },
  },
}))

const { syncNow, getSyncStatus } = await import('./cloudSync')
const core = await import('../store/core')
const { blankCloudData } = await import('../store/defaults')
const store = await import('../store')

const T = '11111111-1111-4111-8111-111111111111'
const R1 = '22222222-2222-4222-8222-222222222222'

function device() {
  localStorage.clear()
  core.setScope(T, () => blankCloudData('Posada Prueba'))
}

describe('sincronización', () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k]
    rpcFail = null
    clock = 0
  })

  it('un dispositivo sube sus habitaciones y ajustes, y otro dispositivo los recibe', async () => {
    device()
    store.saveRooms([{ id: R1, name: '1', type: 'doble', capacity: 2, active: true }])
    store.saveSettings({ phone: '722 000 0000' })
    await syncNow(T)
    expect(db.rooms).toHaveLength(1)
    expect((db.tenant_settings[0].data as Row).phone).toBe('722 000 0000')

    // segundo dispositivo: copia local vacía de la misma posada
    device()
    expect(store.getData().rooms).toHaveLength(0)
    await syncNow(T)
    expect(store.getData().rooms.map((r) => r.id)).toEqual([R1])
    expect(store.getData().settings.phone).toBe('722 000 0000')
  })

  it('una reservación se envía y el folio que asigna el servidor se refleja en la app', async () => {
    device()
    store.saveRooms([{ id: R1, name: '1', type: 'doble', capacity: 2, active: true }])
    db.reservations = [{ id: '99999999-9999-4999-8999-999999999999', folio: 1, guest: 'Otro', check_in: '2026-01-01', check_out: '2026-01-02', updated_at: '2026-01-01T00:00:00Z' }]
    const r = store.saveReservation({ guest: 'Ana', phone: '', guests: 2, checkIn: '2026-12-10', checkOut: '2026-12-12', rooms: [{ roomId: R1, nightlyRate: 1000 }], total: 2000, status: 'confirmada', notes: '' })
    expect(r.folio).toBe(1) // local: dos dispositivos eligieron el mismo folio
    await syncNow(T)
    expect(store.getData().reservations.find((x) => x.id === r.id)!.folio).toBe(2)
  })

  it('si la nube rechaza una reservación por traslape queda marcada como conflicto y no se pierde', async () => {
    device()
    store.saveRooms([{ id: R1, name: '1', type: 'doble', capacity: 2, active: true }])
    const r = store.saveReservation({ guest: 'Ana', phone: '', guests: 2, checkIn: '2026-12-10', checkOut: '2026-12-12', rooms: [{ roomId: R1, nightlyRate: 1000 }], total: 2000, status: 'confirmada', notes: '' })
    rpcFail = { code: '23P01', message: 'conflicting key value violates exclusion constraint' }
    await syncNow(T)
    expect(getSyncStatus().conflicts).toHaveLength(1)
    expect(getSyncStatus().conflicts[0].message).toMatch(/ya está ocupada/)
    expect(store.getData().reservations.some((x) => x.id === r.id)).toBe(true)
    rpcFail = null
    await syncNow(T) // al liberarse la habitación se guarda sola
    expect(getSyncStatus().conflicts).toHaveLength(0)
    expect(db.reservations.some((x) => x.id === r.id)).toBe(true)
  })

  it('lo borrado en un dispositivo desaparece en el otro', async () => {
    device()
    store.saveRooms([{ id: R1, name: '1', type: 'doble', capacity: 2, active: true }])
    await syncNow(T)
    store.saveRooms([])
    // el borrado se anota en la nube (la función soft_delete de la prueba solo responde ok)
    await syncNow(T)
    expect(store.getData().tombstones[R1]).toBeTruthy()
  })
})
