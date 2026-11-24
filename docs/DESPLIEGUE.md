# Despliegue en Netlify (etapa 7)

Un solo sitio de Netlify sirve **la app** (SPA) y **los sitios públicos de todas las posadas**.
La función de borde `netlify/edge-functions/sitio.ts` decide por nombre de dominio.

## 1. Conectar el repositorio (una sola vez)
Netlify → Add new project → Import from GitHub → `Marchelo77741/Marbit-Hotel`, rama `main`.
`netlify.toml` ya trae el build (`npm run build`, publica `dist`).

## 2. Variables de entorno (alcance: Builds **y** Functions)
| Variable | Valor | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://kjbpilfztykipzpisrna.supabase.co` | la app (en el build) |
| `VITE_SUPABASE_ANON_KEY` | clave *publishable* de Supabase | la app (en el build) |
| `SUPABASE_URL` | la misma URL | función de borde |
| `SUPABASE_ANON_KEY` | la misma clave *publishable* | función de borde |
| `APP_HOSTS` | dominio(s) de la app, separados por coma (p. ej. `app.marbit.com.mx`) | estos dominios muestran la app; cualquier otro muestra el sitio de una posada |

Nunca uses la clave `service_role` aquí. Cambiar una variable requiere un nuevo deploy.

## 3. Cómo se decide qué mostrar
- `localhost`, `*.netlify.app` y `APP_HOSTS` → la aplicación. En ellos, `/s/<apodo>` muestra el sitio de una posada que aún no tiene dominio.
- Cualquier otro dominio → `public_site(<dominio sin www>)`. Si no existe en `tenant_domains` → página 404 con `noindex`.
- `/robots.txt` y `/sitemap.xml` se generan por dominio. El HTML se guarda 60 s en el borde.

## 4. Alta de un dominio nuevo de cliente
1. Comprar/registrar el dominio y apuntar DNS a Netlify (o delegar a Netlify DNS).
2. Netlify → Domain management → Add domain alias (`cliente.com` y `www.cliente.com`). El certificado HTTPS es automático.
3. En Supabase (como administrador de plataforma), insertar en `tenant_domains` ambos nombres para el `tenant_id` de la posada (plantilla: `supabase/admin/alta_dominio.sql`).
4. Abrir el dominio y comprobar título, fotos y que el formulario de informes llegue a la app.

Verificar el plan de Netlify: hay un límite de alias de dominio por sitio; si se rebasa, repartir clientes en un segundo sitio con el mismo repositorio.

## 5. Autenticación de Supabase
Auth → URL Configuration: Site URL = dominio de la app; añadir a Redirect URLs la URL de la app (y `*.netlify.app` solo para pruebas). Mantener la confirmación de correo activada.

## 6. Pruebas locales
`npm test` cubre el generador (`netlify/edge-lib/render.ts`). Para ver la función de borde completa: `netlify dev` con `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `APP_HOSTS=localhost`, y abrir `http://localhost:8888/s/<apodo>`.
