import type { AppData } from '../types'
import { fingerprint as fingerprintOf, mergeData } from '../lib/merge'
import { commit, getData } from './core'
import { emptyData, normalizeData } from './defaults'

// ---------- recordatorios y respaldo ----------

export function markReminderSent(keys: string[]) {
  if (keys.length === 0) return
  const merged = Array.from(new Set([...getData().sentReminders, ...keys])).slice(-500)
  commit({ ...getData(), sentReminders: merged })
}

export function exportBackup(): string {
  commit({ ...getData(), lastBackup: new Date().toISOString() })
  return JSON.stringify(getData(), null, 2)
}

export function importBackup(text: string, mode: 'replace' | 'merge'): { reservations: number } {
  const incoming = normalizeData(JSON.parse(text))
  const now = new Date().toISOString()
  const restamp = <T extends { updatedAt?: string }>(l: T[]): T[] => l.map((x) => ({ ...x, updatedAt: now }))
  if (mode === 'replace') {
    // lo que había y ya no está se anota como borrado; lo que viene del respaldo se considera «lo más reciente»
    const tombstones = { ...getData().tombstones, ...incoming.tombstones }
    const keep = new Set([
      ...incoming.rooms.map((x) => x.id),
      ...incoming.reservations.map((x) => x.id),
      ...incoming.reservations.flatMap((r) => r.payments.map((p) => p.id)),
      ...incoming.catalog.map((x) => x.id),
      ...incoming.quotes.map((x) => x.id),
      ...incoming.inquiries.map((x) => x.id),
    ])
    for (const r of getData().rooms) if (!keep.has(r.id)) tombstones[r.id] = tombstones[r.id] ?? now
    for (const r of getData().reservations) {
      if (!keep.has(r.id)) tombstones[r.id] = tombstones[r.id] ?? now
      for (const p of r.payments) if (!keep.has(p.id)) tombstones[p.id] = tombstones[p.id] ?? now
    }
    for (const c of getData().catalog) if (!keep.has(c.id)) tombstones[c.id] = tombstones[c.id] ?? now
    for (const q of getData().quotes) if (!keep.has(q.id)) tombstones[q.id] = tombstones[q.id] ?? now
    for (const q of getData().inquiries) if (!keep.has(q.id)) tombstones[q.id] = tombstones[q.id] ?? now
    for (const id of keep) delete tombstones[id]
    commit(
      {
        ...incoming,
        rooms: restamp(incoming.rooms),
        reservations: restamp(incoming.reservations),
        catalog: restamp(incoming.catalog),
        quotes: restamp(incoming.quotes),
        inquiries: restamp(incoming.inquiries),
        settingsAt: Object.fromEntries(Object.keys(incoming.settings).map((k) => [k, now])),
        tombstones,
        lastBackup: getData().lastBackup,
      },
      true,
    )
    return { reservations: incoming.reservations.length }
  }
  const known = new Set(getData().reservations.map((r) => r.id))
  const added = restamp(incoming.reservations.filter((r) => !known.has(r.id)))
  const maxFolio = Math.max(getData().settings.nextFolio, ...added.map((r) => r.folio + 1))
  const maxReceipt = Math.max(
    getData().settings.nextReceipt,
    ...added.flatMap((r) => r.payments.map((p) => p.receiptNo + 1)),
  )
  const roomIds = new Set(getData().rooms.map((r) => r.id))
  const newRooms = restamp(incoming.rooms.filter((r) => !roomIds.has(r.id)))
  const quoteIds = new Set(getData().quotes.map((q) => q.id))
  const newQuotes = restamp(incoming.quotes.filter((q) => !quoteIds.has(q.id)))
  const inqIds = new Set(getData().inquiries.map((q) => q.id))
  const newInq = restamp(incoming.inquiries.filter((q) => !inqIds.has(q.id)))
  const catIds = new Set(getData().catalog.map((c) => c.id))
  const newCats = restamp(incoming.catalog.filter((c) => !catIds.has(c.id)))
  const tombstones = { ...getData().tombstones }
  for (const x of [...added, ...newRooms, ...newQuotes, ...newCats, ...newInq]) delete tombstones[x.id]
  for (const r of added) for (const p of r.payments) delete tombstones[p.id]
  commit(
    {
      ...getData(),
      rooms: [...getData().rooms, ...newRooms],
      reservations: [...getData().reservations, ...added],
      quotes: [...getData().quotes, ...newQuotes],
      inquiries: [...getData().inquiries, ...newInq],
      catalog: [...getData().catalog, ...newCats],
      settings: { ...getData().settings, nextFolio: maxFolio, nextReceipt: maxReceipt },
      tombstones,
    },
    true,
  )
  return { reservations: added.length }
}

/** Une los datos de otro dispositivo (bajados del servidor) con los de este. Devuelve true si algo cambió. */
export function applyRemote(remote: AppData): boolean {
  const merged = mergeData(getData(), remote)
  if (fingerprintOf(merged) === fingerprintOf(getData())) return false
  commit(merged, true)
  return true
}

export function clearAll() {
  commit(emptyData())
}
