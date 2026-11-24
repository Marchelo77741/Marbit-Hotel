import { useState, useSyncExternalStore } from 'react'
import {
  getRemote,
  isConfigured,
  listBackups,
  pushBackup,
  restoreBackup,
  saveRemote,
  subscribeRemote,
  testConnection,
  type RemoteBackupInfo,
} from '../../lib/remoteBackup'

const DEFAULT_URL = 'https://respaldos.2xou.com'

function when(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

export function RemoteBackupCard() {
  const cfg = useSyncExternalStore(subscribeRemote, getRemote)
  const [url, setUrl] = useState(cfg.url || DEFAULT_URL)
  const [key, setKey] = useState(cfg.key)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [list, setList] = useState<RemoteBackupInfo[] | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo completar.' })
    } finally {
      setBusy(false)
    }
  }

  const saveAndTest = () =>
    run(async () => {
      saveRemote({ url, key })
      await testConnection()
      const r = await pushBackup()
      setMsg({ kind: r.ok ? 'info' : 'error', text: `Conexión correcta. ${r.message}` })
    })

  const backupNow = () =>
    run(async () => {
      const r = await pushBackup({ force: true })
      setMsg({ kind: r.ok ? 'info' : 'error', text: r.message })
      if (r.ok && list) setList(await listBackups())
    })

  const loadList = () =>
    run(async () => {
      setList(await listBackups())
    })

  const restore = (b: RemoteBackupInfo) =>
    run(async () => {
      const q =
        mode === 'replace'
          ? `Esto reemplaza TODOS los datos de este dispositivo por el respaldo del ${when(b.at)}. ¿Continuar?`
          : `Se agregarán las reservaciones, cotizaciones y habitaciones que falten del respaldo del ${when(b.at)}. ¿Continuar?`
      if (!confirm(q)) return
      const n = await restoreBackup(b.name, mode)
      setMsg({
        kind: 'info',
        text: mode === 'replace' ? `Datos restaurados (${n} reservaciones).` : `Se agregaron ${n} reservaciones nuevas.`,
      })
    })

  function disconnect() {
    if (!confirm('¿Quitar la dirección y la clave de este dispositivo? Los respaldos del servidor no se borran.')) return
    saveRemote({ url: '', key: '', lastOk: null, lastPull: null, lastNews: null, lastError: null })
    setKey('')
    setList(null)
    setMsg(null)
  }

  return (
    <section className="card">
      <h2>Respaldo y sincronización con el servidor</h2>
      <p className="muted">
        Mantiene al día tus datos en todos tus dispositivos y guarda copias para recuperarlas. Al abrir la app (y cada 3 minutos mientras está abierta) trae solos los cambios hechos en otro dispositivo, los une con los de este sin borrar nada y sube los nuevos. Sin internet la app sigue funcionando y se pone al día después.
        {cfg.lastPull ? ` Última revisión: ${when(cfg.lastPull)}.` : ''}
        {cfg.lastNews ? ` Últimos cambios de otro dispositivo: ${when(cfg.lastNews)}.` : ''}
      </p>
      {cfg.lastError && isConfigured() && <div className="banner warn">Último intento fallido: {cfg.lastError} Se reintentará solo.</div>}

      <label className="field">
        <span>Dirección del servidor</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_URL} inputMode="url" autoCapitalize="off" autoCorrect="off" />
      </label>
      <label className="field">
        <span>Clave</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="La clave que generaste en el servidor" autoComplete="off" />
      </label>
      <label className="check">
        <input type="checkbox" checked={cfg.auto} onChange={(e) => saveRemote({ auto: e.target.checked })} />
        Sincronizar y respaldar automáticamente
      </label>

      <div className="row wrap">
        <button className="btn primary" disabled={busy || !url.trim() || !key.trim()} onClick={saveAndTest}>
          Probar y guardar
        </button>
        <button className="btn" disabled={busy || !isConfigured()} onClick={backupNow}>
          Sincronizar ahora
        </button>
        <button className="btn" disabled={busy || !isConfigured()} onClick={loadList}>
          Ver respaldos / restaurar
        </button>
        {isConfigured() && (
          <button className="btn ghost" disabled={busy} onClick={disconnect}>
            Desconectar
          </button>
        )}
      </div>
      {busy && <p className="muted">Conectando con el servidor…</p>}
      {msg && <div className={msg.kind === 'error' ? 'banner warn' : 'banner info'}>{msg.text}</div>}

      {list && (
        <div className="remote-list">
          <div className="row wrap">
            <select aria-label="Modo de restauración" value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}>
              <option value="merge">Restaurar: agregar lo que falte</option>
              <option value="replace">Restaurar: reemplazar todo</option>
            </select>
          </div>
          {list.length === 0 && <p className="muted">Aún no hay respaldos en el servidor.</p>}
          {list.map((b) => (
            <div key={b.name} className="remote-item">
              <div>
                <strong>{when(b.at)}</strong>
                <small className="muted">
                  {' '}
                  · {b.reservations ?? '?'} reservaciones · {b.quotes ?? '?'} cotizaciones · {Math.max(1, Math.round(b.size / 1024))} KB
                </small>
              </div>
              <button className="btn small" disabled={busy} onClick={() => restore(b)}>
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
