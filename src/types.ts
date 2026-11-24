export type RoomType = 'sencilla' | 'doble'
export type Status = 'pendiente' | 'confirmada' | 'cancelada'
export type PayMethod = 'efectivo' | 'transferencia' | 'tarjeta'

export interface Room {
  id: string
  name: string
  type: RoomType
  capacity: number
  active: boolean
  /** texto que se muestra en la página web */
  description?: string
  /** fotos (ids en el servidor), la primera es la principal */
  photos?: string[]
  /** en la página: disponible (se puede pedir informes), no-disponible (se ve sin botón) u oculta (no aparece). Por defecto disponible. */
  status?: RoomStatus
  /** mostrar el precio en la página */
  showPrice?: boolean
  /** precio por noche que se muestra en la página */
  publicPrice?: number
  /** última modificación (ISO); sirve para unir cambios entre dispositivos */
  updatedAt?: string
}

export interface SiteTestimonial {
  name: string
  role: string
  text: string
  stars: number
  /** foto: id de foto subida o enlace https; opcional */
  photo: string
}

export interface SiteContent {
  hero: { eyebrow: string; title: string; subtitle: string; slides: string[] }
  gallery: { photo: string; alt: string }[]
  testimonials: SiteTestimonial[]
  contact: {
    address: string
    phone: string
    /** solo dígitos con lada de país, p. ej. 527223542257 */
    whatsapp: string
    email: string
    hours: string
    /** lugar o «lat,lng» para el mapa */
    mapQuery: string
    facebook: string
    instagram: string
    tiktok: string
  }
}

export type RoomStatus = 'disponible' | 'no-disponible' | 'oculta'

/** Solicitud de informes o de hospedaje que llega desde la página web. */
export interface Inquiry {
  id: string
  roomId: string
  roomName: string
  name: string
  /** por dónde quiere recibir la información */
  channel: 'whatsapp' | 'email'
  phone: string
  email: string
  /** YYYY-MM-DD o vacío */
  checkIn: string
  checkOut: string
  guests: number
  message: string
  status: 'nueva' | 'atendida' | 'descartada'
  createdAt: string
  updatedAt?: string
}

export interface Payment {
  id: string
  receiptNo: number
  amount: number
  method: PayMethod
  /** ISO datetime */
  date: string
  note: string
}

export interface RoomAssignment {
  roomId: string
  nightlyRate: number
}

export interface Reservation {
  id: string
  folio: number
  guest: string
  phone: string
  guests: number
  /** YYYY-MM-DD */
  checkIn: string
  /** YYYY-MM-DD (día de salida, no se ocupa esa noche) */
  checkOut: string
  /** hora estimada de llegada del huésped (HH:MM); vacío = sin dato */
  arrivalTime?: string
  rooms: RoomAssignment[]
  total: number
  status: Status
  notes: string
  payments: Payment[]
  createdAt: string
  updatedAt?: string
  /** recordatorios por WhatsApp ya enviados al cliente: días de anticipación (7, 3, 1, 0) → cuándo (ISO) */
  clientReminders?: Record<string, string>
  /** cotización de la que proviene (si aplica) */
  quoteId?: string
}

export interface Settings {
  businessName: string
  address: string
  phone: string
  rateSencilla: number
  rateDoble: number
  checkInTime: string
  checkOutTime: string
  policyNote: string
  /** correos del equipo (separados por coma) para el envío del PDF */
  teamEmails: string
  /** WhatsApp del equipo (un número); vacío = elegir el chat al enviar */
  teamWhatsapp: string
  nextFolio: number
  nextReceipt: number
  /** Cotizador */
  quotePrefix: string
  nextQuote: number
  quoteYear: number
  quoteAnnual: boolean
  quoteMode: string
  quoteNotes: string
  /** Recordatorios de llegada */
  remind5: boolean
  remind2: boolean
  remind1: boolean
  remindToday: boolean
  /** hora local (0-23) de los avisos de 5, 2 y 1 día */
  /** recordatorios por WhatsApp a los clientes: cuándo se ofrecen (7, 3, 1 días antes y el día de llegada) */
  clientRemind7: boolean
  clientRemind3: boolean
  clientRemind1: boolean
  clientRemind0: boolean
  /** texto del recordatorio; admite {nombre} {cuando} {fecha} {hora} {habitaciones} {noches} {saldo} {negocio} {direccion} {telefono} */
  clientTemplate: string
  /** contenido de la página web casaelagave.com (carrusel, galería, comentarios, contacto) */
  site: SiteContent
  morningHour: number
  /** hora local (0-23) del aviso del día de llegada */
  todayHour: number
}

export type ItemType = 'Hospedaje' | 'Servicio' | 'Alimento'

export interface CatalogItem {
  id: string
  type: ItemType
  name: string
  desc: string
  price: number
  /** personas por unidad (solo hospedaje; 0 = sin dato) */
  cap: number
  updatedAt?: string
}

export interface QuoteLine {
  id: string
  catId: string
  type: ItemType
  name: string
  desc: string
  price: number
  qty: number
  /** la cantidad sigue a los huéspedes mientras no se edite a mano */
  auto?: boolean
}

export type QuoteStatus = 'abierta' | 'reservada' | 'descartada'

export interface Quote {
  id: string
  /** COT-2026-001 (vacío hasta guardar) */
  folio: string
  date: string
  client: string
  phone: string
  email: string
  guests: number
  /** fechas de llegada y salida (opcionales) */
  arrival: string
  departure: string
  /** noches cuando no hay fechas */
  nights: number
  checkInTime: string
  checkOutTime: string
  /** texto libre de habitaciones; vacío = se arma con las líneas */
  roomsText: string
  note: string
  lines: QuoteLine[]
  status: QuoteStatus
  reservationId?: string
  createdAt: string
  updatedAt?: string
}

export interface AppData {
  version: 1
  rooms: Room[]
  reservations: Reservation[]
  catalog: CatalogItem[]
  quotes: Quote[]
  inquiries: Inquiry[]
  settings: Settings
  /** id de lo borrado → cuándo se borró (para que un borrado se propague a los demás dispositivos) */
  tombstones: Record<string, string>
  /** ajuste → última vez que se cambió (sin contar los contadores de folios); permite unir ajustes campo por campo */
  settingsAt: Record<string, string>
  /** claves de recordatorios ya mostrados en este dispositivo */
  sentReminders: string[]
  lastBackup: string | null
}
