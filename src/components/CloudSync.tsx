import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { countPending, resetSyncState, syncNow, useSyncStatus } from '../lib/cloudSync'
import { cloudEnabled } from '../lib/supabase'
import { blankCloudData } from '../store/defaults'
import { getData, setScope, subscribe } from '../store/core'
import type { Nav } from '../nav'

/** Activa la copia local de la posada elegida y mantiene la sincronización con la nube en marcha. */
export function CloudScope({ children }: { children: ReactNode }) {
  const { tenant } = useAuth()
  const tid = tenant?.id ?? null
  const name = tenant?.name ?? ''
  const [ready, setReady] = useState<string | null>(null)

  useEffect(() => {
    if (!cloudEnabled || !tid) return
    resetSyncState()
    setScope(tid, () => blankCloudData(name))
    setReady(tid)
    const run = () => { if (document.visibilityState === 'visible') void syncNow(tid) }
    run()
    const every = setInterval(run, 45_000)
    let debounce: ReturnType<typeof setTimeout> | undefined
    const unsub = subscribe(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => { if (countPending(tid, getData()) > 0) void syncNow(tid) }, 3000)
    })
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(every); clearTimeout(debounce); unsub()
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [tid, name])

  if (cloudEnabled && ready !== tid) return null
  return <div key={tid ?? 'local'}>{children}</div>
}

/** Estado de la sincronización en la barra superior; los conflictos se abren desde aquí. */
export function SyncBadge({ nav }: { nav: Nav }) {
  const { tenant } = useAuth()
  const st = useSyncStatus()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  if (!cloudEnabled || !tenant) return null
  const bad = st.conflicts.length > 0
  const label = bad ? `⚠ ${st.conflicts.length} sin guardar` : st.state === 'syncing' ? '☁ Sincronizando…' : st.state === 'offline' ? `☁ Sin conexión${st.pending ? ` · ${st.pending} por enviar` : ''}` : st.state === 'error' ? '☁ Error al sincronizar' : st.pending ? `☁ ${st.pending} por enviar` : '☁ Al día'
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="pill" onClick={() => setOpen((o) => !o)} title={st.error ?? ''}>{label}</button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, zIndex: 20, minWidth: 260 }}>
          <p className="muted">{tenant.name}{st.lastOk ? ` · última revisión ${new Date(st.lastOk).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          {st.error && <div className="banner warn-text">{st.error}</div>}
          {st.conflicts.map((c) => (
            <div className="banner warn-text" key={c.id}>
              {c.message}
              <div className="actions"><button className="btn" onClick={() => { setOpen(false); nav.editReservation(c.id) }}>Abrir</button></div>
            </div>
          ))}
          <div className="actions"><button className="btn" onClick={() => void syncNow(tenant.id)}>Sincronizar ahora</button></div>
        </div>
      )}
    </div>
  )
}
