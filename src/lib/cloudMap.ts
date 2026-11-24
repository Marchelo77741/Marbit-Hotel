import type { AppData, CatalogItem, Inquiry, Payment, Quote, Reservation, Room, Settings, SiteContent } from '../types'
import { EPOCH } from './merge'

/** Traducción entre los registros de la app y las filas de Supabase. Sin red: solo funciones puras. */
export type Row = Record<string, unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s)

/** Contadores: en la nube los asigna el servidor, no viajan en los ajustes. */
export const COUNTER_KEYS = ['nextFolio', 'nextReceipt', 'nextQuote', 'quoteYear'] as const

const iso = (v: unknown): string => (typeof v === 'string' && v ? new Date(v).toISOString() : EPOCH)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown, d = 0): number => (v === null || v === undefined || v === '' ? d : Number(v))
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')
/** Fecha de modificación de una fila: la del dispositivo que la editó; si no hay, la del servidor. */
export const stampOf = (r: Row): string => iso(r.client_updated_at ?? r.updated_at)

// ---------- hacia la nube ----------

export function roomRow(r: Room, tenant: string, sort: number): Row {
  return {
    id: r.id, tenant_id: tenant, name: r.name, type: r.type, capacity: r.capacity, active: r.active,
    description: r.description ?? '', status: r.status ?? 'disponible', show_price: r.showPrice ?? false,
    public_price: r.publicPrice ?? null, photos: r.photos ?? [], sort,
    client_updated_at: r.updatedAt ?? EPOCH, deleted_at: null,
  }
}

export function catalogRow(c: CatalogItem, tenant: string, sort: number): Row {
  return {
    id: c.id, tenant_id: tenant, type: c.type, name: c.name, description: c.desc, price: c.price, cap: c.cap, sort,
    client_updated_at: c.updatedAt ?? EPOCH, deleted_at: null,
  }
}

export function inquiryRow(q: Inquiry, tenant: string): Row {
  return {
    id: q.id, tenant_id: tenant, room_id: isUuid(q.roomId) ? q.roomId : null, room_name: q.roomName, name: q.name,
    channel: q.channel, phone: q.phone, email: q.email, check_in: q.checkIn || null, check_out: q.checkOut || null,
    guests: q.guests, message: q.message, status: q.status, client_updated_at: q.updatedAt ?? EPOCH, deleted_at: null,
  }
}

/** El número consecutivo lo asigna el servidor; el folio de texto (COT-2026-001) lo escribe la app. */
export function quoteRow(q: Quote, tenant: string): Row {
  return {
    id: q.id, tenant_id: tenant, folio: q.folio, quote_date: day(q.date) || null, client: q.client, phone: q.phone, email: q.email,
    guests: q.guests, arrival: q.arrival || null, departure: q.departure || null, nights: q.nights,
    check_in_time: q.checkInTime, check_out_time: q.checkOutTime, rooms_text: q.roomsText, note: q.note, lines: q.lines,
    status: q.status, reservation_id: isUuid(q.reservationId) ? q.reservationId : null,
    client_updated_at: q.updatedAt ?? EPOCH, deleted_at: null,
  }
}

/** Parámetro de la función push_reservation: reservación + habitaciones + pagos en una sola operación. */
export function reservationPayload(r: Reservation): Row {
  return {
    id: r.id, folio: r.folio, guest: r.guest, phone: r.phone, guests: r.guests, check_in: r.checkIn, check_out: r.checkOut,
    arrival_time: r.arrivalTime ?? '', total: r.total, status: r.status, notes: r.notes,
    client_reminders: r.clientReminders ?? {}, quote_id: isUuid(r.quoteId) ? r.quoteId : null,
    client_updated_at: r.updatedAt ?? EPOCH, created_at: r.createdAt,
    rooms: r.rooms.map((a) => ({ room_id: a.roomId, nightly_rate: a.nightlyRate })),
    payments: r.payments.map((p) => ({ id: p.id, receipt_no: p.receiptNo, amount: p.amount, method: p.method, paid_at: p.date, note: p.note })),
  }
}

export function settingsData(s: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s }
  delete out.site
  for (const k of COUNTER_KEYS) delete out[k]
  return out
}

// ---------- desde la nube ----------

export interface CloudRows {
  rooms: Row[]
  catalog_items: Row[]
  inquiries: Row[]
  quotes: Row[]
  reservations: Row[]
  reservation_rooms: Row[]
  payments: Row[]
  tenant_settings: Row | null
  site_content: Row | null
}

export const emptyRows = (): CloudRows => ({
  rooms: [], catalog_items: [], inquiries: [], quotes: [], reservations: [], reservation_rooms: [], payments: [],
  tenant_settings: null, site_content: null,
})

