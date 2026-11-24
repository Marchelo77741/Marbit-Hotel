import { addInquiries, getData } from '../store'
import type { Inquiry, Room } from '../types'
import { getRemote, isConfigured, serverCall, failFrom } from './remoteBackup'
import { nightlyDefault } from './availability'

/** Conexión con la página web: fotos de las habitaciones, datos públicos y solicitudes que llegan de la página. */

export const PHOTO_MAX_PX = 1600

/** Una foto puede ser un enlace (https://…) o el id de una foto subida al servidor. */
export function photoUrl(ref: string): string {
  return /^https?:\/\//.test(ref) ? ref : `${getRemote().url}/pub/foto/${ref}.jpg`
}

/** Reduce la foto (máx. 1600 px) y la convierte a JPEG para que pese poco. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, PHOTO_MAX_PX / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', 0.82))
}

export async function uploadPhoto(file: File): Promise<string> {
  if (!isConfigured()) throw new Error('Primero configura el servidor en Ajustes (Respaldo y sincronización).')
  const blob = await shrinkPhoto(file)
  const res = await serverCall('/fotos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }, 60_000)
  if (!res.ok) throw await failFrom(res)
  return (await res.json()).id as string
}

export async function deletePhoto(id: string): Promise<void> {
  if (!isConfigured()) return
  try {
    await serverCall(`/fotos/${id}`, { method: 'DELETE' })
  } catch {
    /* si no se pudo borrar en el servidor, la foto queda huérfana pero no estorba */
  }
}

/** Lo que la página puede ver de cada habitación (nada de reservaciones ni de huéspedes). */
export function publicRooms(rooms: Room[], base: { rateSencilla: number; rateDoble: number }) {
  return rooms
    .filter((r) => r.active && (r.status ?? 'disponible') !== 'oculta')
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      description: r.description ?? '',
      status: r.status === 'no-disponible' ? 'no-disponible' : 'disponible',
      photos: r.photos ?? [],
      price: r.showPrice ? (r.publicPrice && r.publicPrice > 0 ? r.publicPrice : nightlyDefault(r, base.rateSencilla, base.rateDoble)) : null,
    }))
}

let lastPublished = ''
let lastSite = ''

/** Publica las habitaciones en el servidor (solo si cambiaron) y baja las solicitudes nuevas. Devuelve cuántas solicitudes llegaron. */
export async function syncPublicSite(): Promise<number> {
  let fresh = 0
  try {
    const d = getData()
    const body = JSON.stringify({ rooms: publicRooms(d.rooms, d.settings) })
    if (body !== lastPublished) {
      const res = await serverCall('/publico/habitaciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (res.ok) lastPublished = body
    }
    const site = JSON.stringify(d.settings.site)
    if (site !== lastSite) {
      const res = await serverCall('/publico/sitio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: site })
      if (res.ok) lastSite = site
    }
    const inbox = await serverCall('/solicitudes')
    if (inbox.ok) {
      const list = ((await inbox.json()).solicitudes ?? []) as Omit<Inquiry, 'status'>[]
      fresh = addInquiries(list)
      // ya quedaron guardadas en la app: se quitan de la bandeja del servidor
      for (const i of list) await serverCall(`/solicitudes/${i.id}`, { method: 'DELETE' })
    }
  } catch {
    /* la página es opcional: un fallo aquí no debe afectar el respaldo */
  }
  return fresh
}
