import type { Room, Settings } from '../types'
import { commit, getData } from './core'

// ---------- habitaciones y ajustes ----------

export function saveSettings(patch: Partial<Settings>) {
  commit({ ...getData(), settings: { ...getData().settings, ...patch } })
}

export function saveRooms(rooms: Room[]) {
  commit({ ...getData(), rooms })
}

