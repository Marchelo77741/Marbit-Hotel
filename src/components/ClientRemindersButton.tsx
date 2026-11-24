import { useMemo } from 'react'
import { clientReminders } from '../lib/clientReminders'
import { useData } from '../store'
import type { Nav } from '../nav'

/** Botón «Recordatorios a clientes» con el número de pendientes. */
export default function ClientRemindersButton({ nav, primary }: { nav: Nav; primary?: boolean }) {
  const { reservations, settings } = useData()
  const pending = useMemo(() => clientReminders(reservations, settings).due.length, [reservations, settings])
  return (
    <button className={primary && pending > 0 ? 'btn primary' : 'btn'} onClick={() => nav.clientReminders()}>
      Recordatorios a clientes{pending > 0 ? ` (${pending})` : ''}
    </button>
  )
}
