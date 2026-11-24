import type { Reservation, Room, Settings } from '../types'
import { isActive } from './availability'
import { addDays, formatShort, toDayNumber } from './dates'
import { folioLabel, roomNames } from './messages'

export type ReminderKind = 'd5' | 'd2' | 'd1' | 'd0'

export interface DueReminder {
  key: string
  kind: ReminderKind
  reservation: Reservation
}

const OFFSETS: Record<ReminderKind, number> = { d5: 5, d2: 2, d1: 1, d0: 0 }

function enabled(kind: ReminderKind, s: Settings): boolean {
  return { d5: s.remind5, d2: s.remind2, d1: s.remind1, d0: s.remindToday }[kind]
}

export function kindHour(kind: ReminderKind, s: Settings): number {
  return kind === 'd0' ? s.todayHour : s.morningHour
}

/** Momento local en que debe sonar el recordatorio. */
export function fireTime(r: Reservation, kind: ReminderKind, s: Settings): Date {
  const day = addDays(r.checkIn, -OFFSETS[kind])
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, kindHour(kind, s), 0, 0, 0)
}

/** Recordatorios que ya tocan y no se han mostrado (ventana de 24 h para no avisar de cosas viejas). */
export function dueReminders(reservations: Reservation[], s: Settings, sent: string[], now: Date = new Date()): DueReminder[] {
  const seen = new Set(sent)
  const out: DueReminder[] = []
  for (const r of reservations) {
    if (!isActive(r)) continue
    for (const kind of Object.keys(OFFSETS) as ReminderKind[]) {
      if (!enabled(kind, s)) continue
      const key = `${r.id}:${kind}:${r.checkIn}`
      if (seen.has(key)) continue
      const at = fireTime(r, kind, s).getTime()
      const t = now.getTime()
      if (t >= at && t - at < 24 * 3600 * 1000) out.push({ key, kind, reservation: r })
    }
  }
  return out
}

const WHEN: Record<ReminderKind, string> = {
  d5: 'Llega en 5 días',
  d2: 'Llega en 2 días',
  d1: 'Llega mañana',
  d0: 'Llega hoy',
}

export function reminderBody(d: DueReminder, rooms: Room[]): string {
  const r = d.reservation
  return `${WHEN[d.kind]}: ${r.guest} · ${roomNames(r, rooms)} · ${formatShort(r.checkIn)}${r.arrivalTime ? ` ${r.arrivalTime}` : ''} (${folioLabel(r.folio)})`
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  return Notification.requestPermission()
}

export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' })
      return
    }
  } catch {
    /* cae al constructor */
  }
  new Notification(title, { body, tag, icon: '/icon-192.png' })
}

// ---------- calendario .ics ----------

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsDate(iso: string): string {
  return iso.replaceAll('-', '')
}

function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ' ' + rest.slice(74)
  }
  out.push(rest)
  return out.join('\r\n')
}

/**
 * Evento de día completo por cada llegada, con alarmas a las horas configuradas.
 * El evento empieza a las 00:00 del día de llegada; "N días antes a las H" = −(N·24 − H) horas.
 */
export function buildIcs(reservations: Reservation[], rooms: Room[], s: Settings): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reservaciones Posada//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const r of reservations.filter(isActive)) {
    const alarms: [boolean, string, string][] = [
      [s.remind5, `-PT${5 * 24 - s.morningHour}H`, 'Llega en 5 días'],
      [s.remind2, `-PT${2 * 24 - s.morningHour}H`, 'Llega en 2 días'],
      [s.remind1, `-PT${24 - s.morningHour}H`, 'Llega mañana'],
      [s.remindToday, `PT${s.todayHour}H`, 'Llega hoy'],
    ]
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@reservaciones-posada`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(r.checkIn)}`,
      `DTEND;VALUE=DATE:${icsDate(r.checkOut)}`,
      fold(`SUMMARY:${icsEscape(`${r.guest} · ${roomNames(r, rooms)}`)}`),
      fold(`DESCRIPTION:${icsEscape(`${folioLabel(r.folio)} · ${r.guests} persona(s)\nTel: ${r.phone}\nEstado: ${r.status}`)}`),
    )
    for (const [on, trigger, label] of alarms) {
      if (!on) continue
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        fold(`DESCRIPTION:${icsEscape(`${label}: ${r.guest}`)}`),
        `TRIGGER;RELATED=START:${trigger}`,
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export function daysUntil(checkIn: string, today: string): number {
  return toDayNumber(checkIn) - toDayNumber(today)
}
