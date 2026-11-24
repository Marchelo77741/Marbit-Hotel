import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Role = 'owner' | 'reception' | 'viewer'
export interface TenantInfo { id: string; nickname: string; name: string; role: Role }

interface AuthState {
  loading: boolean
  session: Session | null
  tenants: TenantInfo[]
  tenant: TenantInfo | null
  selectTenant: (id: string) => void
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)
const LAST_KEY = 'marbit-hotel:tenant'

function readLast(): string | null {
  try { return localStorage.getItem(LAST_KEY) } catch { return null }
}

/** Una sola instancia: se monta una vez en main.tsx (leccion de VendeMia: no duplicar useAuth). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [tenantId, setTenantId] = useState<string | null>(readLast)

  const loadTenants = useCallback(async () => {
    if (!supabase) return
    await supabase.rpc('claim_invitations')
    const { data: ms } = await supabase.from('memberships').select('tenant_id, role')
    const ids = (ms ?? []).map((m) => m.tenant_id as string)
    if (!ids.length) { setTenants([]); return }
    const { data: ts } = await supabase.from('tenants').select('id, nickname, name').in('id', ids).is('deleted_at', null)
    const roles = new Map((ms ?? []).map((m) => [m.tenant_id as string, m.role as Role]))
    setTenants((ts ?? []).map((t) => ({ id: t.id, nickname: t.nickname, name: t.name, role: roles.get(t.id)! })))
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s) })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!supabase) return
    if (!uid) { setTenants([]); setLoading(false); return }
    setLoading(true)
    // Diferido: no llamar a Supabase dentro del callback de onAuthStateChange.
    const t = setTimeout(() => { loadTenants().finally(() => setLoading(false)) }, 0)
    return () => clearTimeout(t)
  }, [uid, loadTenants])

  const tenant = useMemo(() => tenants.find((t) => t.id === tenantId) ?? tenants[0] ?? null, [tenants, tenantId])

  const selectTenant = useCallback((id: string) => {
    setTenantId(id)
    try { localStorage.setItem(LAST_KEY, id) } catch { /* sin almacenamiento */ }
  }, [])

  const signOut = useCallback(async () => { await supabase?.auth.signOut() }, [])

  const value = useMemo<AuthState>(
    () => ({ loading, session, tenants, tenant, selectTenant, reload: loadTenants, signOut }),
    [loading, session, tenants, tenant, selectTenant, loadTenants, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}
