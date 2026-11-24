import { useState } from 'react'
import { deleteInquiry, setInquiryStatus, useData } from '../store'
import { formatShort } from '../lib/dates'
import { whatsappLink } from '../lib/messages'
import { pushBackup, isConfigured } from '../lib/remoteBackup'
import type { Inquiry } from '../types'
import type { Nav } from '../nav'

const STATUS_LABEL: Record<Inquiry['status'], string> = { nueva: 'Nueva', atendida: 'Atendida', descartada: 'Descartada' }

function replyText(i: Inquiry, business: string): string {
  const fechas = i.checkIn && i.checkOut ? ` del ${formatShort(i.checkIn)} al ${formatShort(i.checkOut)}` : ''
  const hab = i.roomName ? ` de la habitación ${i.roomName}` : ''
  return `Hola ${i.name.split(' ')[0]}, gracias por tu interés en ${business}. Recibimos tu solicitud de informes${hab}${fechas}. `
}

export default function Inquiries({ nav }: { nav: Nav }) {
  const { inquiries, settings } = useData()
  const [filter, setFilter] = useState<'nueva' | 'todas'>('nueva')
  const [msg, setMsg] = useState('')
  const list = [...inquiries].filter((i) => filter === 'todas' || i.status === 'nueva').sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  async function refresh() {
    setMsg('Buscando solicitudes nuevas…')
    const r = await pushBackup()
    setMsg(r.message)
  }

  function toReservation(i: Inquiry) {
    const contact = i.channel === 'email' && i.email ? `Correo: ${i.email}. ` : ''
    nav.newReservation({
      checkIn: i.checkIn || undefined,
      checkOut: i.checkOut || undefined,
      roomId: i.roomId || undefined,
      guest: i.name,
      phone: i.phone,
      guests: i.guests || undefined,
      notes: `${contact}${i.message}`.trim() || undefined,
    })
    setInquiryStatus(i.id, 'atendida')
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <h2>Solicitudes de la página</h2>
          <div className="row">
            <button className={`btn small${filter === 'nueva' ? ' primary' : ''}`} onClick={() => setFilter('nueva')}>Nuevas</button>
            <button className={`btn small${filter === 'todas' ? ' primary' : ''}`} onClick={() => setFilter('todas')}>Todas</button>
            {isConfigured() && <button className="btn small" onClick={() => void refresh()}>Actualizar</button>}
          </div>
        </div>
        <p className="muted">Aquí llegan las solicitudes de informes que los visitantes envían desde casaelagave.com. Cada uno dejó su WhatsApp o su correo para recibir la información.</p>
        {msg && <div className="banner info" role="status">{msg}</div>}
        {list.length === 0 && <p className="muted">{filter === 'nueva' ? 'No hay solicitudes nuevas.' : 'Todavía no hay solicitudes.'}</p>}
        <div className="stack">
          {list.map((i) => {
            const text = replyText(i, settings.businessName)
            const mail = `mailto:${i.email}?subject=${encodeURIComponent(`Informes ${settings.businessName}`)}&body=${encodeURIComponent(text)}`
            return (
              <div key={i.id} className={`inq ${i.status}`}>
                <div className="row between wrap">
                  <strong>{i.name}</strong>
                  <span className={i.status === 'nueva' ? 'badge wait' : 'badge ok'}>{STATUS_LABEL[i.status]}</span>
                </div>
                <small className="muted">
                  {new Date(i.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  {i.roomName ? ` · Habitación ${i.roomName}` : ' · Informes generales'}
                </small>
                <div>
                  {i.checkIn && i.checkOut ? `${formatShort(i.checkIn)} → ${formatShort(i.checkOut)}` : 'Sin fechas'}
                  {i.guests ? ` · ${i.guests} persona${i.guests === 1 ? '' : 's'}` : ''}
                </div>
                {i.message && <div>“{i.message}”</div>}
                <div>
                  {i.channel === 'whatsapp' ? <>WhatsApp: <strong>{i.phone}</strong></> : <>Correo: <strong>{i.email}</strong></>}
                </div>
                <div className="row wrap">
                  {i.channel === 'whatsapp' ? (
                    <a className="btn small primary" href={whatsappLink(i.phone, text)} target="_blank" rel="noreferrer">Responder por WhatsApp</a>
                  ) : (
                    <a className="btn small primary" href={mail}>Responder por correo</a>
                  )}
                  <button className="btn small" onClick={() => toReservation(i)}>Crear reserva</button>
                  {i.status === 'nueva' ? (
                    <>
                      <button className="btn small" onClick={() => setInquiryStatus(i.id, 'atendida')}>Marcar atendida</button>
                      <button className="btn small" onClick={() => setInquiryStatus(i.id, 'descartada')}>Descartar</button>
                    </>
                  ) : (
                    <button className="btn small" onClick={() => setInquiryStatus(i.id, 'nueva')}>Volver a nueva</button>
                  )}
                  <button className="btn small danger" onClick={() => confirm('¿Borrar esta solicitud?') && deleteInquiry(i.id)}>Borrar</button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