/** Lo que dice la nube, en forma de AppData (listo para unirse con lo local) y la marca de cada registro. */
export function rowsToData(rows: CloudRows, local: AppData): { data: AppData; stamps: Record<string, string> } {
  const stamps: Record<string, string> = {}
  const tombstones: Record<string, string> = {}
  const alive = (r: Row): boolean => {
    if (r.deleted_at) {
      tombstones[String(r.id)] = iso(r.deleted_at)
      return false
    }
    return true
  }
  const stamp = (r: Row): string => {
    const s = stampOf(r)
    stamps[String(r.id)] = s
    return s
  }

  const rooms: Room[] = rows.rooms.filter(alive).sort((a, b) => num(a.sort) - num(b.sort)).map((r) => ({
    id: String(r.id), name: str(r.name), type: r.type === 'doble' ? 'doble' : 'sencilla', capacity: num(r.capacity, 1), active: r.active !== false,
    description: str(r.description), photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    status: (r.status as Room['status']) ?? 'disponible', showPrice: r.show_price === true,
    publicPrice: r.public_price === null || r.public_price === undefined ? undefined : num(r.public_price), updatedAt: stamp(r),
  }))

  const catalog: CatalogItem[] = rows.catalog_items.filter(alive).sort((a, b) => num(a.sort) - num(b.sort)).map((r) => ({
    id: String(r.id), type: r.type as CatalogItem['type'], name: str(r.name), desc: str(r.description), price: num(r.price), cap: num(r.cap), updatedAt: stamp(r),
  }))

  const inquiries: Inquiry[] = rows.inquiries.filter(alive).map((r) => ({
    id: String(r.id), roomId: str(r.room_id), roomName: str(r.room_name), name: str(r.name), channel: r.channel === 'email' ? 'email' : 'whatsapp',
    phone: str(r.phone), email: str(r.email), checkIn: day(r.check_in), checkOut: day(r.check_out), guests: num(r.guests),
    message: str(r.message), status: (r.status as Inquiry['status']) ?? 'nueva', createdAt: iso(r.created_at), updatedAt: stamp(r),
  }))

  const quotes: Quote[] = rows.quotes.filter(alive).map((r) => ({
    id: String(r.id), folio: str(r.folio), date: day(r.quote_date), client: str(r.client), phone: str(r.phone), email: str(r.email),
    guests: num(r.guests), arrival: day(r.arrival), departure: day(r.departure), nights: num(r.nights), checkInTime: str(r.check_in_time),
    checkOutTime: str(r.check_out_time), roomsText: str(r.rooms_text), note: str(r.note), lines: Array.isArray(r.lines) ? (r.lines as Quote['lines']) : [],
    status: (r.status as Quote['status']) ?? 'abierta', reservationId: r.reservation_id ? String(r.reservation_id) : undefined,
    createdAt: iso(r.created_at), updatedAt: stamp(r),
  }))

  const paysBy = new Map<string, Payment[]>()
  for (const p of rows.payments) {
    if (!alive(p)) continue
    const list = paysBy.get(String(p.reservation_id)) ?? []
    list.push({ id: String(p.id), receiptNo: num(p.receipt_no), amount: num(p.amount), method: (p.method as Payment['method']) ?? 'efectivo', date: iso(p.paid_at), note: str(p.note) })
    paysBy.set(String(p.reservation_id), list)
  }
  const roomsBy = new Map<string, Reservation['rooms']>()
  for (const a of rows.reservation_rooms) {
    const list = roomsBy.get(String(a.reservation_id)) ?? []
    list.push({ roomId: String(a.room_id), nightlyRate: num(a.nightly_rate) })
    roomsBy.set(String(a.reservation_id), list)
  }
  const reservations: Reservation[] = rows.reservations.filter(alive).map((r) => ({
    id: String(r.id), folio: num(r.folio), guest: str(r.guest), phone: str(r.phone), guests: num(r.guests, 1), checkIn: day(r.check_in), checkOut: day(r.check_out),
    arrivalTime: str(r.arrival_time), rooms: roomsBy.get(String(r.id)) ?? [], total: num(r.total), status: (r.status as Reservation['status']) ?? 'pendiente',
    notes: str(r.notes), payments: (paysBy.get(String(r.id)) ?? []).sort((a, b) => a.date.localeCompare(b.date)), createdAt: iso(r.created_at), updatedAt: stamp(r),
    clientReminders: r.client_reminders && typeof r.client_reminders === 'object' && Object.keys(r.client_reminders as object).length > 0 ? (r.client_reminders as Record<string, string>) : undefined,
    quoteId: r.quote_id ? String(r.quote_id) : undefined,
  }))

  const ts = rows.tenant_settings
  const settings: Settings = {
    ...local.settings,
    ...((ts?.data as Partial<Settings> | undefined) ?? {}),
    site: (rows.site_content?.data as SiteContent | undefined) ?? local.settings.site,
  }
  const settingsAt = ts?.field_updated_at && typeof ts.field_updated_at === 'object' ? (ts.field_updated_at as Record<string, string>) : {}

  return {
    data: { version: 1, rooms, reservations, catalog, quotes, inquiries, settings, settingsAt, tombstones, sentReminders: [], lastBackup: null },
    stamps,
  }
}
