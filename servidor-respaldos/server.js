// Servicio de respaldos para el programa de reservaciones (sin dependencias; Node 18+).
// Variables de entorno:
//   BACKUP_KEY   clave larga (obligatoria, mínimo 24 caracteres)
//   BACKUP_DIR   carpeta donde se guardan los respaldos (por defecto ./respaldos)
//   PORT         puerto (por defecto 3100), escucha solo en 127.0.0.1
//   KEEP_HOURS   horas con un respaldo por hora (por defecto 48)
//   KEEP_DAYS    días con un respaldo diario (por defecto 30)
//   KEEP_WEEKS   semanas con un respaldo semanal (por defecto 13)
//   DATA_DIR     carpeta de fotos, habitaciones públicas y solicitudes (por defecto ./datos)
//   PUBLIC_ORIGINS  páginas que pueden enviar solicitudes, separadas por coma
//                   (por defecto https://casaelagave.com,https://www.casaelagave.com)
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const KEY = process.env.BACKUP_KEY || ''
const DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, 'respaldos'))
const PORT = Number(process.env.PORT || 3100)
const KEEP_HOURS = Number(process.env.KEEP_HOURS || 48)
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 30)
const KEEP_WEEKS = Number(process.env.KEEP_WEEKS || 13)
const MAX_BODY = 20 * 1024 * 1024
const MAX_PHOTO = 4 * 1024 * 1024
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'datos'))
const PHOTOS = path.join(DATA, 'fotos')
const INBOX = path.join(DATA, 'solicitudes')
const PUBLIC_FILE = path.join(DATA, 'habitaciones-publicas.json')
const SITE_FILE = path.join(DATA, 'sitio-publico.json')
const ORIGINS = (process.env.PUBLIC_ORIGINS || 'https://casaelagave.com,https://www.casaelagave.com').split(',').map((x) => x.trim()).filter(Boolean)
const MAX_INBOX = 300
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/
const NAME_RE = /^respaldo-(\d{8})-(\d{6})-[0-9a-f]{8}\.json$/

if (KEY.length < 24) {
  console.error('Falta BACKUP_KEY (mínimo 24 caracteres). Genera una con: openssl rand -hex 24')
  process.exit(1)
}
fs.mkdirSync(DIR, { recursive: true })
fs.mkdirSync(PHOTOS, { recursive: true })
fs.mkdirSync(INBOX, { recursive: true })

const failures = new Map() // ip -> { n, until }
const sent = new Map() // ip -> [marcas de tiempo] (solicitudes públicas)

function send(res, code, obj, extra = {}) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-Backup-Name',
    'Cache-Control': 'no-store',
    ...extra,
  })
  res.end(body)
}

function authorized(req) {
  const h = req.headers['authorization'] || ''
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '')
  const real = Buffer.from(KEY)
  return given.length === real.length && crypto.timingSafeEqual(given, real)
}

function clientIp(req) {
  return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?'
}

function listFiles() {
  return fs.readdirSync(DIR).filter((f) => NAME_RE.test(f)).sort().reverse() // más nuevo primero
}

function stamp(name) {
  const m = NAME_RE.exec(name)
  const d = m[1], t = m[2]
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`
}

function summary(name) {
  const full = path.join(DIR, name)
  let reservations = null, quotes = null
  try {
    const j = JSON.parse(fs.readFileSync(full, 'utf8'))
    reservations = Array.isArray(j.reservations) ? j.reservations.length : null
    quotes = Array.isArray(j.quotes) ? j.quotes.length : null
  } catch {}
  return { name, at: stamp(name), size: fs.statSync(full).size, reservations, quotes }
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`
}

