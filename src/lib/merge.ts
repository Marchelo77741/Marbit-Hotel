import type { AppData, Payment, Reservation, Settings } from '../types'

/** Unión de datos de dos dispositivos, registro por registro (gana lo modificado más recientemente; los borrados se respetan). */

export const EPOCH = '2000-01-01T00:00:00.000Z'
const TOMB_KEEP_MS = 400 * 86_400_000

type Rec = { id: string; updatedAt?: string }

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** Huella del contenido que se sincroniza: no depende del orden de las listas ni de cuándo se respaldó. */
export function fingerprint(d: AppData): string {
  const byId = <T extends Rec>(l: T[]) => [...l].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const text = stableStringify({
    rooms: byId(d.rooms),
    reservations: byId(d.reservations).map((r) => ({ ...r, payments: byId(r.payments) })),
    catalog: byId(d.catalog),
    quotes: byId(d.quotes),
    inquiries: byId(d.inquiries),
    settings: d.settings,
    settingsAt: d.settingsAt,
    tombstones: d.tombstones,
  })
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${text.length}:${h >>> 0}`
}

function newer<T extends Rec>(a: T, b: T): T {
  const ta = a.updatedAt ?? EPOCH
  const tb = b.updatedAt ?? EPOCH
  if (ta !== tb) return ta > tb ? a : b
  return stableStringify(a) >= stableStringify(b) ? a : b // empate: elección determinista
}

function mergeList<T extends Rec>(local: T[], remote: T[], tomb: Record<string, string>, fix?: (w: T, a?: T, b?: T) => T): T[] {
  const rem = new Map(remote.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const out: T[] = []
  const take = (id: string, a?: T, b?: T) => {
    const w = a && b ? newer(a, b) : (a ?? b)!
    const t = tomb[id]
    if (t && t >= (w.updatedAt ?? EPOCH)) return // borrado después de su última modificación
    out.push(fix ? fix(w, a, b) : w)
  }
  for (const l of local) {
    seen.add(l.id)
    take(l.id, l, rem.get(l.id))
  }
  for (const r of remote) if (!seen.has(r.id)) take(r.id, undefined, r)
  return out
}

function mergePayments(w: Reservation, a?: Reservation, b?: Reservation, tomb: Record<string, string> = {}): Reservation {
  const all = new Map<string, Payment>()
  for (const p of [...(a?.payments ?? []), ...(b?.payments ?? [])]) if (!all.has(p.id)) all.set(p.id, p)
  const wIds = new Set(w.payments.map((p) => p.id))
  // conserva el orden del ganador y agrega los pagos que solo tiene el otro lado
  const merged = [...w.payments, ...[...all.values()].filter((p) => !wIds.has(p.id))]
  return { ...w, payments: merged.filter((p) => !tomb[p.id]) }
}

function pickSettings(local: AppData, remote: AppData): { settings: Settings; at: Record<string, string> } {
  const loc = local.settings
  const rem = remote.settings
  const out: Record<string, unknown> = {}
  const at: Record<string, string> = {}
  for (const k of Object.keys({ ...rem, ...loc }) as (keyof Settings)[]) {
    const ta = local.settingsAt[k] ?? EPOCH
    const tb = remote.settingsAt[k] ?? EPOCH
    const useLocal = ta !== tb ? ta > tb : stableStringify(loc[k]) >= stableStringify(rem[k])
    out[k] = useLocal ? loc[k] : rem[k]
    if (ta !== EPOCH || tb !== EPOCH) at[k] = ta > tb ? ta : tb
  }
  // los contadores nunca retroceden
  const quoteSide =
    loc.quoteYear !== rem.quoteYear ? (loc.quoteYear > rem.quoteYear ? loc : rem) : loc.nextQuote >= rem.nextQuote ? loc : rem
  out.nextFolio = Math.max(loc.nextFolio, rem.nextFolio)
  out.nextReceipt = Math.max(loc.nextReceipt, rem.nextReceipt)
  out.quoteYear = quoteSide.quoteYear
  out.nextQuote = quoteSide.nextQuote
  return { settings: out as unknown as Settings, at }
}

export function mergeData(local: AppData, remote: AppData, now = Date.now()): AppData {
  const tomb: Record<string, string> = {}
  for (const [id, t] of Object.entries({ ...remote.tombstones, ...local.tombstones })) {
    const mine = local.tombstones[id]
    const theirs = remote.tombstones[id]
    const latest = mine && theirs ? (mine > theirs ? mine : theirs) : (mine ?? theirs)!
    if (now - new Date(latest).getTime() < TOMB_KEEP_MS) tomb[id] = latest
    void t
  }

  const reservations = mergeList(local.reservations, remote.reservations, tomb, (w, a, b) => mergePayments(w, a, b, tomb))
  const { settings, at: settingsAt } = pickSettings(local, remote)
  settings.nextFolio = Math.max(settings.nextFolio, ...reservations.map((r) => r.folio + 1))
  settings.nextReceipt = Math.max(settings.nextReceipt, ...reservations.flatMap((r) => r.payments.map((p) => p.receiptNo + 1)))

  return {
    version: 1,
    rooms: mergeList(local.rooms, remote.rooms, tomb),
    reservations,
    catalog: mergeList(local.catalog, remote.catalog, tomb),
    quotes: mergeList(local.quotes, remote.quotes, tomb),
    inquiries: mergeList(local.inquiries, remote.inquiries, tomb),
    settings,
    settingsAt,
    tombstones: tomb,
    sentReminders: Array.from(new Set([...remote.sentReminders, ...local.sentReminders])).slice(-500),
    lastBackup: local.lastBackup,
  }
}
