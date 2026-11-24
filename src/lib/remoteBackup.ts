import { applyRemote, getData, importBackup, markBackedUp, normalizeData, subscribe } from '../store'
import { fingerprint } from './merge'
import { syncPublicSite } from './publicSite'

/**
 * Respaldo opcional en el servidor propio (servicio de «servidor-respaldos»).
 * La dirección y la clave se guardan aparte de los datos, así NO viajan dentro de los archivos de respaldo.
 */

const KEY = 'posada-reservaciones:remote'

export interface RemoteConfig {
  url: string
  key: string
  auto: boolean
  /** ISO del último envío correcto */
  lastOk: string | null
  /** ISO de la última revisión correcta del servidor */
  lastPull: string | null
  /** ISO de la última vez que llegaron cambios de otro dispositivo */
  lastNews: string | null
  lastError: string | null
}

export interface RemoteBackupInfo {
  name: string
  at: string
  size: number
  reservations: number | null
  quotes: number | null
}

const empty: RemoteConfig = { url: '', key: '', auto: true, lastOk: null, lastPull: null, lastNews: null, lastError: null }
let cfg: RemoteConfig = loadCfg()
const listeners = new Set<() => void>()

function loadCfg(): RemoteConfig {
  try {
    const t = localStorage.getItem(KEY)
    return t ? { ...empty, ...JSON.parse(t) } : { ...empty }
  } catch {
    return { ...empty }
  }
}

function setCfg(patch: Partial<RemoteConfig>) {
  cfg = { ...cfg, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* sin almacenamiento: se usa solo en memoria */
  }
  listeners.forEach((l) => l())
}

export function getRemote(): RemoteConfig {
  return cfg
}

export function subscribeRemote(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function saveRemote(patch: Partial<RemoteConfig>) {
  const next = { ...patch }
  if (typeof next.url === 'string') next.url = normalizeUrl(next.url)
  if (typeof next.key === 'string') next.key = next.key.trim()
  setCfg(next)
}

export function normalizeUrl(u: string): string {
  let s = u.trim().replace(/\/+$/, '')
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`
  return s
}

export function isConfigured(): boolean {
  return !!cfg.url && !!cfg.key
}

// ---------- red ----------

export async function serverCall(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(`${cfg.url}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${cfg.key}`, ...(init.headers || {}) },
    })
  } finally {
    clearTimeout(timer)
  }
}

function explain(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return 'El servidor tardó demasiado en responder.'
  if (e instanceof Error && e.message) return e.message
  return 'No se pudo conectar con el servidor (¿sin internet o servidor apagado?).'
}

export async function failFrom(res: Response): Promise<Error> {
  if (res.status === 401) return new Error('La clave no es correcta.')
  if (res.status === 429) return new Error('Demasiados intentos con clave incorrecta; espera unos minutos.')
  let detail = ''
  try {
    detail = (await res.json()).error || ''
  } catch {
    /* sin detalle */
  }
  return new Error(detail || `El servidor respondió ${res.status}.`)
}

export async function testConnection(): Promise<void> {
  const res = await serverCall('/backups', {}, 12_000)
  if (!res.ok) throw await failFrom(res)
}

let sending = false

/**
 * Sincroniza: baja lo último del servidor, lo une con lo de este dispositivo (sin pisar nada) y,
 * si este dispositivo tiene algo que el servidor no, lo sube.
 */
export async function pushBackup(opts: { force?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  if (!isConfigured()) return { ok: false, message: 'Falta configurar la dirección y la clave del servidor.' }
  if (sending) return { ok: false, message: 'Ya hay una sincronización en curso.' }
  sending = true
  try {
    let remote: ReturnType<typeof normalizeData> | null = null
    const got = await serverCall('/backups/latest')
    if (got.status !== 404) {
      if (!got.ok) throw await failFrom(got)
      remote = normalizeData(JSON.parse(await got.text()))
    }
    const news = remote ? applyRemote(remote) : false
    const local = getData()
    const hasContent = local.reservations.length > 0 || local.quotes.length > 0 || Object.keys(local.tombstones).length > 0
    const needPush = opts.force || (hasContent && (!remote || fingerprint(remote) !== fingerprint(local)))
    if (needPush) {
      const res = await serverCall('/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getData()),
      })
      if (!res.ok) throw await failFrom(res)
    }
    const now = new Date().toISOString()
    setCfg({ lastPull: now, ...(needPush ? { lastOk: now } : {}), ...(news ? { lastNews: now } : {}), lastError: null })
    if (needPush) markBackedUp(now)
    const newInquiries = await syncPublicSite()
    const message = newInquiries > 0
      ? `Llegaron ${newInquiries} solicitud${newInquiries === 1 ? '' : 'es'} nueva${newInquiries === 1 ? '' : 's'} de la página.`
      : news
      ? needPush
        ? 'Se trajeron cambios de otro dispositivo y se guardó todo en el servidor.'
        : 'Se trajeron cambios de otro dispositivo.'
      : needPush
        ? 'Respaldo guardado en el servidor.'
        : 'Todo está al día.'
    return { ok: true, message }
  } catch (e) {
    const message = explain(e)
    setCfg({ lastError: message })
    return { ok: false, message }
  } finally {
    sending = false
  }
}

export async function listBackups(): Promise<RemoteBackupInfo[]> {
  const res = await serverCall('/backups')
  if (!res.ok) throw await failFrom(res)
  return (await res.json()).backups as RemoteBackupInfo[]
}

export async function restoreBackup(name: string, mode: 'replace' | 'merge'): Promise<number> {
  const res = await serverCall(`/backups/${encodeURIComponent(name)}`)
  if (!res.ok) throw await failFrom(res)
  const { reservations } = importBackup(await res.text(), mode)
  return reservations
}

// ---------- sincronización automática ----------

let started = false

/**
 * Sincroniza solo: al abrir la app, al volver a ella, al recuperar internet, cada 3 minutos mientras está abierta
 * y unos segundos después de cada cambio. Una app web no puede correr con la pantalla apagada o cerrada,
 * por eso se hace cuando la usas.
 */
export function startAutoBackup() {
  if (started) return
  started = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const active = () => cfg.auto && isConfigured()
  const schedule = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (active()) void pushBackup()
    }, ms)
  }
  let lastFp = fingerprint(getData())
  subscribe(() => {
    const fp = fingerprint(getData())
    if (fp === lastFp) return
    lastFp = fp
    if (active()) schedule(20_000)
  })
  const check = () => active() && schedule(2_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  window.addEventListener('online', check)
  setInterval(() => document.visibilityState === 'visible' && active() && void pushBackup(), 3 * 60_000)
  check()
}
