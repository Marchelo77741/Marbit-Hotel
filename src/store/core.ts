import { useSyncExternalStore } from 'react'
import type { AppData, Settings } from '../types'
import { emptyData, normalizeData } from './defaults'

/** Núcleo del almacenamiento: estado en memoria, guardado en el dispositivo y suscripciones. */
export const KEY = 'posada-reservaciones:v1'

function load(): AppData {
  try {
    const txt = localStorage.getItem(KEY)
    return txt ? normalizeData(JSON.parse(txt)) : emptyData()
  } catch {
    return emptyData()
  }
}

let state: AppData = load()
const listeners = new Set<() => void>()

const COUNTERS = ['nextFolio', 'nextReceipt', 'nextQuote', 'quoteYear']

function settingsStamps(a: Settings, b: Settings, at: Record<string, string>, now: string): Record<string, string> {
  const out = { ...at }
  for (const k of Object.keys(b) as (keyof Settings)[]) if (!COUNTERS.includes(k) && a[k] !== b[k]) out[k] = now
  return out
}

/** Marca la hora de lo modificado y anota lo borrado, para poder unir cambios con otros dispositivos. */
function track(prev: AppData, next: AppData): AppData {
  const now = new Date().toISOString()
  const stampList = <T extends { id: string; updatedAt?: string }>(p: T[], n: T[]): T[] => {
    const old = new Map(p.map((x) => [x.id, x]))
    return n.map((x) => (old.get(x.id) === x ? x : { ...x, updatedAt: now }))
  }
  const ids = (d: AppData) =>
    new Set<string>([
      ...d.rooms.map((x) => x.id),
      ...d.reservations.map((x) => x.id),
      ...d.reservations.flatMap((r) => r.payments.map((p) => p.id)),
      ...d.catalog.map((x) => x.id),
      ...d.quotes.map((x) => x.id),
      ...d.inquiries.map((x) => x.id),
    ])
  const tombstones = { ...next.tombstones }
  const after = ids(next)
  for (const id of ids(prev)) if (!after.has(id) && !tombstones[id]) tombstones[id] = now
  return {
    ...next,
    rooms: stampList(prev.rooms, next.rooms),
    reservations: stampList(prev.reservations, next.reservations),
    catalog: stampList(prev.catalog, next.catalog),
    quotes: stampList(prev.quotes, next.quotes),
    inquiries: stampList(prev.inquiries, next.inquiries),
    settingsAt: settingsStamps(prev.settings, next.settings, next.settingsAt, now),
    tombstones,
  }
}

/** sync = true: los datos ya traen sus marcas (viene de otro dispositivo o de un respaldo). */
export function commit(next: AppData, sync = false) {
  state = sync ? next : track(state, next)
  next = state
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    alert('No se pudo guardar en este dispositivo (¿almacenamiento lleno o bloqueado?). Descarga un respaldo.')
  }
  listeners.forEach((l) => l())
}

export function useData(): AppData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export function getData(): AppData {
  return state
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Marca que se hizo un respaldo (en el servidor) sin descargar nada. */
export function markBackedUp(iso: string) {
  commit({ ...state, lastBackup: iso })
}

export function uid(): string {
  return crypto.randomUUID()
}

