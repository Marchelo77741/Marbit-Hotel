import { useSyncExternalStore } from 'react'
import type { AppData } from '../types'
import { commit, getData } from '../store/core'
import { catalogRow, emptyRows, inquiryRow, isUuid, quoteRow, reservationPayload, roomRow, rowsToData, settingsData, type CloudRows, type Row } from './cloudMap'
import { fingerprint, mergeData, stableStringify } from './merge'
import { supabase } from './supabase'

/**
 * Sincronización con Supabase. La app siempre trabaja con su copia local; aquí se trae lo nuevo de la nube,
 * se une con lo local (gana lo editado más recientemente) y se envía lo que cambió desde la última vez.
 * Una reservación que choca con otra (misma habitación y noches) NO se pierde: queda marcada «en conflicto».
 */

export interface SyncConflict {
  id: string
  /** texto para mostrar a la persona */
  message: string
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  lastOk: string | null
  /** registros locales que aún no están en la nube */
  pending: number
  error: string | null
  conflicts: SyncConflict[]
}

interface SyncMemo {
  /** última marca updated_at del servidor ya traída */
  since: string | null
  /** id → marca con la que está en la nube («del:…» si se borró) */
  synced: Record<string, string>
  hashes: Record<string, string>
}

let status: SyncStatus = { state: 'idle', lastOk: null, pending: 0, error: null, conflicts: [] }
const listeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const getSyncStatus = (): SyncStatus => status
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )
}

const memoKey = (tid: string) => `marbit-hotel:sync:${tid}`
function loadMemo(tid: string): SyncMemo {
  try {
    const t = localStorage.getItem(memoKey(tid))
    if (t) return { since: null, synced: {}, hashes: {}, ...JSON.parse(t) }
  } catch { /* sin memoria previa */ }
  return { since: null, synced: {}, hashes: {} }
}
function saveMemo(tid: string, m: SyncMemo) {
  try { localStorage.setItem(memoKey(tid), JSON.stringify(m)) } catch { /* sin espacio */ }
}

const hashOf = (v: unknown): string => {
  const t = stableStringify(v)
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
  return `${t.length}:${h >>> 0}`
}

// ---------- qué falta enviar ----------

interface Dirty {
  rooms: AppData['rooms']
  catalog: AppData['catalog']
  inquiries: AppData['inquiries']
  quotes: AppData['quotes']
  reservations: AppData['reservations']
  deletes: [string, string][]
  settings: boolean
  site: boolean
}

function findDirty(d: AppData, m: SyncMemo): Dirty {
  const need = <T extends { id: string; updatedAt?: string }>(l: T[]) => l.filter((x) => isUuid(x.id) && m.synced[x.id] !== (x.updatedAt ?? ''))
  return {
    rooms: need(d.rooms),
    catalog: need(d.catalog),
    inquiries: need(d.inquiries),
    quotes: need(d.quotes),
    reservations: need(d.reservations),
    deletes: Object.entries(d.tombstones).filter(([id, t]) => isUuid(id) && m.synced[id] !== `del:${t}`),
    settings: m.hashes.settings !== hashOf([settingsData(d.settings), d.settingsAt]),
    site: m.hashes.site !== hashOf(d.settings.site),
  }
}

export function countPending(tid: string, d: AppData = getData()): number {
  const x = findDirty(d, loadMemo(tid))
  return x.rooms.length + x.catalog.length + x.inquiries.length + x.quotes.length + x.reservations.length + x.deletes.length + (x.settings ? 1 : 0) + (x.site ? 1 : 0)
}

// ---------- traer ----------

const PAGE = 1000
async function fetchAll(table: string, tid: string, since: string | null): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase!.from(table).select('*').eq('tenant_id', tid)
    if (since) q = q.gte('updated_at', since)
    const { data, error } = await q.order('updated_at').order('id').range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data as Row[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function fetchByReservation(table: 'payments' | 'reservation_rooms', ids: string[]): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase!.from(table).select('*').in('reservation_id', ids.slice(i, i + 100))
    if (error) throw error
    out.push(...(data as Row[]))
  }
  return out
}

