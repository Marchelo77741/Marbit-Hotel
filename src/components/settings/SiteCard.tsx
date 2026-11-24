import { saveSettings, useData } from '../../store'
import type { SiteContent, SiteTestimonial } from '../../types'
import { PhotoList } from './PhotoList'

export function SiteCard() {
  const { settings } = useData()
  const site = settings.site
  const set = (patch: Partial<SiteContent>) => saveSettings({ site: { ...site, ...patch } })
  const setContact = (patch: Partial<SiteContent['contact']>) => set({ contact: { ...site.contact, ...patch } })
  const setHero = (patch: Partial<SiteContent['hero']>) => set({ hero: { ...site.hero, ...patch } })
  const setTesti = (i: number, patch: Partial<SiteTestimonial>) => set({ testimonials: site.testimonials.map((t, j) => (j === i ? { ...t, ...patch } : t)) })

  return (
    <section className="card">
      <h2>Página web (casaelagave.com)</h2>
      <p className="muted">Lo que edites aquí se publica en la página al sincronizar con el servidor (Respaldo y sincronización).</p>

      <details className="room-edit">
        <summary>Portada y carrusel</summary>
        <label className="field"><span>Texto pequeño superior</span><input value={site.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} /></label>
        <label className="field"><span>Título</span><input value={site.hero.title} onChange={(e) => setHero({ title: e.target.value })} /></label>
        <label className="field"><span>Subtítulo</span><textarea rows={2} value={site.hero.subtitle} onChange={(e) => setHero({ subtitle: e.target.value })} /></label>
        <div className="field">
          <span>Fotos del carrusel</span>
          <PhotoList items={site.hero.slides.map((photo) => ({ photo }))} onChange={(items) => setHero({ slides: items.map((i) => i.photo) })} />
        </div>
      </details>

      <details className="room-edit">
        <summary>Galería</summary>
        <PhotoList withAlt max={24} items={site.gallery} onChange={(gallery) => set({ gallery: gallery.map((g) => ({ photo: g.photo, alt: g.alt ?? '' })) })} />
      </details>

      <details className="room-edit">
        <summary>Comentarios de huéspedes ({site.testimonials.length})</summary>
        {site.testimonials.map((t, i) => (
          <div className="room-edit" key={i}>
            <div className="grid2">
              <label className="field"><span>Nombre</span><input value={t.name} onChange={(e) => setTesti(i, { name: e.target.value })} /></label>
              <label className="field"><span>Detalle (ej. Huésped · 2026)</span><input value={t.role} onChange={(e) => setTesti(i, { role: e.target.value })} /></label>
            </div>
            <label className="field"><span>Comentario</span><textarea rows={3} value={t.text} onChange={(e) => setTesti(i, { text: e.target.value })} /></label>
            <div className="row wrap">
              <label className="field"><span>Estrellas</span>
                <select value={t.stars} onChange={(e) => setTesti(i, { stars: Number(e.target.value) })}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button className="btn small danger" onClick={() => confirm('¿Quitar este comentario?') && set({ testimonials: site.testimonials.filter((_, j) => j !== i) })}>Quitar comentario</button>
            </div>
          </div>
        ))}
        <button className="btn small" onClick={() => set({ testimonials: [...site.testimonials, { name: '', role: 'Huésped', text: '', stars: 5, photo: '' }] })}>＋ Agregar comentario</button>
      </details>

      <details className="room-edit">
        <summary>Datos de contacto</summary>
        <div className="grid2">
          <label className="field"><span>Dirección</span><input value={site.contact.address} onChange={(e) => setContact({ address: e.target.value })} /></label>
          <label className="field"><span>Teléfono (como se muestra)</span><input value={site.contact.phone} onChange={(e) => setContact({ phone: e.target.value })} /></label>
          <label className="field"><span>WhatsApp (con lada de país, solo números)</span><input inputMode="tel" value={site.contact.whatsapp} onChange={(e) => setContact({ whatsapp: e.target.value.replace(/\D/g, '') })} placeholder="527223542257" /></label>
          <label className="field"><span>Correo</span><input type="email" value={site.contact.email} onChange={(e) => setContact({ email: e.target.value })} /></label>
          <label className="field"><span>Horario de atención</span><input value={site.contact.hours} onChange={(e) => setContact({ hours: e.target.value })} /></label>
          <label className="field"><span>Ubicación del mapa (lugar o «lat,lng»)</span><input value={site.contact.mapQuery} onChange={(e) => setContact({ mapQuery: e.target.value })} /></label>
          <label className="field"><span>Facebook (enlace)</span><input value={site.contact.facebook} onChange={(e) => setContact({ facebook: e.target.value })} placeholder="https://facebook.com/…" /></label>
          <label className="field"><span>Instagram (enlace)</span><input value={site.contact.instagram} onChange={(e) => setContact({ instagram: e.target.value })} placeholder="https://instagram.com/…" /></label>
          <label className="field"><span>TikTok (enlace)</span><input value={site.contact.tiktok} onChange={(e) => setContact({ tiktok: e.target.value })} placeholder="https://tiktok.com/@…" /></label>
        </div>
      </details>
    </section>
  )
}
