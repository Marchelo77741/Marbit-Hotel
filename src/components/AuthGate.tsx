import { useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { cloudEnabled, supabase } from '../lib/supabase'
import { CloudScope } from './CloudSync'

type Mode = 'entrar' | 'crear' | 'olvide'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <div className="content">
        <section className="card" style={{ maxWidth: 420, margin: '10vh auto 0' }}>
          <h2>Marbit-Hotel</h2>
          {children}
        </section>
      </div>
    </div>
  )
}

function Login() {
  const [mode, setMode] = useState<Mode>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError(''); setMsg(''); setBusy(true)
    const mail = email.trim().toLowerCase()
    try {
      if (mode === 'olvide') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: window.location.origin })
        if (err) setError('No se pudo enviar el correo. Revisa la dirección.')
        else setMsg('Si el correo existe, te enviamos un enlace para cambiar la contraseña.')
      } else if (mode === 'crear') {
        if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
        const { data, error: err } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: window.location.origin } })
        if (err) setError(err.message.includes('registered') ? 'Ese correo ya tiene cuenta. Entra con tu contraseña.' : 'No se pudo crear la cuenta. Intenta de nuevo.')
        else if (!data.session) setMsg('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego entra aquí.')
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password })
        if (err) setError('Correo o contraseña incorrectos.')
      }
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <form className="stack" onSubmit={submit}>
        <p className="muted">{mode === 'crear' ? 'Crea tu cuenta para administrar tu posada.' : mode === 'olvide' ? 'Te enviamos un enlace para cambiar tu contraseña.' : 'Entra para ver las reservaciones de tu posada.'}</p>
        <label className="field"><span>Correo</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== 'olvide' && (
          <label className="field"><span>Contraseña</span>
            <input type="password" autoComplete={mode === 'crear' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        )}
        {error && <div className="banner warn-text">{error}</div>}
        {msg && <div className="banner">{msg}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Un momento…' : mode === 'crear' ? 'Crear cuenta' : mode === 'olvide' ? 'Enviar enlace' : 'Entrar'}</button>
        <div className="row">
          {mode !== 'entrar' && <button type="button" className="link" onClick={() => setMode('entrar')}>Ya tengo cuenta</button>}
          {mode !== 'crear' && <button type="button" className="link" onClick={() => setMode('crear')}>Crear cuenta</button>}
          {mode === 'entrar' && <button type="button" className="link" onClick={() => setMode('olvide')}>Olvidé mi contraseña</button>}
        </div>
      </form>
    </Shell>
  )
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
}

function Onboarding() {
  const { reload, signOut, session } = useAuth()
  const [name, setName] = useState('')
  const [nick, setNick] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError(''); setBusy(true)
    const { error: err } = await supabase.rpc('create_tenant', { p_nickname: nick, p_name: name.trim() })
    setBusy(false)
    if (err) {
      setError(/duplicate|unique|ya existe/i.test(err.message) ? 'Ese nombre corto ya está en uso. Prueba otro.' : 'No se pudo crear la posada. Revisa el nombre corto (letras, números y guiones, mínimo 3).')
      return
    }
    await reload()
  }

  return (
    <Shell>
      <form className="stack" onSubmit={create}>
        <p className="muted">Cuenta: {session?.user.email}. Crea tu posada para empezar. Si te invitaron a una, pide que te inviten con este mismo correo y recarga.</p>
        <label className="field"><span>Nombre de la posada</span>
          <input value={name} onChange={(e) => { setName(e.target.value); if (!touched) setNick(slug(e.target.value)) }} required />
        </label>
        <label className="field"><span>Nombre corto (para tu dirección web)</span>
          <input value={nick} onChange={(e) => { setTouched(true); setNick(slug(e.target.value)) }} required minLength={3} />
        </label>
        {error && <div className="banner warn-text">{error}</div>}
        <button className="btn" disabled={busy || nick.length < 3 || name.trim().length < 2}>{busy ? 'Creando…' : 'Crear mi posada'}</button>
        <div className="row">
          <button type="button" className="link" onClick={() => void reload()}>Ya me invitaron: recargar</button>
          <button type="button" className="link" onClick={() => void signOut()}>Salir</button>
        </div>
      </form>
    </Shell>
  )
}

/** Sin configuración de nube la app funciona como antes. Con nube: sesión y posada son obligatorias. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, tenant } = useAuth()
  if (!cloudEnabled) return <>{children}</>
  if (loading) return <Shell><p className="muted">Cargando…</p></Shell>
  if (!session) return <Login />
  if (!tenant) return <Onboarding />
  return <CloudScope>{children}</CloudScope>
}
