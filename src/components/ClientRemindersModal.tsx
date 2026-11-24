import { useMemo, useState } from 'react'
import { clientReminders, kindLabel, renderTemplate } from '../lib/clientReminders'
import { formatShort } from '../lib/dates'
import { roomNames, whatsappLink } from '../lib/messages'
import { markClientReminder, useData } from '../store'
import type { Nav } from '../nav'

export default function ClientRemindersModal({ onClose, nav }: { onClose: () => void; nav: Nav }) {
  const { reservations, rooms, settings } = useData()
  const { due, sent } = useMemo(() => clientReminders(reservations, settings), [reservations, settings])
  const [copied, setCopied] = useState('')

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
    } catch {
      setCopied('')
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Recordatorios a clientes</h2>
          <button className="btn small" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <p className="muted">
          Toca «Enviar por WhatsApp»: se abre el chat del cliente con el mensaje ya escrito y tú solo pulsas enviar. Se marca como enviado para no repetirlo. Los momentos y el texto se cambian en Ajustes.
        </p>

        <h3>Por enviar ({due.length})</h3>
        {due.length === 0 && <p className="muted">No hay recordatorios pendientes. 🎉</p>}
        <ul className="list">
          {due.map(({ r, kind }) => {
            const text = renderTemplate(settings.clientTemplate, r, rooms, settings)
            return (
              <li key={r.id} className="rem-item">
                <div className="row between wrap">
                  <span className="grow">
                    <strong>{r.guest || 'Sin nombre'}</strong>
                    <small>
                      {formatShort(r.checkIn)}{r.arrivalTime ? ` · ${r.arrivalTime}` : ''} · {roomNames(r, rooms)} · {kindLabel(kind)}
                    </small>
                  </span>
                  <a
                    className="btn primary small"
                    href={whatsappLink(r.phone, text)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => markClientReminder(r.id, kind, true)}
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
                {!r.phone && <small className="warn-text">Sin teléfono: WhatsApp abrirá sin destinatario y eliges el chat.</small>}
                <details>
                  <summary>Ver mensaje</summary>
                  <pre className="rem-text">{text}</pre>
                  <div className="row wrap">
                    <button className="btn small" onClick={() => copy(r.id, text)}>{copied === r.id ? 'Copiado' : 'Copiar texto'}</button>
                    <button className="btn small ghost" onClick={() => { nav.openReservation(r.id); nav.go('reservas'); onClose() }}>Abrir reservación</button>
                  </div>
                </details>
              </li>
            )
          })}
        </ul>

        {sent.length > 0 && (
          <>
            <h3>Ya enviados ({sent.length})</h3>
            <ul className="list">
              {sent.map(({ r, kind, sentAt }) => (
                <li key={r.id} className="rem-item">
                  <div className="row between wrap">
                    <span className="grow">
                      <strong>{r.guest || 'Sin nombre'}</strong>
                      <small>{formatShort(r.checkIn)} · {kindLabel(kind)} · enviado {sentAt ? when(sentAt) : ''}</small>
                    </span>
                    <button className="btn small ghost" onClick={() => markClientReminder(r.id, kind, false)}>Deshacer</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
