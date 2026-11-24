import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Reservation, Room, Settings } from '../types'
import { balance, findDoubleBookings, isActive, paidAmount } from './availability'
import {
  addDays,
  dayOfMonth,
  formatShort,
  nightsBetween,
  todayISO,
  toDayNumber,
  weekdayIndex,
  weekdayShort,
} from './dates'
import { money } from './messages'
import { LOGO_RATIO, logoDataUrl } from './brand'

export interface PdfOptions {
  /** primer día del calendario (YYYY-MM-DD) */
  start: string
  days: number
  includePending: boolean
  includeAmounts: boolean
}

export interface PdfResult {
  blob: Blob
  fileName: string
  count: number
  endInclusive: string
}

type RGB = [number, number, number]
const GREEN: RGB = [61, 107, 79]
const AMBER: RGB = [224, 168, 46]
const INK: RGB = [42, 42, 38]
const MUTED: RGB = [109, 106, 96]
const LINE: RGB = [208, 202, 188]
const OFF: RGB = [241, 238, 231]

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

/** Reservaciones activas que ocupan al menos una noche del periodo, o que salen en él (incluido el primer día). */
export function reservationsForPeriod(reservations: Reservation[], o: Pick<PdfOptions, 'start' | 'days' | 'includePending'>): Reservation[] {
  const end = addDays(o.start, o.days)
  return reservations
    .filter((r) => isActive(r) && (o.includePending || r.status === 'confirmada'))
    .filter((r) => r.checkIn < end && r.checkOut >= o.start)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.folio - b.folio)
}

/** [2,3,4,7] → "2-4,7" */
export function compressNumbers(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]))
    i = j + 1
  }
  return parts.join(',')
}

export function roomsShort(r: Reservation, rooms: Room[]): string {
  if (r.rooms.length === 0) return 'sin hab.'
  const names = r.rooms.map((a) => rooms.find((x) => x.id === a.roomId)?.name ?? '?')
  const nums = names.map((n) => parseInt(n, 10))
  if (nums.every((n) => !Number.isNaN(n))) return 'H' + compressNumbers(nums)
  return 'H' + names.join(',')
}

/** «PAGADO» o «DEBE $1,400», para quien recibe a los huéspedes. */
function payTag(r: Reservation): string {
  const b = balance(r)
  return b > 0 ? `DEBE ${money(b).replace(/\.00$/, '')}` : 'PAGADO'
}

interface Entry {
  kind: 'arrive' | 'stay' | 'leave'
  r: Reservation
  text: string
}

function entriesForDay(day: string, list: Reservation[], rooms: Room[]): Entry[] {
  const arrive: Entry[] = []
  const stay: Entry[] = []
  const leave: Entry[] = []
  for (const r of list) {
    const label = `${r.guest.trim() || 'Sin nombre'} (${roomsShort(r, rooms)})`
    // en las llegadas se indica si ya pagó o cuánto debe, para quien recibe al huésped
    if (r.checkIn === day) arrive.push({ kind: 'arrive', r, text: `${payTag(r)}: ${label}` })
    else if (r.checkIn < day && day < r.checkOut) stay.push({ kind: 'stay', r, text: label })
    if (r.checkOut === day) leave.push({ kind: 'leave', r, text: `Sale: ${label}` })
  }
  return [...arrive, ...stay, ...leave]
}

function fit(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text
  let s = text
  while (s.length > 1 && doc.getTextWidth(s + '...') > maxW) s = s.slice(0, -1)
  return s.trimEnd() + '...'
}

function rangeLabel(start: string, endInclusive: string): string {
  const year = endInclusive.slice(0, 4)
  if (start === endInclusive) return `${weekdayShort(start)} ${formatShort(start)} ${year}`
  return `${formatShort(start)} - ${formatShort(endInclusive)} ${year}`
}

