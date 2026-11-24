import { CLIENT_KINDS, DEFAULT_CLIENT_TEMPLATE, TEMPLATE_FIELDS, kindLabel, renderTemplate } from '../../lib/clientReminders'
import { saveSettings, useData } from '../../store'
import { addDays, todayISO } from '../../lib/dates'
import type { Reservation, Settings } from '../../types'

const KEY: Record<number, keyof Settings> = { 7: 'clientRemind7', 3: 'clientRemind3', 1: 'clientRemind1', 0: 'clientRemind0' }

export function ClientRemindersCard() {
  const { settings, rooms } = useData()
  const sample: Reservation = {
    id: 'ejemplo', folio: 1, guest: 'Ana López', phone: '', guests: 2, checkIn: addDays(todayISO(), 1), checkOut: addDays(todayISO(), 3),
    arrivalTime: '15:00', rooms: rooms.slice(0, 1).map((r) => ({ roomId: r.id, nightlyRate: 850 })), total: 1700, status: 'confirmada',
    notes: '', payments: [], createdAt: '',
  }
  return (
    <section className="card">
      <h2>Recordatorios a clientes (WhatsApp)</h2>
      <p className="muted">
        La app te muestra una lista de a quién recordarle y, con un toque por cliente, abre WhatsApp con el mensaje listo. No se envían solos: WhatsApp no lo permite desde una app web sin su servicio de pago.
      </p>
      <div className="checks">
        {CLIENT_KINDS.map((k) => (
          <label className="check" key={k}>
            <input type="checkbox" checked={Boolean(settings[KEY[k]])} onChange={(e) => saveSettings({ [KEY[k]]: e.target.checked })} />
            {kindLabel(k)}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Texto del mensaje</span>
        <textarea rows={7} value={settings.clientTemplate} onChange={(e) => saveSettings({ clientTemplate: e.target.value })} />
      </label>
      <p className="muted">Datos que se llenan solos: {TEMPLATE_FIELDS.join(' ')}. Las líneas sin datos (por ejemplo sin dirección) se omiten.</p>
      <div className="row wrap">
        <button className="btn small" onClick={() => saveSettings({ clientTemplate: DEFAULT_CLIENT_TEMPLATE })}>Restaurar texto original</button>
      </div>
      <h3>Así se verá</h3>
      <pre className="rem-text">{renderTemplate(settings.clientTemplate, sample, rooms, settings)}</pre>
    </section>
  )
}
