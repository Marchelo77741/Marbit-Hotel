import { forwardRef } from 'react'
import { logoDataUrl as logo } from '../lib/brand'
import { quoteDateLong, dayWithYear, numLetras, quoteMoney, quoteNights, quoteNoteLines, quoteRoomsText, quoteStayText, quoteTotals } from '../lib/quotes'
import type { Quote, Settings } from '../types'

interface Props {
  quote: Quote
  settings: Settings
  /** folio a mostrar (el definitivo o el que se asignará al guardar) */
  folio: string
}

/** Hoja tamaño carta (816 px) de la cotización, con la marca de Casa El Agave. */
const QuoteSheet = forwardRef<HTMLDivElement, Props>(function QuoteSheet({ quote: q, settings: s, folio }, ref) {
  const t = quoteTotals(q)
  const nights = quoteNights(q)
  const hm = (v: string) => (v ? `${v} hrs` : '—')
  const subs: [string, string, number][] = [
    ['Hospedaje', 'Subtotal Hospedaje', t.Hospedaje],
    ['Servicio', 'Subtotal Servicios', t.Servicio],
    ['Alimento', 'Subtotal Alimentos', t.Alimento],
  ]
  const total = nights > 1 ? t.stay : t.night

  return (
    <div className="qsheet" ref={ref}>
      <div className="q-top">
        <img src={logo} alt={s.businessName} />
        <div className="q-emp">
          <h1>{s.businessName}</h1>
          <div>{s.address}</div>
          <div>Teléfono: {s.phone}</div>
        </div>
      </div>

      <div className="q-tit">
        <h2>COTIZACIÓN DE HOSPEDAJE</h2>
        <div className="q-meta">
          <b>Folio:</b> {folio}
          <br />
          <b>Fecha:</b> {quoteDateLong(q.date)}
        </div>
      </div>

      <div className="q-cajas">
        <div className="q-caja">
          <h4>Atención a:</h4>
          <b>Cliente:</b> {q.client || '[Nombre del Cliente]'}
          <br />
          <b>Huéspedes:</b> {q.guests} persona{q.guests === 1 ? '' : 's'}
          <br />
          <b>Habitaciones:</b> {quoteRoomsText(q)}
        </div>
        <div className="q-caja">
          <h4>Horarios de Estancia:</h4>
          <b>Check-in:</b> {hm(q.checkInTime)}
          <br />
          <b>Check-out:</b> {hm(q.checkOutTime)}
          <br />
          {(q.arrival || q.departure) && (
            <>
              <b>Estancia:</b> {quoteStayText(q)}
              <br />
            </>
          )}
          <b>Modalidad:</b> {s.quoteMode}
        </div>
      </div>

      <div className="q-sec">DESGLOSE DE SERVICIOS</div>
      <table className="q-tab">
        <thead>
          <tr>
            <th>CONCEPTO / DESCRIPCIÓN</th>
            <th className="c">CANTIDAD</th>
            <th className="r">
              PRECIO
              <br />
              UNITARIO
            </th>
            <th className="r">SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>Sin conceptos</td>
            </tr>
          ) : (
            q.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <b>{l.name}</b>
                  {l.desc && <small>{l.desc}</small>}
                </td>
                <td className="c">{l.qty}</td>
                <td className="r">{quoteMoney(l.price)}</td>
                <td className="r">{quoteMoney(l.price * l.qty)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="q-tot">
        {subs
          .filter(([k]) => q.lines.some((l) => l.type === k))
          .map(([k, label, v]) => (
            <div className="l" key={k}>
              <span>{label}:</span>
              <span>{quoteMoney(v)}</span>
            </div>
          ))}
        <div className="g">
          <span>Total por Noche:</span>
          <span>{quoteMoney(t.night)}</span>
        </div>
        {nights > 1 && (
          <div className="g2">
            <span>Total {nights} noches:</span>
            <span>{quoteMoney(t.stay)}</span>
          </div>
        )}
        <div className="letra">({numLetras(total)})</div>
      </div>

      <div className="q-notas">
        <h5>Notas y Condiciones de Reservación:</h5>
        <ul>
          {quoteNoteLines(s, q).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <div className="q-firma">
        <b>{s.businessName}</b>
        <small>Atención y Reservaciones</small>
      </div>
      <div className="q-pie">
        <span>{s.businessName} — Valle de Bravo</span>
        <span>{q.arrival ? dayWithYear(q.arrival) : ''}</span>
      </div>
    </div>
  )
})

export default QuoteSheet
