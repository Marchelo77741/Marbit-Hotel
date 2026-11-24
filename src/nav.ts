export type Tab = 'disponibilidad' | 'nueva' | 'reservas' | 'cotizaciones' | 'solicitudes' | 'ajustes'

export interface Prefill {
  checkIn?: string
  checkOut?: string
  /** habitación ya elegida (viene de ¿Hay lugar?) */
  roomId?: string
  /** datos que vienen de una cotización */
  quoteId?: string
  guest?: string
  phone?: string
  guests?: number
  notes?: string
  total?: number
}

export type DocRequest =
  | { type: 'confirmation'; reservationId: string }
  | { type: 'receipt'; reservationId: string; paymentId: string }

export interface Nav {
  go: (tab: Tab) => void
  newReservation: (prefill?: Prefill) => void
  editReservation: (id: string) => void
  openReservation: (id: string) => void
  showDoc: (doc: DocRequest) => void
  exportPdf: () => void
  clientReminders: () => void
}
