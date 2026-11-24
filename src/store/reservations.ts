import type { PayMethod, Payment, Reservation } from '../types'
import { conflictsForRoom, isActive } from '../lib/availability'
import { commit, getData, uid } from './core'

// ---------- reservaciones ----------

export type ReservationInput = Omit<Reservation, 'id' | 'folio' | 'payments' | 'createdAt'> & {
  id?: string
}

export class ConflictError extends Error {}

/** Crea o actualiza una reservación. Lanza ConflictError si una habitación ya está ocupada. */
export function saveReservation(input: ReservationInput, firstPayment?: { amount: number; method: PayMethod }): Reservation {
  if (input.status !== 'cancelada') {
    for (const a of input.rooms) {
      const hits = conflictsForRoom(a.roomId, input.checkIn, input.checkOut, getData().reservations, input.id)
      if (hits.length > 0) {
        const room = getData().rooms.find((r) => r.id === a.roomId)
        throw new ConflictError(`La habitación ${room?.name ?? ''} ya está ocupada por ${hits[0].guest} en esas fechas.`)
      }
    }
  }

  if (input.id) {
    const existing = getData().reservations.find((r) => r.id === input.id)
    if (!existing) throw new Error('Reservación no encontrada')
    const updated: Reservation = { ...existing, ...input, id: existing.id }
    commit({ ...getData(), reservations: getData().reservations.map((r) => (r.id === existing.id ? updated : r)) })
    return updated
  }

  const settings = getData().settings
  const created: Reservation = {
    ...input,
    id: uid(),
    folio: settings.nextFolio,
    payments: [],
    createdAt: new Date().toISOString(),
  }
  let nextReceipt = settings.nextReceipt
  if (firstPayment && firstPayment.amount > 0) {
    created.payments.push({
      id: uid(),
      receiptNo: nextReceipt++,
      amount: firstPayment.amount,
      method: firstPayment.method,
      date: new Date().toISOString(),
      note: 'Anticipo',
    })
  }
  commit({
    ...getData(),
    reservations: [...getData().reservations, created],
    quotes: getData().quotes.map((q) => (q.id === created.quoteId ? { ...q, status: 'reservada', reservationId: created.id } : q)),
    settings: { ...settings, nextFolio: settings.nextFolio + 1, nextReceipt },
  })
  return created
}

export function setStatus(id: string, status: Reservation['status']) {
  const r = getData().reservations.find((x) => x.id === id)
  if (!r) return
  if (status !== 'cancelada' && !isActive(r)) {
    // reactivar: validar que las habitaciones sigan libres
    for (const a of r.rooms) {
      const hits = conflictsForRoom(a.roomId, r.checkIn, r.checkOut, getData().reservations, r.id)
      if (hits.length > 0) throw new ConflictError(`No se puede reactivar: la habitación ya está ocupada por ${hits[0].guest}.`)
    }
  }
  commit({ ...getData(), reservations: getData().reservations.map((x) => (x.id === id ? { ...x, status } : x)) })
}

export function deleteReservation(id: string) {
  commit({
    ...getData(),
    reservations: getData().reservations.filter((x) => x.id !== id),
    quotes: getData().quotes.map((q) => (q.reservationId === id ? { ...q, status: 'abierta', reservationId: undefined } : q)),
  })
}

export function addPayment(reservationId: string, amount: number, method: PayMethod, note: string): Payment {
  const r = getData().reservations.find((x) => x.id === reservationId)
  if (!r) throw new Error('Reservación no encontrada')
  const payment: Payment = {
    id: uid(),
    receiptNo: getData().settings.nextReceipt,
    amount,
    method,
    date: new Date().toISOString(),
    note,
  }
  commit({
    ...getData(),
    reservations: getData().reservations.map((x) => (x.id === reservationId ? { ...x, payments: [...x.payments, payment] } : x)),
    settings: { ...getData().settings, nextReceipt: getData().settings.nextReceipt + 1 },
  })
  return payment
}

export function removePayment(reservationId: string, paymentId: string) {
  commit({
    ...getData(),
    reservations: getData().reservations.map((x) =>
      x.id === reservationId ? { ...x, payments: x.payments.filter((p) => p.id !== paymentId) } : x,
    ),
  })
}


/** Marca (o desmarca) que se envió el recordatorio de WhatsApp de ese momento (7, 3, 1 o 0 días antes). */
export function markClientReminder(id: string, kind: number, sent: boolean) {
  commit({
    ...getData(),
    reservations: getData().reservations.map((r) => {
      if (r.id !== id) return r
      const next = { ...(r.clientReminders ?? {}) }
      if (sent) next[String(kind)] = new Date().toISOString()
      else delete next[String(kind)]
      return { ...r, clientReminders: next }
    }),
  })
}
