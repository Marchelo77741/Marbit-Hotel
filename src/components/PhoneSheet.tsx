import { forwardRef } from 'react'
import { logoDataUrl } from '../lib/brand'
import type { PhoneCard, PhoneReport } from '../lib/phoneReport'

export const PHONE_W = 420

function Pay({ c }: { c: PhoneCard }) {
  return <span className={c.paid ? 'ps-chip ok' : 'ps-chip debt'}>{c.pay}</span>
}

function Big({ c, kind }: { c: PhoneCard; kind: 'arrive' | 'leave' }) {
  return (
    <div className={`ps-card ${kind}`}>
      <div className={c.rooms.length > 3 ? 'ps-room small' : 'ps-room'}>{c.rooms}</div>
      <div className="ps-main">
        <div className="ps-name">{c.guest}</div>
        <div className="ps-sub">
          {c.guests} {c.guests === 1 ? 'persona' : 'personas'}
          {kind === 'arrive' && <> · <b className="ps-time">{c.time ? `llega ${c.time}` : 'sin hora'}</b></>}
        </div>
        <div className="ps-chips">
          <Pay c={c} />
          {c.pending && <span className="ps-chip wait">POR CONFIRMAR</span>}
        </div>
      </div>
    </div>
  )
}

const PhoneSheet = forwardRef<HTMLDivElement, { report: PhoneReport; businessName: string; generated: string }>(
  ({ report, businessName, generated }, ref) => (
    <div className="psheet" ref={ref} style={{ width: PHONE_W }}>
      <div className="ps-head">
        <img src={logoDataUrl} alt="" />
        <div>
          <div className="ps-biz">{businessName}</div>
          <div className="ps-title">{report.title}</div>
          <div className="ps-range">{report.range}</div>
        </div>
      </div>
      <div className="ps-summary">{report.summary.map((s) => <span key={s}>{s}</span>)}</div>

      {report.days.map((d) => {
        const empty = d.arrivals.length + d.departures.length + d.stays.length === 0
        return (
          <section key={d.date} className="ps-day">
            <div className={d.isToday ? 'ps-dayhead today' : 'ps-dayhead'}>{d.label}</div>
            {empty && <div className="ps-none">Sin movimientos</div>}
            {d.arrivals.length > 0 && (
              <>
                <div className="ps-group arrive">LLEGAN ({d.arrivals.length})</div>
                {d.arrivals.map((c) => <Big key={c.id} c={c} kind="arrive" />)}
              </>
            )}
            {d.departures.length > 0 && (
              <>
                <div className="ps-group leave">SALEN ({d.departures.length})</div>
                {d.departures.map((c) => <Big key={c.id} c={c} kind="leave" />)}
              </>
            )}
            {d.stays.length > 0 && (
              <>
                <div className="ps-group stay">SIGUEN HOSPEDADOS ({d.stays.length})</div>
                {d.stays.map((c) => (
                  <div key={c.id} className="ps-stay">
                    <b>{c.rooms}</b>
                    <span>{c.guest}</span>
                    <Pay c={c} />
                  </div>
                ))}
              </>
            )}
          </section>
        )
      })}
      <div className="ps-foot">Generado {generated}</div>
    </div>
  ),
)
PhoneSheet.displayName = 'PhoneSheet'
export default PhoneSheet
