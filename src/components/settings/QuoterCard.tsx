import { saveCatalog, saveSettings, uid, useData } from '../../store'
import { parseAmount } from '../../lib/util'
import type { CatalogItem, ItemType } from '../../types'

export function QuoterCard() {
  const { settings, catalog } = useData()

  function updateItem(id: string, patch: Partial<CatalogItem>) {
    saveCatalog(catalog.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function addItem() {
    saveCatalog([...catalog, { id: uid(), type: 'Servicio', name: 'Nuevo concepto', desc: '', price: 0, cap: 0 }])
  }

  return (
      <section className="card">
        <h2>Cotizador</h2>
        <div className="grid2">
          <label className="field">
            <span>Prefijo del folio</span>
            <input value={settings.quotePrefix} onChange={(e) => saveSettings({ quotePrefix: e.target.value.toUpperCase() })} />
          </label>
          <label className="field">
            <span>Siguiente número</span>
            <input type="number" min={1} value={settings.nextQuote} onChange={(e) => saveSettings({ nextQuote: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.quoteAnnual} onChange={(e) => saveSettings({ quoteAnnual: e.target.checked })} />
            Reiniciar el número cada año (COT-2026-001)
          </label>
          <label className="field">
            <span>Modalidad (aparece en la cotización)</span>
            <input value={settings.quoteMode} onChange={(e) => saveSettings({ quoteMode: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Notas y condiciones de la cotización (una por línea; {'{tel}'} se cambia por el teléfono)</span>
          <textarea rows={4} value={settings.quoteNotes} onChange={(e) => saveSettings({ quoteNotes: e.target.value })} />
        </label>

        <h3>Catálogo de conceptos</h3>
        <div className="rooms-edit">
          {catalog.map((c) => (
            <div className="cat-row" key={c.id}>
              <select aria-label="Tipo" value={c.type} onChange={(e) => updateItem(c.id, { type: e.target.value as ItemType })}>
                <option value="Hospedaje">Hospedaje</option>
                <option value="Servicio">Servicio</option>
                <option value="Alimento">Alimento</option>
              </select>
              <input aria-label="Nombre" value={c.name} onChange={(e) => updateItem(c.id, { name: e.target.value })} />
              <input aria-label="Precio" inputMode="decimal" value={c.price} onChange={(e) => updateItem(c.id, { price: parseAmount(e.target.value) })} />
              <input aria-label="Personas por habitación" type="number" min={0} max={10} title="Personas por unidad (hospedaje)" value={c.cap} onChange={(e) => updateItem(c.id, { cap: Math.max(0, Number(e.target.value) || 0) })} />
              <input className="cat-desc" aria-label="Descripción" value={c.desc} onChange={(e) => updateItem(c.id, { desc: e.target.value })} placeholder="Descripción" />
              <button className="btn small ghost" aria-label="Eliminar concepto" onClick={() => confirm(`¿Quitar "${c.name}" del catálogo? Las cotizaciones ya hechas no cambian.`) && saveCatalog(catalog.filter((x) => x.id !== c.id))}>🗑</button>
            </div>
          ))}
        </div>
        <button className="btn" onClick={addItem}>＋ Agregar concepto</button>
      </section>
  )
}
