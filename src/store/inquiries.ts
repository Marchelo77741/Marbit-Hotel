import type { Inquiry } from '../types'
import { commit, getData } from './core'

/** Agrega las solicitudes que llegaron de la página (las ya conocidas se ignoran). Devuelve cuántas son nuevas. */
export function addInquiries(list: Omit<Inquiry, 'status'>[]): number {
  const known = new Set(getData().inquiries.map((i) => i.id))
  const tomb = getData().tombstones
  const fresh = list.filter((i) => !known.has(i.id) && !tomb[i.id]).map((i): Inquiry => ({ ...i, status: 'nueva' }))
  if (fresh.length) commit({ ...getData(), inquiries: [...getData().inquiries, ...fresh] })
  return fresh.length
}

export function setInquiryStatus(id: string, status: Inquiry['status']) {
  commit({ ...getData(), inquiries: getData().inquiries.map((i) => (i.id === id ? { ...i, status } : i)) })
}

export function deleteInquiry(id: string) {
  commit({ ...getData(), inquiries: getData().inquiries.filter((i) => i.id !== id) })
}