async function pull(tid: string, m: SyncMemo): Promise<void> {
  const since = m.since
  const rows: CloudRows = emptyRows()
  const [rooms, catalog, inquiries, quotes, reservations, payments] = await Promise.all([
    fetchAll('rooms', tid, since), fetchAll('catalog_items', tid, since), fetchAll('inquiries', tid, since),
    fetchAll('quotes', tid, since), fetchAll('reservations', tid, since), fetchAll('payments', tid, since),
  ])
  Object.assign(rows, { rooms, catalog_items: catalog, inquiries, quotes, reservations })
  // un pago cambiado por otro dispositivo obliga a traer su reservación completa
  const have = new Set(reservations.map((r) => String(r.id)))
  const extra = [...new Set(payments.map((p) => String(p.reservation_id)))].filter((id) => !have.has(id))
  for (let i = 0; i < extra.length; i += 100) {
    const { data, error } = await supabase!.from('reservations').select('*').in('id', extra.slice(i, i + 100))
    if (error) throw error
    rows.reservations.push(...(data as Row[]))
  }
  const ids = rows.reservations.map((r) => String(r.id))
  rows.payments = await fetchByReservation('payments', ids)
  rows.reservation_rooms = await fetchByReservation('reservation_rooms', ids)

  const [ts, sc] = await Promise.all([
    supabase!.from('tenant_settings').select('*').eq('tenant_id', tid).maybeSingle(),
    supabase!.from('site_content').select('*').eq('tenant_id', tid).maybeSingle(),
  ])
  if (ts.error) throw ts.error
  if (sc.error) throw sc.error
  rows.tenant_settings = ts.data as Row | null
  rows.site_content = sc.data as Row | null

  const local = getData()
  const { data: remote, stamps } = rowsToData(rows, local)
  const merged = mergeData(local, remote)
  if (fingerprint(merged) !== fingerprint(local)) commit(merged, true)

  // lo que ya coincide con la nube no hay que volver a enviarlo
  const now = getData()
  const same = (l: { id: string; updatedAt?: string }[]) => {
    for (const x of l) if (stamps[x.id] && stamps[x.id] === x.updatedAt) m.synced[x.id] = x.updatedAt!
  }
  same(now.rooms); same(now.catalog); same(now.inquiries); same(now.quotes); same(now.reservations)
  for (const [id, t] of Object.entries(remote.tombstones)) if (now.tombstones[id] === t) m.synced[id] = `del:${t}`
  if (rows.tenant_settings && stableStringify(settingsData(now.settings)) === stableStringify(settingsData(remote.settings)) && stableStringify(now.settingsAt) === stableStringify(remote.settingsAt)) {
    m.hashes.settings = hashOf([settingsData(now.settings), now.settingsAt])
  }
  if (rows.site_content && stableStringify(now.settings.site) === stableStringify(remote.settings.site)) m.hashes.site = hashOf(now.settings.site)

  const stampsAll = [...rooms, ...catalog, ...inquiries, ...quotes, ...rows.reservations, ...payments].map((r) => String(r.updated_at ?? ''))
  const top = stampsAll.sort().pop()
  if (top && (!m.since || top > m.since)) m.since = top
}

// ---------- enviar ----------

type PgErr = { code?: string; message?: string }
const codeOf = (e: unknown): string => (e && typeof e === 'object' ? String((e as PgErr).code ?? '') : '')

function friendly(e: unknown): string {
  const code = codeOf(e)
  if (code === '23P01') return 'Una habitación de esta reservación ya está ocupada esas noches por otra reservación (hecha en otro dispositivo). Cambia la habitación o las fechas.'
  if (code === '42501') return 'No tienes permiso para guardar cambios en esta posada.'
  return (e as PgErr)?.message ?? 'No se pudo guardar en la nube.'
}

async function putMany(table: string, rows: Row[], ids: string[], m: SyncMemo, stampOfId: (id: string) => string, fail: (id: string, e: unknown) => void) {
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await supabase!.from(table).upsert(batch, { onConflict: 'id' })
    if (!error) {
      for (const id of ids.slice(i, i + 100)) m.synced[id] = stampOfId(id)
      continue
    }
    for (let j = 0; j < batch.length; j++) {
      const one = await supabase!.from(table).upsert(batch[j], { onConflict: 'id' })
      const id = ids[i + j]
      if (one.error) fail(id, one.error)
      else m.synced[id] = stampOfId(id)
    }
  }
}

