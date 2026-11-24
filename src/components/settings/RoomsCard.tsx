import { saveRooms, uid, useData } from '../../store'
import { parseAmount } from '../../lib/util'
import type { Room, RoomStatus, RoomType } from '../../types'
import { PhotoList } from './PhotoList'

const STATUS_LABEL: Record<RoomStatus, string> = {
  disponible: 'Disponible (se ve y pueden pedir informes)',
  'no-disponible': 'No disponible (se ve, sin botón de informes)',
  oculta: 'Oculta (no aparece en la página)',
}

export function RoomsCard() {
  const { rooms, settings } = useData()

  function updateRoom(id: string, patch: Partial<Room>) {
    saveRooms(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRoom() {
    const nums = rooms.map((r) => parseInt(r.name, 10)).filter((n) => !Number.isNaN(n))
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    saveRooms([...rooms, { id: uid(), name: String(next), type: 'sencilla', capacity: 1, active: true }])
  }

  return (
    <section className="card">
      <h2>Habitaciones</h2>
      <p className="muted">Aquí editas los datos de cada habitación, sus fotos y cómo se ve en la página web. Las fotos y los cambios se publican al sincronizar con el servidor.</p>
      <div className="rooms-edit">
        {rooms.map((r) => {
          const status = r.status ?? 'disponible'
          return (
            <details className="room-edit" key={r.id}>
              <summary>
                <span>Habitación {r.name}</span>
                <span className="muted">
                  {r.type === 'doble' ? 'doble' : 'sencilla'} · {r.capacity}p{!r.active ? ' · inactiva' : status === 'oculta' ? ' · oculta en la página' : status === 'no-disponible' ? ' · no disponible' : ''}
                  {(r.photos?.length ?? 0) > 0 ? ` · ${r.photos!.length} foto${r.photos!.length === 1 ? '' : 's'}` : ''}
                </span>
              </summary>
              <div className="room-row">
                <input aria-label="Nombre" value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} />
                <select
                  aria-label="Tipo"
                  value={r.type}
                  onChange={(e) => {
                    const type = e.target.value as RoomType
                    updateRoom(r.id, { type, capacity: type === 'doble' ? Math.max(2, r.capacity) : r.capacity })
                  }}
                >
                  <option value="sencilla">Sencilla</option>
                  <option value="doble">Doble</option>
                </select>
                <input aria-label="Capacidad" type="number" min={1} max={10} value={r.capacity} onChange={(e) => updateRoom(r.id, { capacity: Math.max(1, Number(e.target.value) || 1) })} />
                <label className="check"><input type="checkbox" checked={r.active} onChange={(e) => updateRoom(r.id, { active: e.target.checked })} /> activa</label>
              </div>
              <label className="field">
                <span>Estado en la página</span>
                <select value={status} onChange={(e) => updateRoom(r.id, { status: e.target.value as RoomStatus })}>
                  {(Object.keys(STATUS_LABEL) as RoomStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Descripción para la página</span>
                <textarea rows={3} value={r.description ?? ''} onChange={(e) => updateRoom(r.id, { description: e.target.value })} placeholder="Cama matrimonial, baño privado, vista al jardín…" />
              </label>
              <div className="grid2">
                <label className="check"><input type="checkbox" checked={Boolean(r.showPrice)} onChange={(e) => updateRoom(r.id, { showPrice: e.target.checked })} /> Mostrar el precio en la página</label>
                {r.showPrice && (
                  <label className="field">
                    <span>Precio por noche que se muestra (vacío = el precio base de {r.type === 'doble' ? 'doble' : 'sencilla'}: ${r.type === 'doble' ? settings.rateDoble : settings.rateSencilla})</span>
                    <input inputMode="decimal" value={r.publicPrice ?? ''} onChange={(e) => updateRoom(r.id, { publicPrice: e.target.value ? parseAmount(e.target.value) : undefined })} />
                  </label>
                )}
              </div>
              <div className="field">
                <span>Fotos (la primera es la principal)</span>
                <PhotoList items={(r.photos ?? []).map((photo) => ({ photo }))} onChange={(items) => updateRoom(r.id, { photos: items.map((i) => i.photo) })} />
              </div>
            </details>
          )
        })}
      </div>
      <button className="btn" onClick={addRoom}>＋ Agregar habitación</button>
    </section>
  )
}