/** Conserva: el más nuevo, el último de cada una de las últimas KEEP_HOURS horas con respaldo, el último de cada uno de los últimos KEEP_DAYS días y el último de cada una de las últimas KEEP_WEEKS semanas. */
function rotate() {
  const files = listFiles() // nuevo → viejo
  const keep = new Set()
  if (files[0]) keep.add(files[0])
  const days = new Set(), weeks = new Set(), hours = new Set()
  for (const f of files) {
    const hour = stamp(f).slice(0, 13)
    if (hours.size < KEEP_HOURS && !hours.has(hour)) { hours.add(hour); keep.add(f) }
    const when = new Date(stamp(f))
    const day = stamp(f).slice(0, 10)
    const wk = isoWeek(when)
    if (days.size < KEEP_DAYS && !days.has(day)) { days.add(day); keep.add(f) }
    if (weeks.size < KEEP_WEEKS && !weeks.has(wk)) { weeks.add(wk); keep.add(f) }
  }
  for (const f of files) if (!keep.has(f)) fs.unlinkSync(path.join(DIR, f))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => {
      n += c.length
      if (n > MAX_BODY) { reject(Object.assign(new Error('grande'), { code: 413 })); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => {
      n += c.length
      if (n > max) { reject(Object.assign(new Error('grande'), { code: 413 })); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)

function publicRooms() {
  try { return JSON.parse(fs.readFileSync(PUBLIC_FILE, 'utf8')) } catch { return { updatedAt: null, rooms: [] } }
}

/** Foto del sitio: un id de foto subida o un enlace https. */
function photoRef(v) {
  const t = clean(v, 400)
  return ID_RE.test(t) || /^https:\/\/[^\s"'<>]+$/.test(t) ? t : ''
}
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : [])

function sanitizeSite(b) {
  const c = b.contact || {}
  const h = b.hero || {}
  return {
    updatedAt: new Date().toISOString(),
    hero: {
      eyebrow: clean(h.eyebrow, 120), title: clean(h.title, 160), subtitle: clean(h.subtitle, 300),
      slides: list(h.slides, 12).map(photoRef).filter(Boolean),
    },
    gallery: list(b.gallery, 24).map((g) => ({ photo: photoRef(g && g.photo), alt: clean(g && g.alt, 120) })).filter((g) => g.photo),
    testimonials: list(b.testimonials, 24).map((t) => ({
      name: clean(t && t.name, 100), role: clean(t && t.role, 100), text: clean(t && t.text, 600),
      stars: Math.min(5, Math.max(1, parseInt(t && t.stars, 10) || 5)), photo: photoRef(t && t.photo),
    })).filter((t) => t.name && t.text),
    contact: {
      address: clean(c.address, 200), phone: clean(c.phone, 40), whatsapp: clean(c.whatsapp, 20).replace(/\D/g, ''),
      email: clean(c.email, 120), hours: clean(c.hours, 160), mapQuery: clean(c.mapQuery, 120),
      facebook: /^https:\/\//.test(clean(c.facebook, 300)) ? clean(c.facebook, 300) : '',
      instagram: /^https:\/\//.test(clean(c.instagram, 300)) ? clean(c.instagram, 300) : '',
      tiktok: /^https:\/\//.test(clean(c.tiktok, 300)) ? clean(c.tiktok, 300) : '',
    },
  }
}

function newId() {
  return crypto.randomBytes(9).toString('base64url')
}

function inboxFiles() {
  return fs.readdirSync(INBOX).filter((f) => /^[A-Za-z0-9_-]+\.json$/.test(f))
}

/** Valida y guarda una solicitud que llega de la página. Devuelve el texto de error o null. */
function saveInquiry(b, ip) {
  if (clean(b.website, 100)) return null // campo trampa para robots: se acepta sin guardar
  const now = Date.now()
  const recent = (sent.get(ip) || []).filter((t) => now - t < 3_600_000)
  if (recent.length >= 5) return 'Has enviado varias solicitudes; intenta de nuevo en un rato.'
  const channel = b.channel === 'email' ? 'email' : 'whatsapp'
  const name = clean(b.name, 80)
  const phone = clean(b.phone, 30)
  const email = clean(b.email, 120)
  if (name.length < 2) return 'Escribe tu nombre.'
  if (channel === 'whatsapp' && phone.replace(/\D/g, '').length < 10) return 'Escribe tu número de WhatsApp a 10 dígitos.'
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Escribe un correo válido.'
  if (inboxFiles().length >= MAX_INBOX) return 'No pudimos recibir tu solicitud ahora; escríbenos por WhatsApp.'
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '')
  const rec = {
    id: newId(),
    roomId: ID_RE.test(String(b.roomId ?? '')) ? String(b.roomId) : '',
    roomName: clean(b.roomName, 60),
    name,
    channel,
    phone: channel === 'whatsapp' ? phone : clean(b.phone, 30),
    email: channel === 'email' ? email : clean(b.email, 120),
    checkIn: date(b.checkIn),
    checkOut: date(b.checkOut),
    guests: Math.min(30, Math.max(0, parseInt(b.guests, 10) || 0)),
    message: clean(b.message, 800),
    createdAt: new Date().toISOString(),
  }
  const tmp = path.join(INBOX, `.${rec.id}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(rec))
  fs.renameSync(tmp, path.join(INBOX, `${rec.id}.json`))
  recent.push(now)
  sent.set(ip, recent)
  return null
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '')
    const url = new URL(req.url, 'http://x')
    const p = url.pathname.replace(/\/+$/, '') || '/'

    if (req.method === 'GET' && (p === '/' || p === '/health')) return send(res, 200, { ok: true, servicio: 'respaldos-reservaciones' })

    const ip = clientIp(req)

    // ----- rutas públicas (las usa la página web) -----
    if (req.method === 'GET' && p === '/pub/sitio') {
      let site = {}
      try { site = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8')) } catch {}
      return send(res, 200, site, { 'Cache-Control': 'public, max-age=60' })
    }
    if (req.method === 'GET' && p === '/pub/habitaciones') {
      return send(res, 200, publicRooms(), { 'Cache-Control': 'public, max-age=60' })
    }
    const pf = /^\/pub\/foto\/([A-Za-z0-9_-]{6,64})\.jpg$/.exec(p)
    if (req.method === 'GET' && pf) {
      const file = path.join(PHOTOS, `${pf[1]}.jpg`)
      if (!fs.existsSync(file)) return send(res, 404, { error: 'No existe' })
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000, immutable' })
      return res.end(fs.readFileSync(file))
    }
    if (req.method === 'POST' && p === '/pub/solicitud') {
      const origin = req.headers.origin
      if (origin && !ORIGINS.includes(origin)) return send(res, 403, { error: 'Origen no permitido' })
      let body
      try { body = JSON.parse(await readRaw(req, 20_000).then((b) => b.toString('utf8'))) } catch { return send(res, 400, { error: 'Solicitud inválida' }) }
      const err = saveInquiry(body || {}, ip)
      return err ? send(res, 400, { error: err }) : send(res, 201, { ok: true })
    }

    const f = failures.get(ip)
    if (f && f.until > Date.now()) return send(res, 429, { error: 'Demasiados intentos; espera unos minutos.' })
    if (!authorized(req)) {
      const n = (f?.n || 0) + 1
      failures.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 })
      return send(res, 401, { error: 'Clave incorrecta' })
    }
    failures.delete(ip)

    if (req.method === 'GET' && p === '/backups') return send(res, 200, { backups: listFiles().map(summary) })

    if (req.method === 'GET' && p === '/backups/latest') {
      const latest = listFiles()[0]
      if (!latest) return send(res, 404, { error: 'Sin respaldos' })
      return send(res, 200, fs.readFileSync(path.join(DIR, latest), 'utf8'), { 'X-Backup-Name': latest })
    }

    const m = /^\/backups\/([^/]+)$/.exec(p)
    if (req.method === 'GET' && m) {
      const name = decodeURIComponent(m[1])
      if (!NAME_RE.test(name) || !fs.existsSync(path.join(DIR, name))) return send(res, 404, { error: 'No existe' })
      return send(res, 200, fs.readFileSync(path.join(DIR, name), 'utf8'))
    }

    if (req.method === 'POST' && p === '/backups') {
      const text = await readBody(req)
      let data
      try { data = JSON.parse(text) } catch { return send(res, 400, { error: 'JSON inválido' }) }
      if (!data || !Array.isArray(data.reservations) || !Array.isArray(data.rooms)) return send(res, 400, { error: 'No parece un respaldo de reservaciones' })
      const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 8)
      const latest = listFiles()[0]
      if (latest && latest.endsWith(`-${hash}.json`)) return send(res, 200, { ok: true, unchanged: true, ...summary(latest) })
      const name = `respaldo-${nowStamp()}-${hash}.json`
      const tmp = path.join(DIR, `.${name}.tmp`)
      fs.writeFileSync(tmp, text)
      fs.renameSync(tmp, path.join(DIR, name))
      rotate()
      return send(res, 201, { ok: true, ...summary(name) })
    }

    // ----- fotos y datos públicos (los administra la app) -----
    if (req.method === 'POST' && p === '/fotos') {
      const buf = await readRaw(req, MAX_PHOTO)
      const isJpeg = buf.length > 200 && buf[0] === 0xff && buf[1] === 0xd8
      if (!isJpeg) return send(res, 400, { error: 'La foto debe ser JPEG' })
      const id = newId()
      fs.writeFileSync(path.join(PHOTOS, `${id}.jpg`), buf)
      return send(res, 201, { ok: true, id })
    }
    const fd = /^\/fotos\/([A-Za-z0-9_-]{6,64})$/.exec(p)
    if (req.method === 'DELETE' && fd) {
      try { fs.unlinkSync(path.join(PHOTOS, `${fd[1]}.jpg`)) } catch {}
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && p === '/publico/habitaciones') {
      let data
      try { data = JSON.parse(await readBody(req)) } catch { return send(res, 400, { error: 'JSON inválido' }) }
      if (!data || !Array.isArray(data.rooms) || data.rooms.length > 100) return send(res, 400, { error: 'Habitaciones inválidas' })
      const rooms = data.rooms.map((r) => ({
        id: clean(r.id, 64),
        name: clean(r.name, 60),
        type: r.type === 'doble' ? 'doble' : 'sencilla',
        capacity: Math.min(30, Math.max(1, parseInt(r.capacity, 10) || 1)),
        description: clean(r.description, 1200),
        status: r.status === 'no-disponible' ? 'no-disponible' : 'disponible',
        photos: (Array.isArray(r.photos) ? r.photos : []).filter((x) => ID_RE.test(String(x))).slice(0, 12),
        price: Number.isFinite(Number(r.price)) && Number(r.price) > 0 ? Math.round(Number(r.price)) : null,
      }))
      const tmp = `${PUBLIC_FILE}.tmp`
      fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), rooms }))
      fs.renameSync(tmp, PUBLIC_FILE)
      return send(res, 200, { ok: true, rooms: rooms.length })
    }

    if (req.method === 'POST' && p === '/publico/sitio') {
      let data
      try { data = JSON.parse(await readRaw(req, 200_000).then((b) => b.toString('utf8'))) } catch { return send(res, 400, { error: 'JSON inválido' }) }
      const site = sanitizeSite(data || {})
      const tmp = `${SITE_FILE}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(site))
      fs.renameSync(tmp, SITE_FILE)
      return send(res, 200, { ok: true })
    }

    // ----- bandeja de solicitudes (la app las baja y las borra del servidor) -----
    if (req.method === 'GET' && p === '/solicitudes') {
      const items = inboxFiles().map((n) => { try { return JSON.parse(fs.readFileSync(path.join(INBOX, n), 'utf8')) } catch { return null } }).filter(Boolean)
      return send(res, 200, { solicitudes: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) })
    }
    const sd = /^\/solicitudes\/([A-Za-z0-9_-]{6,64})$/.exec(p)
    if (req.method === 'DELETE' && sd) {
      try { fs.unlinkSync(path.join(INBOX, `${sd[1]}.json`)) } catch {}
      return send(res, 200, { ok: true })
    }

    send(res, 404, { error: 'Ruta no encontrada' })
  } catch (e) {
    if (e && e.code === 413) return send(res, 413, { error: 'Respaldo demasiado grande' })
    console.error(e)
    send(res, 500, { error: 'Error interno' })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`Respaldos de reservaciones en 127.0.0.1:${PORT} → ${DIR}`))
