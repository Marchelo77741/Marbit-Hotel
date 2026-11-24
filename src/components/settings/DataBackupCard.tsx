import { useRef, useState } from 'react'
import { clearAll, exportBackup, importBackup, useData } from '../../store'
import { download } from '../../lib/util'
import { todayISO } from '../../lib/dates'

export function DataBackupCard() {
  const { lastBackup } = useData()
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  function backup() {
    download(`respaldo-reservaciones-${todayISO()}.json`, exportBackup(), 'application/json')
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
        <div className="row wrap">
          <button className="btn primary" onClick={backup}>Descargar respaldo (.json)</button>
          <select aria-label="Modo de importación" value={importMode} onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}>
            <option value="merge">Importar: agregar lo nuevo</option>
            <option value="replace">Importar: reemplazar todo</option>
          </select>
          <button className="btn" onClick={() => fileRef.current?.click()}>Elegir archivo…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
        </div>
        {msg && <div className="banner info">{msg}</div>}
        <div className="row">
          <button
            className="btn ghost"
            onClick={() => confirm('¿Borrar TODAS las reservaciones y ajustes de este dispositivo? Descarga un respaldo antes.') && clearAll()}
          >
            Borrar todos los datos
          </button>
        </div>
      </section>
  )
}