export function buildSchedulePdf(
  data: { reservations: Reservation[]; rooms: Room[]; settings: Settings },
  o: PdfOptions,
): PdfResult {
  const { rooms, settings } = data
  const list = reservationsForPeriod(data.reservations, o)
  const endExclusive = addDays(o.start, o.days)
  const endInclusive = addDays(o.start, o.days - 1)
  const today = todayISO()
  const clashes = findDoubleBookings(data.reservations)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const H = 210
  const M = 10

  const LOGO_H = 15
  const TX = M + LOGO_H * LOGO_RATIO + 3
  const pageHeader = (subtitle: string) => {
    doc.addImage(logoDataUrl, 'JPEG', M, 3.6, LOGO_H * LOGO_RATIO, LOGO_H)
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...GREEN)
    doc.text(settings.businessName, TX, 12)
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK)
    doc.text(`${subtitle}  |  ${rangeLabel(o.start, endInclusive)}`, TX, 18)
  }

  // ---------------- Página 1: calendario ----------------
  pageHeader(o.days === 1 ? 'Reservaciones del día' : 'Calendario de reservaciones')
  doc.setFontSize(8).setTextColor(...MUTED)
  doc.text(`${list.length} ${list.length === 1 ? 'reservación' : 'reservaciones'} en el periodo`, W - M, 12, { align: 'right' })

  // leyenda
  const drawLegend = (grid: boolean) => {
  const ly = H - 9
  doc.setFontSize(7.5)
  let lx = M
  const legend = (c: RGB | null, text: string, style: 'normal' | 'bold' | 'italic') => {
    if (c) doc.setFillColor(...c).rect(lx, ly - 2.2, 2.4, 2.4, 'F')
    else doc.setDrawColor(...MUTED).setLineWidth(0.15).rect(lx, ly - 2.2, 2.4, 2.4, 'S')
    doc.setFont('helvetica', style).setTextColor(...INK)
    doc.text(text, lx + 3.4, ly)
    lx += 3.4 + doc.getTextWidth(text) + 6
  }
  legend(GREEN, 'Confirmada', 'normal')
  legend(AMBER, 'Pendiente de confirmar', 'normal')
  legend(null, 'Sale (no ocupa esa noche)', 'italic')
  doc.setFont('helvetica', 'bold').setTextColor(...INK)
  doc.text(grid ? 'Negrita = llega ese día  |  H = habitación' : 'H = habitación', lx, ly)
  }


  const drawGrid = () => {
  const gridStart = addDays(o.start, -weekdayIndex(o.start))
  const lastIdx = weekdayIndex(endInclusive)
  const gridEndExclusive = addDays(endInclusive, 7 - lastIdx)
  const weeks = Math.round((toDayNumber(gridEndExclusive) - toDayNumber(gridStart)) / 7)
  const colW = (W - 2 * M) / 7
  const headH = 5.5
  const yHead = 22
  const yTop = yHead + headH
  const yBottom = H - 14
  const avail = yBottom - yTop

  const inRange = (d: string) => d >= o.start && d < endExclusive
  const dayEntries = new Map<string, Entry[]>()
  for (let d = o.start; d < endExclusive; d = addDays(d, 1)) dayEntries.set(d, entriesForDay(d, list, rooms))

  const weekMax = Array.from({ length: weeks }, (_, w) => {
    let max = 0
    for (let i = 0; i < 7; i++) max = Math.max(max, dayEntries.get(addDays(gridStart, w * 7 + i))?.length ?? 0)
    return max
  })

  let fs = 5.5
  let rowH = weekMax.map(() => avail / weeks)
  for (const size of [7.5, 7, 6.5, 6, 5.5]) {
    const lineH = size * 0.3528 * 1.3
    const heights = weekMax.map((m) => Math.max(14, 8 + m * lineH))
    if (heights.reduce((s, h) => s + h, 0) <= avail) {
      fs = size
      const extra = (avail - heights.reduce((s, h) => s + h, 0)) / weeks
      rowH = heights.map((h) => h + Math.min(extra, 6))
      break
    }
  }
  const lineH = fs * 0.3528 * 1.3

  // encabezado de días
  doc.setFillColor(...GREEN).rect(M, yHead, W - 2 * M, headH, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(255, 255, 255)
  WEEKDAYS.forEach((n, i) => doc.text(n, M + i * colW + colW / 2, yHead + 3.8, { align: 'center' }))

  let y = yTop
  for (let w = 0; w < weeks; w++) {
    const h = rowH[w]
    for (let i = 0; i < 7; i++) {
      const d = addDays(gridStart, w * 7 + i)
      const x = M + i * colW
      const active = inRange(d)
      doc.setDrawColor(...LINE).setLineWidth(0.2)
      if (active) doc.setFillColor(255, 255, 255)
      else doc.setFillColor(...OFF)
      doc.rect(x, y, colW, h, 'FD')
      if (!active) continue

      // número del día
      const showMonth = dayOfMonth(d) === 1 || d === o.start
      const label = showMonth ? `${dayOfMonth(d)} ${formatShort(d).split(' ')[1]}` : String(dayOfMonth(d))
      doc.setFont('helvetica', 'bold').setFontSize(8)
      if (d === today) {
        const tw = doc.getTextWidth(label) + 2.4
        doc.setFillColor(...GREEN).roundedRect(x + 1, y + 0.9, tw, 4, 1, 1, 'F')
        doc.setTextColor(255, 255, 255)
      } else {
        doc.setTextColor(...INK)
      }
      doc.text(label, x + 2.2, y + 3.9)

      // entradas
      const entries = dayEntries.get(d) ?? []
      const maxLines = Math.max(1, Math.floor((h - 7.6) / lineH))
      const shown = entries.length > maxLines ? entries.slice(0, maxLines - 1) : entries
      let ly = y + 8.2
      for (const e of shown) {
        const isLeave = e.kind === 'leave'
        doc.setFont('helvetica', e.kind === 'arrive' ? 'bold' : isLeave ? 'italic' : 'normal').setFontSize(fs)
        const sq = Math.min(1.7, lineH * 0.7)
        if (isLeave) {
          doc.setDrawColor(...MUTED).setLineWidth(0.15).rect(x + 1.2, ly - sq + 0.2, sq, sq, 'S')
          doc.setTextColor(...MUTED)
        } else {
          const c = e.r.status === 'confirmada' ? GREEN : AMBER
          doc.setFillColor(...c).rect(x + 1.2, ly - sq + 0.2, sq, sq, 'F')
          doc.setTextColor(...INK)
        }
        doc.text(fit(doc, e.text, colW - 2.4 - sq - 1.2), x + 1.2 + sq + 0.9, ly)
        ly += lineH
      }
      if (entries.length > shown.length) {
        doc.setFont('helvetica', 'italic').setFontSize(fs).setTextColor(...MUTED)
        doc.text(`+${entries.length - shown.length} más`, x + 2, ly)
      }
    }
    y += h
  }

    drawLegend(true)
  }

  // Periodos cortos (hoy, 3 y 7 días): una columna por día, con llegadas, hospedados y salidas en grande.
  const drawAgenda = () => {
    const n = o.days
    const colW = (W - 2 * M) / n
    const top = 22
    const bottom = H - 14
    const wide = n <= 3
    const fs = n === 1 ? 11 : n <= 3 ? 10 : 8.5
    const lh = fs * 0.3528 * 1.35
    const sq = Math.min(2.4, lh * 0.65)
    for (let i = 0; i < n; i++) {
      const d = addDays(o.start, i)
      const x = M + i * colW
      doc.setDrawColor(...LINE).setLineWidth(0.2).setFillColor(255, 255, 255).rect(x, top, colW, bottom - top, 'FD')
      doc.setFillColor(...(d === today ? GREEN : [86, 128, 101] as RGB)).rect(x, top, colW, 9, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(n === 1 ? 12 : 10).setTextColor(255, 255, 255)
      doc.text(`${weekdayShort(d)} ${formatShort(d)}${d === today ? '  (HOY)' : ''}`, x + 3, top + 6)

      const es = entriesForDay(d, list, rooms)
      const groups: [string, Entry['kind'], RGB][] = [
        ['LLEGAN', 'arrive', GREEN],
        ['HOSPEDADOS', 'stay', INK],
        ['SALEN', 'leave', MUTED],
      ]
      let y = top + 9 + 5
      let room = true
      for (const [title, kind, color] of groups) {
        const items = es.filter((e) => e.kind === kind)
        if (items.length === 0) continue
        doc.setFont('helvetica', 'bold').setFontSize(fs - 1.5).setTextColor(...color)
        doc.text(`${title} (${items.length})`, x + 3, y)
        y += lh * 0.9
        for (const e of items) {
          const r = e.r
          const hab = roomsShort(r, rooms).replace(/^H/, '')
          const habTxt = r.rooms.length === 0 ? 'sin hab.' : r.rooms.length === 1 ? `Hab. ${hab}` : `Habs. ${hab}`
          const name = r.guest.trim() || 'Sin nombre'
          const parts = [
            habTxt,
            `${r.guests} ${r.guests === 1 ? 'persona' : 'personas'}`,
            kind === 'arrive' && r.arrivalTime ? `llega ${r.arrivalTime}` : '',
            kind === 'leave' ? '' : payTag(r),
            r.status === 'confirmada' ? '' : 'pendiente',
            wide ? r.phone : '',
          ].filter(Boolean)
          const extra = parts.join('  |  ')
          doc.setFont('helvetica', 'bold').setFontSize(fs)
          const nameLines: string[] = doc.splitTextToSize(name, colW - 10)
          doc.setFont('helvetica', 'normal').setFontSize(fs - 1)
          const extraLines: string[] = doc.splitTextToSize(extra, colW - 10)
          const need = (nameLines.length + extraLines.length) * lh + 2
          if (y + need > bottom - 3) {
            room = false
            break
          }
          const c = r.status === 'confirmada' ? GREEN : AMBER
          if (kind === 'leave') doc.setDrawColor(...MUTED).setLineWidth(0.15).rect(x + 3, y - sq + 0.3, sq, sq, 'S')
          else doc.setFillColor(...c).rect(x + 3, y - sq + 0.3, sq, sq, 'F')
          doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(...(kind === 'leave' ? MUTED : INK))
          nameLines.forEach((t, k) => doc.text(t, x + 3 + sq + 1.5, y + k * lh))
          y += nameLines.length * lh
          doc.setFont('helvetica', 'normal').setFontSize(fs - 1).setTextColor(...MUTED)
          extraLines.forEach((t, k) => doc.text(t, x + 3 + sq + 1.5, y + k * lh))
          y += extraLines.length * lh + 2
        }
        if (!room) {
          doc.setFont('helvetica', 'italic').setFontSize(fs - 1).setTextColor(...MUTED)
          doc.text('... hay más; ver la lista de detalles', x + 3, bottom - 3)
          break
        }
        y += 2
      }
      if (es.length === 0) {
        doc.setFont('helvetica', 'italic').setFontSize(fs).setTextColor(...MUTED)
        doc.text('Sin movimientos', x + 3, top + 17)
      }
    }
    drawLegend(false)
  }

  if (o.days <= 7) drawAgenda()
  else drawGrid()

  // ---------------- Páginas siguientes: lista de detalles ----------------
  doc.addPage()
  const confirmed = list.filter((r) => r.status === 'confirmada').length
  const arrivals = list.filter((r) => r.checkIn >= o.start && r.checkIn < endExclusive).length
  const listHeader = () => pageHeader('Detalle de reservaciones')
  listHeader()
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  const porCobrar = list.reduce((sum, r) => sum + Math.max(0, balance(r)), 0)
  doc.text(
    `${list.length} ${list.length === 1 ? 'reservación' : 'reservaciones'} (${confirmed} confirmadas, ${list.length - confirmed} pendientes)  |  ${arrivals} ${arrivals === 1 ? 'llegada' : 'llegadas'} en el periodo  |  Saldo por cobrar: ${money(porCobrar)}`,
    M,
    24,
  )

  if (list.length === 0) {
    doc.setFontSize(11).setTextColor(...INK)
    doc.text('No hay reservaciones en este periodo.', M, 36)
  } else {
    const head = ['Llegada', 'Hora', 'Salida', 'Noches', 'Huésped', 'Pers.', 'Habitación', 'Teléfono', 'Estado']
    if (o.includeAmounts) head.push('Total', 'Pagado')
    head.push('Pago', 'Notas')

    const rows = list.map((r) => {
      const hab = roomsShort(r, rooms).replace(/^H/, '')
      const clash = clashes.get(r.id)
      const notes = [r.notes, clash ? `EMPALME de habitación con ${clash.map((c) => c.guest).join(', ')}` : '']
        .filter(Boolean)
        .join('. ')
      const row: string[] = [
        `${weekdayShort(r.checkIn)} ${formatShort(r.checkIn)}`,
        r.arrivalTime || '-',
        `${weekdayShort(r.checkOut)} ${formatShort(r.checkOut)}`,
        String(nightsBetween(r.checkIn, r.checkOut)),
        r.guest.trim() || 'Sin nombre',
        String(r.guests),
        r.rooms.length === 0 ? 'Por asignar' : r.rooms.length === 1 ? `Hab. ${hab}` : `Habs. ${hab}`,
        r.phone || '-',
        r.status === 'confirmada' ? 'Confirmada' : 'Pendiente',
      ]
      if (o.includeAmounts) row.push(money(r.total), money(paidAmount(r)))
      row.push(payTag(r), notes)
      return row
    })

    const statusCol = 8
    const saldoCol = o.includeAmounts ? 11 : 9
    const moneyCols = o.includeAmounts ? [9, 10, 11] : [9]
    const columnStyles: Record<number, Record<string, unknown>> = {
      0: { cellWidth: 23 },
      1: { cellWidth: 13, halign: 'center' },
      2: { cellWidth: 23 },
      3: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 11, halign: 'center' },
      [statusCol]: { cellWidth: 21 },
    }
    for (const c of moneyCols) columnStyles[c] = { halign: 'right', cellWidth: 21 }
    columnStyles[saldoCol] = { halign: 'center', cellWidth: 27 }

    autoTable(doc, {
      head: [head],
      body: rows,
      startY: 28,
      margin: { top: 24, left: M, right: M, bottom: 14 },
      styles: { font: 'helvetica', fontSize: o.includeAmounts ? 7.8 : 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.1, valign: 'middle' },
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 248, 243] },
      columnStyles,
      didParseCell: (hook) => {
        if (hook.section !== 'body') return
        if (hook.column.index === statusCol) {
          const pending = hook.cell.raw === 'Pendiente'
          hook.cell.styles.textColor = pending ? [150, 100, 0] : GREEN
          hook.cell.styles.fontStyle = 'bold'
        }
        if (hook.column.index === 4) hook.cell.styles.fontStyle = 'bold'
        if (hook.column.index === saldoCol) {
          const paid = hook.cell.raw === 'PAGADO'
          hook.cell.styles.textColor = paid ? GREEN : [184, 83, 46]
          hook.cell.styles.fontStyle = 'bold'
        }
        if (typeof hook.cell.raw === 'string' && hook.cell.raw.includes('EMPALME')) hook.cell.styles.textColor = [184, 83, 46]
      },
    })
  }

  // pie de página: número de página y fecha de generación
  const pages = doc.getNumberOfPages()
  const now = new Date()
  const stamp = `${formatShort(todayISO(now))} ${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    doc.text(`Página ${p} de ${pages}`, W - M, H - 5, { align: 'right' })
    doc.text(`Generado ${stamp}`, M, H - 5)
    if (p > 1) {
      // cabecera de continuación para páginas de la lista (la primera ya la dibujamos)
      if (p > 2) {
        doc.addImage(logoDataUrl, 'JPEG', M, 3.6, LOGO_H * LOGO_RATIO, LOGO_H)
        doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...GREEN)
        doc.text(settings.businessName, TX, 12)
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK)
        doc.text(`Detalle de reservaciones (continuación)  |  ${rangeLabel(o.start, endInclusive)}`, TX, 18)
      }
    }
  }

  const fileName = o.days === 1 ? `reservaciones-dia-${o.start}.pdf` : `reservaciones-${o.start}-a-${endInclusive}.pdf`
  return { blob: doc.output('blob'), fileName, count: list.length, endInclusive }
}
