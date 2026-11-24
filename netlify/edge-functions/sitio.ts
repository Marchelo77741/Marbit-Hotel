import type { Config, Context } from '@netlify/edge-functions'
import { renderNotFound, renderSite, sitemapXml, type PublicSiteData } from '../edge-lib/render.ts'

/**
 * Enruta por nombre de dominio:
 *  - Dominios de la app (APP_HOSTS, localhost, *.netlify.app) → la aplicación (SPA), sin cambios.
 *  - Cualquier otro dominio → sitio público de esa posada (tabla tenant_domains), con SEO.
 *  - /s/<apodo> en los dominios de la app → sitio de una posada que aún no tiene dominio propio.
 */
export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const host = url.hostname.toLowerCase()
  const supaUrl = Netlify.env.get('SUPABASE_URL')
  const anon = Netlify.env.get('SUPABASE_ANON_KEY')
  if (!supaUrl || !anon) return context.next()

  const appHosts = (Netlify.env.get('APP_HOSTS') ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  const isApp = host === 'localhost' || host.endsWith('.netlify.app') || appHosts.includes(host)

  let key: string
  let canonical: string
  let path = url.pathname
  if (isApp) {
    const m = path.match(/^\/s\/([a-z0-9-]{2,40})\/?(robots\.txt|sitemap\.xml)?$/i)
    if (!m) return context.next()
    key = m[1].toLowerCase()
    canonical = `${url.origin}/s/${key}`
    path = m[2] ? `/${m[2]}` : '/'
  } else {
    key = host.replace(/^www\./, '')
    canonical = `https://${key}/`
  }

  if (path === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\nSitemap: ${canonical.replace(/\/$/, '')}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } })
  }
  if (path === '/sitemap.xml') return new Response(sitemapXml(canonical), { headers: { 'content-type': 'application/xml' } })
  if (path !== '/' && path !== '/index.html') return new Response(renderNotFound(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })

  let data: PublicSiteData | null = null
  try {
    const r = await fetch(`${supaUrl}/rest/v1/rpc/public_site`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ p_key: key }),
    })
    data = r.ok ? await r.json() : null
  } catch {
    data = null
  }
  if (!data) return new Response(renderNotFound(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })

  return new Response(renderSite(data, { supaUrl, anonKey: anon, siteKey: key, canonical }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // un minuto en el borde; los cambios del dueño se ven casi de inmediato
      'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  })
}

export const config: Config = {
  path: '/*',
  excludedPath: ['/assets/*', '/*.js', '/*.css', '/*.png', '/*.jpg', '/*.svg', '/*.ico', '/*.webmanifest', '/sw.js'],
  cache: 'manual',
}
