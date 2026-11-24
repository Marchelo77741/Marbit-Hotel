import type { AppData, Room } from '../types'
import { EPOCH } from '../lib/merge'
import { DEFAULT_QUOTE_NOTES, defaultCatalog } from '../lib/quotes'
import { DEFAULT_CLIENT_TEMPLATE } from '../lib/clientReminders'
import type { Settings, SiteContent } from '../types'

const CLD = 'https://res.cloudinary.com/dfo8st899/image/upload/'
const PICS = [
  ['v1746999548/IMG_1500_isdd1u.jpg', 'Casa El Agave'],
  ['v1746999544/IMG_1503_frqolz.jpg', 'Habitación'],
  ['v1746999544/IMG_2204_b4mdta.jpg', 'Jardín'],
  ['v1746999544/IMG_1501_oohqpc.jpg', 'Espacio'],
  ['v1746999544/IMG_2684_jrfnv0.jpg', 'Exterior'],
]

/** Lo que hoy dice la página, para que al publicar por primera vez no cambie nada. */
export function defaultSite(): SiteContent {
  return {
    hero: {
      eyebrow: 'Valle de Bravo · Estado de México',
      title: 'Donde la naturaleza te abraza',
      subtitle: 'Un refugio de descanso y tranquilidad rodeado del paisaje natural de Acatitlán.',
      slides: [PICS[0], PICS[4], PICS[2], PICS[3]].map(([u]) => CLD + u),
    },
    gallery: PICS.map(([u, alt]) => ({ photo: CLD + u, alt })),
    testimonials: [
      { name: 'Martha Oaxaca González', role: 'Huéspeda · 2024', stars: 5, photo: 'https://lh3.googleusercontent.com/a-/ALV-UjWmnxIBTS5smugpHMF3ov6GEZH2B-oglm7muFiJp30dyJopWB4=w75-h75-p-rp-mo-br100', text: 'Me gustó el lugar y la atención fue buena, muy amable el dueño.' },
      { name: 'Pérez Rivera Abigail', role: 'Huéspeda · 2024', stars: 5, photo: 'https://lh3.googleusercontent.com/a-/ALV-UjXtRxyRv07eg3Y8ZbWRtRwlXt9Q_2g6O4mGXS_Pr_YGMJ248Plc=w75-h75-p-rp-mo-br100', text: 'Estuvo muy bien la estadía, las habitaciones son lindas.' },
      { name: 'psh dub', role: 'Huésped · 2024', stars: 5, photo: 'https://lh3.googleusercontent.com/a/ACg8ocJcr6wieyt-wt0ZcEJKCPDRBoFEMuoX_7M3_8ZLIrtRHSDULQ=w75-h75-p-rp-mo-br100', text: 'La atención muy excelente y la habitación muy reconfortante. Cerca hay muchos comercios para comer.' },
    ],
    contact: {
      address: 'Km. 3.6 Camino Real Acatitlán, Valle de Bravo, Méx.',
      phone: '+52 722 354 2257',
      whatsapp: '527223542257',
      email: '',
      hours: 'Lun–Dom (excepto Martes) · 9:00 – 20:00 hrs.',
      mapQuery: '19.1958342,-100.1002844',
      facebook: '',
      instagram: '',
      tiktok: '',
    },
  }
}

export const defaultSettings: Settings = {
  businessName: 'Posada Casa El Agave',
  address: 'Camino Real Acatitlán, Valle de Bravo, Estado de México',
  phone: '722 354 2257',
  rateSencilla: 850,
  rateDoble: 1100,
  checkInTime: '13:00',
  checkOutTime: '12:00',
  policyNote: 'El anticipo no es reembolsable. Gracias por su preferencia.',
  teamEmails: '',
  teamWhatsapp: '',
  nextFolio: 1,
  nextReceipt: 1,
  quotePrefix: 'COT',
  nextQuote: 1,
  quoteYear: new Date().getFullYear(),
  quoteAnnual: true,
  quoteMode: 'Renta por noche',
  quoteNotes: DEFAULT_QUOTE_NOTES,
  remind5: true,
  remind2: true,
  remind1: true,
  remindToday: true,
  clientRemind7: false,
  clientRemind3: true,
  clientRemind1: true,
  clientRemind0: false,
  clientTemplate: DEFAULT_CLIENT_TEMPLATE,
  site: defaultSite(),
  morningHour: 9,
  todayHour: 12,
}

export function defaultRooms(): Room[] {
  // Se asume doble en 2 y 6 por las tarifas del Excel; el usuario las ajusta en Ajustes.
  return Array.from({ length: 9 }, (_, i) => {
    const n = i + 1
    const doble = n === 2 || n === 6
    return {
      id: `room-${n}`,
      name: String(n),
      type: doble ? 'doble' : 'sencilla',
      capacity: doble ? 2 : 1,
      active: true,
    } satisfies Room
  })
}

export function emptyData(): AppData {
  return {
    version: 1,
    rooms: defaultRooms(),
    reservations: [],
    catalog: defaultCatalog(),
    quotes: [],
    inquiries: [],
    settings: { ...defaultSettings },
    settingsAt: {},
    tombstones: {},
    sentReminders: [],
    lastBackup: null,
  }
}

export function normalizeData(raw: unknown, base: AppData = emptyData()): AppData {
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Partial<AppData>
  // los datos anteriores a la sincronización no traen fecha de modificación: se les da una fija (igual en todos los dispositivos)
  const stamp = <T extends { updatedAt?: string }>(l: T[], fallback: (x: T) => string): T[] =>
    l.map((x) => (x.updatedAt ? x : { ...x, updatedAt: fallback(x) }))
  return {
    version: 1,
    rooms: stamp(Array.isArray(d.rooms) && (d.rooms.length > 0 || base.rooms.length === 0) ? d.rooms : base.rooms, () => EPOCH),
    reservations: stamp(
      (Array.isArray(d.reservations) ? d.reservations : []).map((r) => ({ ...r, payments: r.payments ?? [] })),
      (r) => r.createdAt || EPOCH,
    ),
    catalog: stamp(Array.isArray(d.catalog) && (d.catalog.length > 0 || base.catalog.length === 0) ? d.catalog : base.catalog, () => EPOCH),
    quotes: stamp(Array.isArray(d.quotes) ? d.quotes : [], (q) => q.createdAt || EPOCH),
    inquiries: stamp(Array.isArray(d.inquiries) ? d.inquiries : [], (q) => q.createdAt || EPOCH),
    settings: { ...base.settings, ...(d.settings ?? {}) },
    settingsAt: d.settingsAt && typeof d.settingsAt === 'object' ? d.settingsAt : {},
    tombstones: d.tombstones && typeof d.tombstones === 'object' ? d.tombstones : {},
    sentReminders: Array.isArray(d.sentReminders) ? d.sentReminders : [],
    lastBackup: d.lastBackup ?? null,
  }
}


export function blankSite(): SiteContent {
  return {
    hero: { eyebrow: '', title: '', subtitle: '', slides: [] },
    gallery: [],
    testimonials: [],
    contact: { address: '', phone: '', whatsapp: '', email: '', hours: '', mapQuery: '', facebook: '', instagram: '', tiktok: '' },
  }
}

/** Posada nueva en la nube: sin habitaciones ni contenido de otra posada. */
export function blankCloudData(name: string): AppData {
  const base = emptyData()
  return {
    ...base,
    rooms: [],
    catalog: [],
    settings: { ...defaultSettings, businessName: name, address: '', phone: '', site: blankSite() },
  }
}
