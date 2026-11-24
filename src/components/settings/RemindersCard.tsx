import { useState } from 'react'
import { buildIcs, notificationsSupported, requestPermission, showNotification } from '../../lib/reminders'
import { saveSettings, useData } from '../../store'
import { download } from '../../lib/util'

export function RemindersCard() {
  const { settings, rooms, reservations } = useData()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    notificationsSupported() ? Notification.permission : 'unsupported',
  )

  async function enableNotifications() {
    const p = await requestPermission()
    setPerm(p)
    if (p === 'granted') await showNotification('Avisos activados', 'Verás aquí los recordatorios de llegada.', 'prueba')
  }

  function toggle(key: 'remind5' | 'remind2' | 'remind1' | 'remindToday', label: string) {
    return (
      <label className="check">
        <input type="checkbox" checked={settings[key]} onChange={(e) => saveSettings({ [key]: e.target.checked })} />
        {label}
      </label>
    )
  }

  return (
      <section className="card">
        <h2>Recordatorios de llegada</h2>
        <div className="checks">
          {toggle('remind5', '5 días antes')}
          {toggle('remind2', '2 días antes')}
          {toggle('remind1', '1 día antes')}
          {toggle('remindToday', 'El día de llegada')}
        </div>
        <div className="grid2">
          <label className="field">
            <span>Hora de los avisos de 5, 2 y 1 día</span>
            <select value={settings.morningHour} onChange={(e) => saveSettings({ morningHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Hora del aviso del día de llegada</span>
            <select value={settings.todayHour} onChange={(e) => saveSettings({ todayHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
        </div>

        <div className="banner info">
          <strong>Cómo funcionan:</strong> como los datos viven en este dispositivo, la app te avisa cuando está abierta o instalada en segundo plano.
          Para que suene <em>aunque la app esté cerrada</em>, descarga el calendario (.ics) y ábrelo en el celular y en la computadora: crea un evento por llegada con las mismas alarmas.
        </div>

        <div className="row wrap">
          {perm === 'unsupported' && <span className="muted">Este navegador no admite notificaciones.</span>}
          {perm === 'default' && <button className="btn primary" onClick={enableNotifications}>Activar avisos en este dispositivo</button>}
          {perm === 'granted' && (
            <>
              <span className="badge ok">Avisos activados</span>
              <button className="btn small" onClick={() => showNotification('Prueba de aviso', 'Así se verán tus recordatorios de llegada.', 'prueba')}>Enviar prueba</button>
            </>
          )}
          {perm === 'denied' && <span className="badge off">Avisos bloqueados: habilítalos en los permisos del sitio</span>}
          <button className="btn" onClick={() => download('llegadas-posada.ics', buildIcs(reservations, rooms, settings), 'text/calendar')}>
            Descargar calendario (.ics)
          </button>
        </div>
        <p className="muted">En iPhone, los avisos requieren instalar la app: Compartir → “Agregar a pantalla de inicio”. Si cambias reservaciones, vuelve a descargar el .ics (los eventos se actualizan por su identificador).</p>
      </section>
  )
}
