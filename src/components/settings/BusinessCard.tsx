import { saveSettings, useData } from '../../store'
import { parseAmount } from '../../lib/util'

export function BusinessCard() {
  const { settings } = useData()

  return (
      <section className="card">
        <h2>Tarifas y datos del negocio</h2>
        <div className="grid2">
          <label className="field">
            <span>Precio base habitación sencilla (noche)</span>
            <input inputMode="decimal" value={settings.rateSencilla} onChange={(e) => saveSettings({ rateSencilla: parseAmount(e.target.value) })} />
          </label>
          <label className="field">
            <span>Precio base habitación doble (noche)</span>
            <input inputMode="decimal" value={settings.rateDoble} onChange={(e) => saveSettings({ rateDoble: parseAmount(e.target.value) })} />
          </label>
          <label className="field">
            <span>Nombre del negocio (aparece en recibos)</span>
            <input value={settings.businessName} onChange={(e) => saveSettings({ businessName: e.target.value })} />
          </label>
          <label className="field">
            <span>Teléfono</span>
            <input value={settings.phone} onChange={(e) => saveSettings({ phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Dirección</span>
            <input value={settings.address} onChange={(e) => saveSettings({ address: e.target.value })} />
          </label>
          <div className="grid2 tight">
            <label className="field">
              <span>Entrada</span>
              <input type="time" value={settings.checkInTime} onChange={(e) => saveSettings({ checkInTime: e.target.value })} />
            </label>
            <label className="field">
              <span>Salida</span>
              <input type="time" value={settings.checkOutTime} onChange={(e) => saveSettings({ checkOutTime: e.target.value })} />
            </label>
          </div>
        </div>
        <label className="field">
          <span>Nota al pie de recibos y confirmaciones</span>
          <textarea rows={2} value={settings.policyNote} onChange={(e) => saveSettings({ policyNote: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Correos del equipo (separados por coma)</span>
            <input value={settings.teamEmails} onChange={(e) => saveSettings({ teamEmails: e.target.value })} placeholder="ana@correo.com, luis@correo.com" />
          </label>
          <label className="field">
            <span>WhatsApp del equipo (opcional, un número)</span>
            <input inputMode="tel" value={settings.teamWhatsapp} onChange={(e) => saveSettings({ teamWhatsapp: e.target.value })} placeholder="55 1234 5678" />
          </label>
        </div>
        <p className="muted">El precio base se propone al reservar; en cada reserva puedes cambiarlo (temporada alta, descuentos).</p>
      </section>
  )
}
