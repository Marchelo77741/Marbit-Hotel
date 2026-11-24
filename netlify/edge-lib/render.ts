/** Página pública de una posada, generada en el servidor (Netlify Edge) a partir de `public_site`.
 *  Lógica pura, sin APIs de Deno: se prueba con Vitest. */

export interface PublicSiteData {
  tenant: { id: string; name: string; nickname?: string | null }
  info: { businessName?: string; address?: string; phone?: string; checkInTime?: string; checkOutTime?: string; policyNote?: string }
  site: {
    hero?: { eyebrow?: string; title?: string; subtitle?: string; slides?: string[] }
    gallery?: { photo: string; alt?: string }[]
    testimonials?: { name?: string; role?: string; text?: string; stars?: number; photo?: string }[]
    contact?: { address?: string; phone?: string; whatsapp?: string; email?: string; hours?: string; mapQuery?: string; facebook?: string; instagram?: string; tiktok?: string }
  }
  rooms: { id: string; name: string; type?: string; capacity?: number; description?: string; status?: string; photos?: string[]; price?: number | null }[]
}

export interface RenderOpts {
  supaUrl: string
  anonKey: string
  /** clave con la que se pidió el sitio (dominio o apodo), para enviar solicitudes */
  siteKey: string
  /** URL pública canónica, p. ej. https://casaelagave.com/ */
  canonical: string
}

export const esc = (t: unknown): string =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Escapa para dejar JSON dentro de <script>. */
export const jsonForScript = (v: unknown): string =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

