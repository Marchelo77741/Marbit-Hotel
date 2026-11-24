import type { AppData, SiteContent } from '../types'
import { conflictsForRoom, isActive } from './availability'
import { isUuid } from './cloudMap'
import { shrinkPhoto } from './publicSite'
import { supabase } from './supabase'

/**
 * Traslado de los datos del programa anterior (respaldo .json) a una posada de Marbit-Hotel.
 * Los ids antiguos («room-1», «hab1»…) no son uuid: se convierten de forma estable (mismo id antiguo + misma posada
 * = mismo uuid), así repetir la importación no duplica nada.
 */

export async function stableUuid(tenantId: string, oldId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`marbit-hotel:${tenantId}:${oldId}`)
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x40 // versión 4
  h[8] = (h[8] & 0x3f) | 0x80 // variante
  const x = [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

function allIds(d: AppData): string[] {
  return [
    ...d.rooms.map((x) => x.id),
    ...d.catalog.map((x) => x.id),
    ...d.inquiries.flatMap((x) => [x.id, x.roomId]),
    ...d.reservations.flatMap((r) => [r.id, r.quoteId ?? '', ...r.rooms.map((a) => a.roomId), ...r.payments.map((p) => p.id)]),
    ...d.quotes.flatMap((q) => [q.id, q.reservationId ?? '', ...q.lines.flatMap((l) => [l.id, l.catId])]),
    ...Object.keys(d.tombstones),
  ].filter((id) => id && !isUuid(id))
}

/** Cambia todos los ids que no son uuid, en todas partes donde se mencionan. */
export async function convertIds(d: AppData, tenantId: string): Promise<AppData> {
  const map = new Map<string, string>()
  await Promise.all([...new Set(allIds(d))].map(async (id) => map.set(id, await stableUuid(tenantId, id))))
  const m = (id: string): string => map.get(id) ?? id
  const mo = (id: string | undefined): string | undefined => (id ? m(id) : id)
  return {
    ...d,
    rooms: d.rooms.map((r) => ({ ...r, id: m(r.id) })),
    catalog: d.catalog.map((c) => ({ ...c, id: m(c.id) })),
    inquiries: d.inquiries.map((q) => ({ ...q, id: m(q.id), roomId: q.roomId ? m(q.roomId) : '' })),
    reservations: d.reservations.map((r) => ({
      ...r, id: m(r.id), quoteId: mo(r.quoteId),
      rooms: r.rooms.map((a) => ({ ...a, roomId: m(a.roomId) })),
      payments: r.payments.map((p) => ({ ...p, id: m(p.id) })),
    })),
    quotes: d.quotes.map((q) => ({
      ...q, id: m(q.id), reservationId: mo(q.reservationId),
      lines: q.lines.map((l) => ({ ...l, id: m(l.id), catId: m(l.catId) })),
    })),
    tombstones: Object.fromEntries(Object.entries(d.tombstones).map(([id, t]) => [m(id), t])),
  }
}

/** Reservaciones que apuntan a una habitación que no está en el respaldo (la nube las rechazaría). */
export function orphanRoomRefs(d: AppData): number {
  const ids = new Set(d.rooms.map((r) => r.id))
  return d.reservations.filter((r) => r.rooms.some((a) => !ids.has(a.roomId))).length
}

/** Reservaciones activas que comparten habitación y noches con otra anterior en la lista (la nube las marcaría en conflicto). */
export function overlapCount(d: AppData): number {
  const seen: AppData['reservations'] = []
  let n = 0
  for (const r of d.reservations) {
    if (!isActive(r)) continue
    if (r.rooms.some((a) => conflictsForRoom(a.roomId, r.checkIn, r.checkOut, seen).length > 0)) n++
    else seen.push(r)
  }
  return n
}

// ---------- fotos ----------

/** Fotos que viven en el servidor anterior (ni enlace https ni ruta de Supabase). */
export function legacyPhotoRefs(d: AppData): string[] {
  const s: SiteContent = d.settings.site
  const refs = [
    ...d.rooms.flatMap((r) => r.photos ?? []),
    ...s.hero.slides,
    ...s.gallery.map((g) => g.photo),
    ...s.testimonials.map((t) => t.photo),
  ]
  return [...new Set(refs.filter((r) => r && !/^https?:\/\//.test(r) && !r.includes('/')))]
}

export function remapPhotos(d: AppData, map: Record<string, string>): AppData {
  const f = (r: string): string => map[r] ?? r
  const s = d.settings.site
  return {
    ...d,
    rooms: d.rooms.map((r) => (r.photos?.length ? { ...r, photos: r.photos.map(f) } : r)),
    settings: {
      ...d.settings,
      site: {
        ...s,
        hero: { ...s.hero, slides: s.hero.slides.map(f) },
        gallery: s.gallery.map((g) => ({ ...g, photo: f(g.photo) })),
        testimonials: s.testimonials.map((t) => ({ ...t, photo: f(t.photo) })),
      },
    },
  }
}

/** Baja cada foto del servidor anterior y la sube a Supabase (misma foto = mismo nombre, se puede repetir sin duplicar). */
export async function migratePhotos(
  refs: string[], tenantId: string, oldBase: string, onProgress: (done: number, total: number) => void,
): Promise<{ map: Record<string, string>; failed: string[] }> {
  const map: Record<string, string> = {}
  const failed: string[] = []
  let done = 0
  for (const ref of refs) {
    try {
      const res = await fetch(`${oldBase.replace(/\/$/, '')}/pub/foto/${ref}.jpg`)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const file = new File([blob], `${ref}.jpg`, { type: 'image/jpeg' })
      const small = file.size > 600_000 ? await shrinkPhoto(file) : blob
      const path = `${tenantId}/${ref}.jpg`
      const { error } = await supabase!.storage.from('tenant-photos').upload(path, small, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
      if (error) throw error
      map[ref] = path
    } catch {
      failed.push(ref)
    }
    onProgress(++done, refs.length)
  }
  return { map, failed }
}

