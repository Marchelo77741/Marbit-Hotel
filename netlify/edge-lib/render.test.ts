import { describe, expect, it } from 'vitest'
import { esc, jsonForScript, photoSrc, renderSite, type PublicSiteData } from './render.ts'

const O = { supaUrl: 'https://x.supabase.co', anonKey: 'k', siteKey: 'casaelagave.com', canonical: 'https://casaelagave.com/' }
const D: PublicSiteData = {
  tenant: { id: 't', name: 'Casa <El> Agave' },
  info: { businessName: 'Casa El Agave', phone: '722 354 2257', checkInTime: '15:00' },
  site: { hero: { title: 'Descansa', subtitle: 'Valle de Bravo', slides: ['t/a.jpg'] }, contact: { whatsapp: '+52 722 354 2257', facebook: 'https://facebook.com/x', mapQuery: 'Valle de Bravo' },
    testimonials: [{ name: 'Ana', text: '<script>alert(1)</script>', stars: 5 }] },
  rooms: [{ id: 'r1', name: 'Doble', capacity: 2, status: 'disponible', photos: ['t/b.jpg'], price: 1500 }, { id: 'r2', name: 'Sencilla', price: null }],
}

describe('renderSite', () => {
  const html = renderSite(D, O)
  it('incluye SEO', () => {
    expect(html).toContain('<title>Casa El Agave · Descansa</title>')
    expect(html).toContain('rel="canonical" href="https://casaelagave.com/"')
    expect(html).toContain('og:image" content="https://x.supabase.co/storage/v1/object/public/tenant-photos/t/a.jpg"')
    expect(html).toContain('"@type":"LodgingBusiness"')
  })
  it('muestra precio solo si viene', () => {
    expect(html).toContain('$1,500')
    expect(html.match(/por noche/g)).toHaveLength(1)
  })
  it('escapa el contenido del dueño', () => {
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })
  it('enlaza WhatsApp solo con dígitos', () => expect(html).toContain('https://wa.me/527223542257'))
})

describe('utilidades', () => {
  it('esc', () => expect(esc(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;'))
  it('jsonForScript no cierra el script', () => expect(jsonForScript({ a: '</script>' })).not.toContain('</script>'))
  it('photoSrc rechaza rutas raras y http', () => {
    expect(photoSrc('https://x', 'http://evil/a.jpg')).toBe('')
    expect(photoSrc('https://x', '../a/b.jpg')).toBe('')
    expect(photoSrc('https://x', 'abc')).toBe('')
  })
})