export function photoSrc(supaUrl: string, ref: string): string {
  if (/^https:\/\//.test(ref)) return ref
  if (ref.includes('/') && !ref.includes('..') && !ref.includes(':')) return `${supaUrl}/storage/v1/object/public/tenant-photos/${ref.split('/').map(encodeURIComponent).join('/')}`
  return ''
}

const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const digits = (s?: string) => (s ?? '').replace(/\D/g, '')
const safeUrl = (u?: string) => (u && /^https:\/\//.test(u) ? u : '')

const STATUS: Record<string, string> = { disponible: 'Disponible', 'no-disponible': 'No disponible por ahora' }

export function seoOf(d: PublicSiteData, o: RenderOpts, supaUrl = o.supaUrl) {
  const name = d.info.businessName || d.tenant.name
  const hero = d.site.hero ?? {}
  const title = hero.title ? `${name} · ${hero.title}` : name
  const desc = (hero.subtitle || d.site.contact?.address || `Reserva tu estancia en ${name}.`).slice(0, 180)
  const img = photoSrc(supaUrl, hero.slides?.[0] ?? d.site.gallery?.[0]?.photo ?? d.rooms.find((r) => r.photos?.length)?.photos?.[0] ?? '')
  return { name, title, desc, img }
}

export function renderSite(d: PublicSiteData, o: RenderOpts): string {
  const c = d.site.contact ?? {}
  const hero = d.site.hero ?? {}
  const { name, title, desc, img } = seoOf(d, o)
  const addr = c.address || d.info.address || ''
  const phone = c.phone || d.info.phone || ''
  const wa = digits(c.whatsapp)
  const src = (r: string) => photoSrc(o.supaUrl, r)
  const slides = (hero.slides ?? []).map(src).filter(Boolean)
  const gallery = (d.site.gallery ?? []).map((g) => ({ u: src(g.photo), a: g.alt || name })).filter((g) => g.u)
  const sameAs = [c.facebook, c.instagram, c.tiktok].map(safeUrl).filter(Boolean)

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name,
    url: o.canonical,
    ...(img && { image: img }),
    description: desc,
    ...(phone && { telephone: phone }),
    ...(c.email && { email: c.email }),
    ...(addr && { address: { '@type': 'PostalAddress', streetAddress: addr } }),
    ...(d.info.checkInTime && { checkinTime: d.info.checkInTime }),
    ...(d.info.checkOutTime && { checkoutTime: d.info.checkOutTime }),
    ...(sameAs.length && { sameAs }),
  }

  const rooms = d.rooms
    .map((r) => {
      const photo = src(r.photos?.[0] ?? '')
      const st = STATUS[r.status ?? 'disponible'] ?? ''
      return `<article class="card">${photo ? `<img src="${esc(photo)}" alt="${esc(r.name)}" loading="lazy">` : ''}<div class="pad"><h3>${esc(r.name)}</h3>
<p class="muted">${r.capacity ? `Hasta ${r.capacity} personas` : ''}${st ? ` · ${esc(st)}` : ''}</p>${r.description ? `<p>${esc(r.description)}</p>` : ''}
${typeof r.price === 'number' ? `<p class="price">${money(r.price)} <small>por noche</small></p>` : ''}
<button class="btn" data-room="${esc(r.id)}">Pedir informes</button></div></article>`
    })
    .join('')

  const testis = (d.site.testimonials ?? [])
    .filter((t) => t.text)
    .map((t) => `<blockquote class="card pad"><div class="stars" aria-label="${t.stars ?? 5} estrellas">${'★'.repeat(Math.min(5, Math.max(1, t.stars ?? 5)))}</div><p>${esc(t.text)}</p><footer><strong>${esc(t.name)}</strong> <span class="muted">${esc(t.role)}</span></footer></blockquote>`)
    .join('')

  const map = c.mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(c.mapQuery)}&output=embed` : ''
  const roomOpts = d.rooms.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(o.canonical)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(o.canonical)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<script type="application/ld+json">${jsonForScript(ld)}</script>
<style>
:root{--c:#2f5d50;--bg:#faf7f2;--t:#222}*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,sans-serif;color:var(--t);background:var(--bg)}
h1,h2,h3{font-family:Georgia,serif;margin:.2em 0}.wrap{max-width:1080px;margin:auto;padding:0 18px}section{padding:42px 0}
.hero{position:relative;min-height:70vh;display:grid;place-items:center;text-align:center;color:#fff;background:#2f5d50 center/cover}
.hero:before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.38)}.hero>div{position:relative;padding:20px}.hero h1{font-size:clamp(2rem,6vw,3.6rem)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}.card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px #0002;margin:0}
.card img{width:100%;height:190px;object-fit:cover;display:block}.pad{padding:14px}.muted{color:#666;font-size:.9em}.price{font-weight:700;color:var(--c)}
.btn{background:var(--c);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}.gal img{width:100%;height:150px;object-fit:cover;border-radius:8px}
.stars{color:#d99a1c}form{display:grid;gap:10px;max-width:520px}input,select,textarea{font:inherit;padding:10px;border:1px solid #ccc;border-radius:8px;width:100%}
.hp{position:absolute;left:-9999px}#msg{padding:10px;border-radius:8px;display:none}iframe{border:0;width:100%;height:300px;border-radius:12px}footer.site{background:#222;color:#ddd;padding:24px 0;text-align:center}footer.site a{color:#fff}
</style></head><body>
<header class="hero"${slides[0] ? ` style="background-image:linear-gradient(#0000,#0000),url('${esc(slides[0]).replace(/'/g, '%27')}')"` : ''}><div>
${hero.eyebrow ? `<p>${esc(hero.eyebrow)}</p>` : ''}<h1>${esc(hero.title || name)}</h1>${hero.subtitle ? `<p>${esc(hero.subtitle)}</p>` : ''}
<a class="btn" href="#informes">Pedir informes</a></div></header>
<main class="wrap">
${rooms ? `<section id="habitaciones"><h2>Habitaciones</h2><div class="grid">${rooms}</div></section>` : ''}
${gallery.length ? `<section id="galeria"><h2>Galería</h2><div class="gal">${gallery.map((g) => `<img src="${esc(g.u)}" alt="${esc(g.a)}" loading="lazy">`).join('')}</div></section>` : ''}
${testis ? `<section id="opiniones"><h2>Opiniones</h2><div class="grid">${testis}</div></section>` : ''}
<section id="informes"><h2>Pide informes</h2>
<form id="f"><input name="name" placeholder="Tu nombre" required maxlength="80">
<select name="channel"><option value="whatsapp">Recibir por WhatsApp</option><option value="email">Recibir por correo</option></select>
<input name="phone" placeholder="WhatsApp (10 dígitos)" inputmode="tel"><input name="email" type="email" placeholder="Correo" style="display:none">
<select name="roomId"><option value="">Cualquier habitación</option>${roomOpts}</select>
<input name="checkIn" type="date"><input name="checkOut" type="date"><input name="guests" type="number" min="0" max="30" placeholder="Personas">
<textarea name="message" rows="3" maxlength="800" placeholder="Mensaje (opcional)"></textarea>
<input class="hp" name="website" tabindex="-1" autocomplete="off"><button class="btn" type="submit">Enviar</button><div id="msg" role="status"></div></form></section>
<section id="contacto"><h2>Contacto</h2>
${addr ? `<p>${esc(addr)}</p>` : ''}${phone ? `<p>Tel. <a href="tel:${esc(digits(phone))}">${esc(phone)}</a></p>` : ''}${c.hours ? `<p>${esc(c.hours)}</p>` : ''}
${d.info.checkInTime ? `<p>Entrada ${esc(d.info.checkInTime)}${d.info.checkOutTime ? ` · Salida ${esc(d.info.checkOutTime)}` : ''}</p>` : ''}
${d.info.policyNote ? `<p class="muted">${esc(d.info.policyNote)}</p>` : ''}
${wa ? `<p><a class="btn" href="https://wa.me/${wa}">WhatsApp</a></p>` : ''}${c.email ? `<p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}
${map ? `<iframe src="${esc(map)}" title="Mapa" loading="lazy"></iframe>` : ''}</section></main>
<footer class="site"><div class="wrap">${sameAs.map((u) => `<a href="${esc(u)}" rel="noopener">${esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`).join(' · ')}<p>© ${esc(name)} · Sitio con <a href="https://marbit.com.mx">Marbit-Hotel</a></p></div></footer>
<script>
(()=>{const f=document.getElementById('f'),m=document.getElementById('msg'),K=${jsonForScript(o.siteKey)},U=${jsonForScript(o.supaUrl)},A=${jsonForScript(o.anonKey)};
f.channel.onchange=()=>{const e=f.channel.value==='email';f.email.style.display=e?'':'none';f.phone.style.display=e?'none':''};
document.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>{f.roomId.value=b.dataset.room;f.scrollIntoView({behavior:'smooth'})});
const say=(t,ok)=>{m.style.display='block';m.textContent=t;m.style.background=ok?'#dff0e6':'#f8dcdc'};
f.onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(f));
try{const r=await fetch(U+'/rest/v1/rpc/submit_inquiry',{method:'POST',headers:{'Content-Type':'application/json',apikey:A},body:JSON.stringify({p_key:K,p_payload:p})});const j=await r.json();
if(j&&j.ok){say('¡Gracias! Te contactaremos pronto.',true);f.reset()}else say((j&&j.error)||'No pudimos enviar tu solicitud; intenta de nuevo.',false)}catch{say('Sin conexión; intenta de nuevo.',false)}}})();
</script></body></html>`
}

export function renderNotFound(): string {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Sitio no disponible</title><body style="font:16px system-ui;text-align:center;padding:15vh 20px"><h1>Este sitio no está disponible</h1><p>Si eres el dueño, escríbenos para activar tu dominio.</p></body></html>`
}

/** Mapa de sitio mínimo para buscadores. */
export const sitemapXml = (canonical: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(canonical)}</loc></url></urlset>`
