import { useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { verifyCloud, syncNow, type VerifyRow } from '../../lib/cloudSync'
import { convertIds, legacyPhotoRefs, orphanRoomRefs, overlapCount, migratePhotos, remapPhotos } from '../../lib/legacyImport'
import { cloudEnabled } from '../../lib/supabase'
import { commit } from '../../store/core'
import { clearAll, exportBackup, getData, importBackup, normalizeData, useData } from '../../store'
import { download } from '../../lib/util'
import { todayISO } from '../../lib/dates'

export function DataBackupCard() {
  const { lastBackup } = useData()
  const { tenant } = useAuth()
  const [msg, setMsg] = useState('')
  const [withSettings, setWithSettings] = useState(true)
  const [oldServer, setOldServer] = useState('https://respaldos.2xou.com')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<VerifyRow[] | null>(null)
  const cloud = cloudEnabled && !!tenant
  const fileRef = useRef<HTMLInputElement>(null)
  const migrateRef = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  function backup() {
    download(`respaldo-reservaciones-${todayISO()}.json`, exportBackup(), 'application/json')
  }

  /** Traslado desde el programa anterior: convierte ids, sube fotos a Supabase, agrega lo nuevo y sincroniza. */
  async function onMigrateFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !tenant) return
    setBusy(true); setRows(null)
    try {
      const incoming = normalizeData(JSON.parse(await file.text()))
      if (!confirm(`Se agregarán a «${tenant.name}»: ${incoming.reservations.length} reservaciones, ${incoming.rooms.length} habitaciones y ${incoming.quotes.length} cotizaciones. Lo que ya exista no se duplica. ¿Continuar?`)) return
      let data = await convertIds(incoming, tenant.id)
      const orphans = orphanRoomRefs(data)
      if (orphans > 0 && !confirm(`${orphans} reservaciones usan habitaciones que ya no existen en el respaldo; quedarán en conflicto para que les asignes habitación. ¿Seguir?`)) return
      const clash = overlapCount(data)
      if (clash > 0 && !confirm(`${clash} reservaciones se traslapan con otra en la misma habitación y noches. Se pasarán, pero quedarán marcadas «sin guardar» hasta que cambies su habitación o fechas. ¿Seguir?`)) return
      const refs = legacyPhotoRefs(data)
      let failed = 0
      if (refs.length > 0) {
        setMsg(`Pasando ${refs.length} fotos…`)
        const r = await migratePhotos(refs, tenant.id, oldServer, (n, t) => setMsg(`Pasando fotos ${n} de ${t}…`))
        data = remapPhotos(data, r.map)
        failed = r.failed.length
      }
      const { reservations: n } = importBackup(JSON.stringify(data), 'merge')
      if (withSettings) {
        const now = new Date().toISOString()
        const cur = getData()
        const settings = { ...data.settings, nextFolio: Math.max(cur.settings.nextFolio, data.settings.nextFolio), nextReceipt: Math.max(cur.settings.nextReceipt, data.settings.nextReceipt) }
        commit({ ...cur, settings, settingsAt: { ...cur.settingsAt, ...Object.fromEntries(Object.keys(settings).map((k) => [k, now])) } }, true)
      }
      setMsg(`Listo: ${n} reservaciones nuevas.${failed ? ` ${failed} fotos no se pudieron pasar; vuelve a subirlas desde Ajustes.` : ''} Sincronizando…`)
      await syncNow(tenant.id)
      setRows(await verifyCloud(tenant.id))
      setMsg(`Listo: ${n} reservaciones nuevas.${failed ? ` ${failed} fotos no se pudieron pasar; vuelve a subirlas desde Ajustes.` : ''} Revisa que los números de abajo coincidan.`)
    } catch {
      setMsg('No se pudo pasar el archivo. ¿Es un respaldo .json del programa anterior?')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (!tenant) return
    setBusy(true)
    try { setRows(await verifyCloud(tenant.id)) } catch { setMsg('No se pudo consultar la nube. Revisa tu conexión.') } finally { setBusy(false) }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (importMode === 'replace' && !confirm('Esto reemplaza TODOS los datos de este dispositivo por los del archivo. ¿Continuar?')) return
    try {
      const { reservations: n } = importBackup(await file.text(), importMode)
      setMsg(importMode === 'replace' ? `Datos reemplazados (${n} reservaciones).` : `Se agregaron ${n} reservaciones nuevas.`)
    } catch {
      setMsg('El archivo no es un respaldo válido.')
    }
  }

  return (
      <section className="card">
        <h2>Respaldo de datos</h2>
        <p className="muted">
          Copia manual en un archivo. Tus datos viven en este navegador/dispositivo; si borras los datos del navegador se pierden. Para tenerlos en todos tus dispositivos usa «Respaldo y sincronización con el servidor»; este archivo sirve como copia extra o para pasar datos sin servidor.
          {lastBackup ? ` Último respaldo: ${new Date(lastBackup).toLocaleString('es-MX')}.` : ' Aún no has descargado un respaldo.'}
        </p>
        {cloud && (
          <div className="stack">
            <h3>Pasar datos del programa anterior</h3>
            <p className="muted">Elige el respaldo (.json) del programa anterior. Antes, descarga un respaldo allá y guárdalo. Los datos se agregan a «{tenant?.name}» y no se duplican si repites el paso.</p>
            <label className="check"><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} /> Pasar también tarifas, ajustes y contenido de la página</label>
            <label className="field"><span>Servidor anterior (de donde se bajan las fotos)</span><input value={oldServer} onChange={(e) => setOldServer(e.target.value)} /></label>
            <div className="row wrap">
              <button className="btn primary" disabled={busy} onClick={() => migrateRef.current?.click()}>{busy ? 'Trabajando…' : 'Elegir respaldo…'}</button>
              <button className="btn" disabled={busy} onClick={() => void verify()}>Verificar contra la nube</button>
              <input ref={migrateRef} type="file" accept="application/json,.json" hidden onChange={onMigrateFile} />
            </div>
            {rows && (
              <table className="doc-table">
                <thead><tr><th>Concepto</th><th>Este dispositivo</th><th>Nube</th><th /></tr></thead>
                <tbody>{rows.map((r) => (<tr key={r.label}><td>{r.label}</td><td>{r.local}</td><td>{r.cloud}</td><td>{r.local === r.cloud ? '✓' : '⚠'}</td></tr>))}</tbody>
              </table>
            )}
          </div>
        )}
        <div className="row wrap">
          <button className="btn primary" onClick={backup}>Descargar respaldo (.json)</button>
          {!cloud && <select aria-label="Modo de importación" value={importMode} onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}>
            <option value="merge">Importar: agregar lo nuevo</option>
            <option value="replace">Importar: reemplazar todo</option>
          </select>}
          {!cloud && <button className="btn" onClick={() => fileRef.current?.click()}>Elegir archivo…</button>}
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
        </div>
        {msg && <div className="banner info">{msg}</div>}
        {!cloud && <div className="row">
          <button
            className="btn ghost"
            onClick={() => confirm('¿Borrar TODAS las reservaciones y ajustes de este dispositivo? Descarga un respaldo antes.') && clearAll()}
          >
            Borrar todos los datos
          </button>
        </div>}
      </section>
  )
}
