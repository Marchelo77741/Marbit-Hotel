import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Sin variables de entorno la app sigue funcionando solo en el dispositivo (modo anterior). */
export const cloudEnabled = Boolean(url && key)

export const supabase = cloudEnabled
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
