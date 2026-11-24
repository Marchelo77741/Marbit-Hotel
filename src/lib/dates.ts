/** Todas las fechas de estancia son cadenas YYYY-MM-DD; se opera en días UTC para evitar problemas de zona horaria. */

const MS_DAY = 86_400_000

export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY)
}

export function fromDayNumber(n: number): string {
  const dt = new Date(n * MS_DAY)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days)
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return toDayNumber(checkOut) - toDayNumber(checkIn)
}

/** Fecha local de hoy como YYYY-MM-DD */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Dos estancias [aIn,aOut) y [bIn,bOut) se empalman si comparten al menos una noche. */
export function overlaps(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return toDayNumber(aIn) < toDayNumber(bOut) && toDayNumber(bIn) < toDayNumber(aOut)
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function weekdayShort(iso: string): string {
  return WEEKDAYS[new Date(toDayNumber(iso) * MS_DAY).getUTCDay()]
}

/** 0 = domingo … 6 = sábado */
export function weekdayIndex(iso: string): number {
  return new Date(toDayNumber(iso) * MS_DAY).getUTCDay()
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

/** "7 nov" */
export function formatShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** "vie 7 de noviembre de 2026" */
export function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${weekdayShort(iso)} ${d} de ${MONTHS_LONG[m - 1]} de ${y}`
}

export function formatDateTime(isoDateTime: string): string {
  const dt = new Date(isoDateTime)
  return `${formatShort(todayISO(dt))} ${dt.getFullYear()}, ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

export function isValidISO(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDayNumber(toDayNumber(s)) === s
}