async function push(tid: string, m: SyncMemo, conflicts: Map<string, string>): Promise<void> {
  const d = getData()
  const dirty = findDirty(d, m)
  const stampOfId = (id: string): string => {
    for (const l of [d.rooms, d.catalog, d.inquiries, d.quotes, d.reservations]) {
      const x = l.find((r) => r.id === id)
      if (x) return x.updatedAt ?? ''
    }
    return ''
  }
  const fail = (id: string, e: unknown) => conflicts.set(id, friendly(e))

  await putMany('rooms', dirty.rooms.map((r) => roomRow(r, tid, d.rooms.indexOf(r))), dirty.rooms.map((r) => r.id), m, stampOfId, fail)
  await putMany('catalog_items', dirty.catalog.map((c) => catalogRow(c, tid, d.catalog.indexOf(c))), dirty.catalog.map((c) => c.id), m, stampOfId, fail)

  for (const r of dirty.reservations) {
    const { data, error } = await supabase!.rpc('push_reservation', { p_tenant: tid, p: reservationPayload(r) })
    if (error) { fail(r.id, error); continue }
    conflicts.delete(r.id)
    const res = data as { folio?: number; receipts?: Record<string, number>; skipped?: boolean }
    if (res.skipped) continue // en la nube hay una versión más nueva: llegará en la siguiente revisión
    m.synced[r.id] = r.updatedAt ?? ''
    // el servidor puede haber asignado otro folio o recibo (si otro dispositivo usó el mismo número)
    const now = getData()
    const cur = now.reservations.find((x) => x.id === r.id)
    if (cur && (res.folio !== cur.folio || cur.payments.some((p) => res.receipts?.[p.id] !== undefined && res.receipts[p.id] !== p.receiptNo))) {
      const fixed = {
        ...cur,
        folio: res.folio ?? cur.folio,
        payments: cur.payments.map((p) => ({ ...p, receiptNo: res.receipts?.[p.id] ?? p.receiptNo })),
      }
      commit({ ...now, reservations: now.reservations.map((x) => (x.id === r.id ? fixed : x)) }, true)
    }
  }

  // cotizaciones: el consecutivo lo asigna el servidor al crearla; después solo se actualiza
  for (const q of dirty.quotes) {
    const row = quoteRow(q, tid)
    const known = Object.keys(m.synced).includes(q.id)
    let error: unknown = null
    if (known) ({ error } = await supabase!.from('quotes').update(row).eq('id', q.id))
    else {
      ;({ error } = await supabase!.from('quotes').insert(row))
      if (codeOf(error) === '23505') ({ error } = await supabase!.from('quotes').update(row).eq('id', q.id))
    }
    if (error) fail(q.id, error)
    else m.synced[q.id] = q.updatedAt ?? ''
  }

  await putMany('inquiries', dirty.inquiries.map((q) => inquiryRow(q, tid)), dirty.inquiries.map((q) => q.id), m, stampOfId, fail)

  for (const [id, t] of dirty.deletes) {
    const { error } = await supabase!.rpc('soft_delete', { p_tenant: tid, p_ids: [id], p_at: t })
    if (error) fail(id, error)
    else m.synced[id] = `del:${t}`
  }

  if (dirty.settings) {
    const { error } = await supabase!.from('tenant_settings').upsert({ tenant_id: tid, data: settingsData(d.settings), field_updated_at: d.settingsAt })
    if (error) throw error
    m.hashes.settings = hashOf([settingsData(d.settings), d.settingsAt])
  }
  if (dirty.site) {
    const { error } = await supabase!.from('site_content').upsert({ tenant_id: tid, data: d.settings.site })
    if (error) throw error
    m.hashes.site = hashOf(d.settings.site)
  }
}

// ---------- ciclo ----------

let running = false
let again = false
const conflictsNow = new Map<string, string>()

function describeConflicts(): SyncConflict[] {
  return [...conflictsNow].map(([id, message]) => ({ id, message }))
}

export async function syncNow(tid: string): Promise<void> {
  if (!supabase) return
  if (running) { again = true; return }
  running = true
  setStatus({ state: 'syncing' })
  try {
    const m = loadMemo(tid)
    await pull(tid, m)
    await push(tid, m, conflictsNow)
    saveMemo(tid, m)
    setStatus({ state: 'idle', lastOk: new Date().toISOString(), error: null, pending: countPending(tid), conflicts: describeConflicts() })
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    const text = (e as PgErr)?.message ?? 'Error desconocido'
    setStatus({ state: offline || /fetch|network|Failed to/i.test(text) ? 'offline' : 'error', error: text, pending: countPending(tid), conflicts: describeConflicts() })
  } finally {
    running = false
    if (again) { again = false; void syncNow(tid) }
  }
}

/** Al cambiar de posada se olvidan los conflictos de la anterior. */
export function resetSyncState() {
  conflictsNow.clear()
  setStatus({ state: 'idle', lastOk: null, pending: 0, error: null, conflicts: [] })
}


export interface VerifyRow {
  label: string
  local: number
  cloud: number
}

/** Compara lo que hay en este dispositivo con lo que hay en la nube (cantidades y sumas de dinero). */
export async function verifyCloud(tid: string): Promise<VerifyRow[]> {
  const d = getData()
  const live = (rows: Row[]) => rows.filter((r) => !r.deleted_at)
  const [rooms, cat, inq, quotes, res, pays] = await Promise.all([
    fetchAll('rooms', tid, null), fetchAll('catalog_items', tid, null), fetchAll('inquiries', tid, null),
    fetchAll('quotes', tid, null), fetchAll('reservations', tid, null), fetchAll('payments', tid, null),
  ])
  const sum = (l: number[]) => Math.round(l.reduce((a, b) => a + b, 0) * 100) / 100
  const payments = d.reservations.flatMap((r) => r.payments)
  return [
    { label: 'Habitaciones', local: d.rooms.length, cloud: live(rooms).length },
    { label: 'Catálogo', local: d.catalog.length, cloud: live(cat).length },
    { label: 'Reservaciones', local: d.reservations.length, cloud: live(res).length },
    { label: 'Total de reservaciones ($)', local: sum(d.reservations.map((r) => r.total)), cloud: sum(live(res).map((r) => Number(r.total))) },
    { label: 'Pagos', local: payments.length, cloud: live(pays).length },
    { label: 'Total de pagos ($)', local: sum(payments.map((p) => p.amount)), cloud: sum(live(pays).map((p) => Number(p.amount))) },
    { label: 'Cotizaciones', local: d.quotes.length, cloud: live(quotes).length },
    { label: 'Solicitudes', local: d.inquiries.length, cloud: live(inq).length },
  ]
}
