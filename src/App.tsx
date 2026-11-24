import { useCallback, useEffect, useMemo, useState } from 'react'
import Availability from './components/Availability'
import DocModal from './components/DocModal'
import ExportPdfModal from './components/ExportPdfModal'
import ClientRemindersModal from './components/ClientRemindersModal'
import ReservationDetail from './components/ReservationDetail'
import ReservationForm from './components/ReservationForm'
import Inquiries from './components/Inquiries'
import Quotes from './components/Quotes'
import Reservations from './components/Reservations'
import SettingsView from './components/SettingsView'
import { dueReminders, reminderBody, showNotification, type ReminderKind } from './lib/reminders'
import { getData, markReminderSent, useData } from './store'
import { startAutoBackup } from './lib/remoteBackup'
import { logoDataUrl } from './lib/brand'
import type { DocRequest, Nav, Prefill, Tab } from './nav'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'disponibilidad', label: 'Disponibilidad', icon: '▦' },
  { id: 'nueva', label: 'Nueva reserva', icon: '＋' },
  { id: 'reservas', label: 'Reservas', icon: '☰' },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: '＄' },
  { id: 'solicitudes', label: 'Solicitudes', icon: '✉' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙' },
]

const KIND_TITLE: Record<ReminderKind, string> = {
  d5: 'Llegadas en 5 días',
  d2: 'Llegadas en 2 días',
  d1: 'Llegadas mañana',
  d0: 'Llegadas hoy',
}

export default function App() {
  const data = useData()
  const [tab, setTab] = useState<Tab>('disponibilidad')
  const [editId, setEditId] = useState<string | undefined>()
  const [prefill, setPrefill] = useState<Prefill | undefined>()
  const [formKey, setFormKey] = useState(0)
  const [openId, setOpenId] = useState<string | undefined>()
  const [doc, setDoc] = useState<DocRequest | undefined>()
  const [exporting, setExporting] = useState(false)
  const [remindersOpen, setRemindersOpen] = useState(false)

  const nav: Nav = useMemo(
    () => ({
      go: (t) => {
        setTab(t)
        if (t !== 'nueva') setEditId(undefined)
      },
      newReservation: (p) => {
        setEditId(undefined)
        setPrefill(p)
        setFormKey((k) => k + 1)
        setTab('nueva')
        setOpenId(undefined)
      },
      editReservation: (id) => {
        setEditId(id)
        setPrefill(undefined)
        setFormKey((k) => k + 1)
        setTab('nueva')
        setOpenId(undefined)
      },
      openReservation: (id) => setOpenId(id),
      showDoc: (d) => setDoc(d),
      exportPdf: () => setExporting(true),
      clientReminders: () => setRemindersOpen(true),
    }),
    [],
  )

  // Recordatorios locales: funcionan mientras la app esté abierta (o instalada y en segundo plano).
  const checkReminders = useCallback(async () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const { reservations, settings, sentReminders, rooms } = getData()
    const due = dueReminders(reservations, settings, sentReminders)
    if (due.length === 0) return
    const byKind = new Map<ReminderKind, typeof due>()
    for (const d of due) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d])
    for (const [kind, items] of byKind) {
      await showNotification(KIND_TITLE[kind], items.map((i) => reminderBody(i, rooms)).join('\n'), `llegadas-${kind}`)
    }
    markReminderSent(due.map((d) => d.key))
  }, [])

  useEffect(() => {
    startAutoBackup()
  }, [])

  useEffect(() => {
    checkReminders()
    const t = setInterval(checkReminders, 60_000)
    const onVisible = () => document.visibilityState === 'visible' && checkReminders()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkReminders])

  const newInquiries = data.inquiries.filter((i) => i.status === 'nueva').length
  const badge = (id: Tab) => (id === 'solicitudes' && newInquiries > 0 ? ` (${newInquiries})` : '')

  const needsBackup = useMemo(() => {
    if (data.reservations.length === 0) return false
    if (!data.lastBackup) return true
    return Date.now() - new Date(data.lastBackup).getTime() > 7 * 86_400_000
  }, [data.reservations.length, data.lastBackup])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src={logoDataUrl} alt="" />
          <div>
            <strong>{data.settings.businessName}</strong>
            <small>Reservaciones</small>
          </div>
        </div>
        <nav className="tabs" aria-label="Secciones">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => nav.go(t.id)}>
              <span aria-hidden>{t.icon}</span> {t.label}{badge(t.id)}
            </button>
          ))}
        </nav>
      </header>

      {needsBackup && (
        <div className="banner warn">
          Tus datos solo viven en este dispositivo. Descarga un respaldo en <button className="link" onClick={() => nav.go('ajustes')}>Ajustes</button>.
        </div>
      )}

      <main className="content">
        {tab === 'disponibilidad' && <Availability nav={nav} />}
        {tab === 'nueva' && <ReservationForm key={formKey} editId={editId} prefill={prefill} nav={nav} />}
        {tab === 'reservas' && <Reservations nav={nav} />}
        {tab === 'cotizaciones' && <Quotes nav={nav} />}
        {tab === 'solicitudes' && <Inquiries nav={nav} />}
        {tab === 'ajustes' && <SettingsView />}
      </main>

      <nav className="bottombar" aria-label="Secciones">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'bb active' : 'bb'} onClick={() => nav.go(t.id)}>
            <span aria-hidden>{t.icon}</span>
            <small>{t.label}{badge(t.id)}</small>
          </button>
        ))}
      </nav>

      {openId && <ReservationDetail id={openId} nav={nav} onClose={() => setOpenId(undefined)} />}
      {doc && <DocModal request={doc} onClose={() => setDoc(undefined)} />}
      {exporting && <ExportPdfModal onClose={() => setExporting(false)} />}
      {remindersOpen && <ClientRemindersModal nav={nav} onClose={() => setRemindersOpen(false)} />}
    </div>
  )
}
