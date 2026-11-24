import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth, type Role } from '../../auth/AuthProvider'
import { cloudEnabled, supabase } from '../../lib/supabase'

interface Member { user_id: string; email: string; role: Role }
interface Invite { id: string; email: string; role: Role }
const ROLE_LABEL: Record<Role, string> = { owner: 'Dueño', reception: 'Recepción', viewer: 'Solo ver' }

export function TeamCard() {
  const { tenant, tenants, selectTenant, session, signOut } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('reception')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const isOwner = tenant?.role === 'owner'
  const tid = tenant?.id

  const load = useCallback(async () => {
    if (!supabase || !tid || !isOwner) return
    const [m, i] = await Promise.all([
      supabase.rpc('team_members', { p_tenant: tid }),
      supabase.from('invitations').select('id, email, role').eq('tenant_id', tid).is('accepted_at', null),
    ])
    setMembers((m.data ?? []) as Member[])
    setInvites((i.data ?? []) as Invite[])
  }, [tid, isOwner])

  useEffect(() => { void load() }, [load])

  if (!cloudEnabled || !tenant) return null

  async function invite(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !tid) return
    setError(''); setMsg('')
    const { error: err } = await supabase.from('invitations').insert({ tenant_id: tid, email: email.trim().toLowerCase(), role, created_by: session?.user.id })
    if (err) { setError(/duplicate|unique/i.test(err.message) ? 'Ya hay una invitación pendiente para ese correo.' : 'No se pudo invitar. Revisa el correo.'); return }
    setEmail('')
    setMsg('Listo. Pídele que cree su cuenta (o entre) con ese mismo correo y verá tu posada.')
    void load()
  }

  async function removeInvite(id: string) {
    if (!supabase || !confirm('¿Cancelar esta invitación?')) return
    await supabase.from('invitations').delete().eq('id', id)
    void load()
  }

  async function changeRole(userId: string, r: Role) {
    if (!supabase || !tid) return
    const { error: err } = await supabase.from('memberships').update({ role: r }).eq('tenant_id', tid).eq('user_id', userId)
    setError(err ? 'No se pudo cambiar el rol (la posada debe conservar al menos un dueño).' : '')
    void load()
  }

  async function removeMember(userId: string) {
    if (!supabase || !tid || !confirm('¿Quitar a esta persona de la posada?')) return
    const { error: err } = await supabase.from('memberships').delete().eq('tenant_id', tid).eq('user_id', userId)
    setError(err ? 'No se pudo quitar (la posada debe conservar al menos un dueño).' : '')
    void load()
  }

  return (
    <section className="card">
      <h2>Cuenta y equipo</h2>
      <p className="muted">Sesión: {session?.user.email} · {ROLE_LABEL[tenant.role]}</p>
      {tenants.length > 1 && (
        <label className="field"><span>Posada activa</span>
          <select value={tenant.id} onChange={(e) => selectTenant(e.target.value)}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      {isOwner && (
        <>
          <h3>Equipo</h3>
          <div className="list">
            {members.map((m) => (
              <div className="list-item" key={m.user_id}>
                <div className="grow">{m.email}</div>
                {m.user_id === session?.user.id ? <span className="pill">{ROLE_LABEL[m.role]} (tú)</span> : (
                  <>
                    <select value={m.role} onChange={(e) => void changeRole(m.user_id, e.target.value as Role)}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <button className="btn" onClick={() => void removeMember(m.user_id)}>Quitar</button>
                  </>
                )}
              </div>
            ))}
            {invites.map((i) => (
              <div className="list-item" key={i.id}>
                <div className="grow">{i.email} <span className="muted">· invitación pendiente ({ROLE_LABEL[i.role]})</span></div>
                <button className="btn" onClick={() => void removeInvite(i.id)}>Cancelar</button>
              </div>
            ))}
          </div>
          <form className="row" onSubmit={invite}>
            <input className="grow" type="email" placeholder="correo de la persona" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button className="btn">Invitar</button>
          </form>
        </>
      )}
      {error && <div className="banner warn-text">{error}</div>}
      {msg && <div className="banner">{msg}</div>}
      <div className="actions"><button className="btn" onClick={() => void signOut()}>Cerrar sesión</button></div>
    </section>
  )
}
