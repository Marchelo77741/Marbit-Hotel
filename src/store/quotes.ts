import type { CatalogItem, Quote, QuoteStatus } from '../types'
import { previewQuoteFolio } from '../lib/quotes'
import { commit, getData } from './core'

// ---------- cotizador ----------

export function saveCatalog(catalog: CatalogItem[]) {
  commit({ ...getData(), catalog })
}

/** Guarda una cotización; si es nueva le asigna el siguiente folio. */
export function saveQuote(q: Quote): Quote {
  const exists = getData().quotes.some((x) => x.id === q.id)
  if (exists) {
    const saved = getData().quotes.find((x) => x.id === q.id)!
    const next: Quote = { ...q, folio: saved.folio, status: saved.status, reservationId: saved.reservationId }
    commit({ ...getData(), quotes: getData().quotes.map((x) => (x.id === q.id ? next : x)) })
    return next
  }
  const { folio, patch } = previewQuoteFolio(getData().settings)
  const next: Quote = { ...q, folio }
  commit({ ...getData(), quotes: [...getData().quotes, next], settings: { ...getData().settings, ...patch } })
  return next
}

export function setQuoteStatus(id: string, status: QuoteStatus) {
  commit({ ...getData(), quotes: getData().quotes.map((q) => (q.id === id ? { ...q, status } : q)) })
}

export function deleteQuote(id: string) {
  commit({ ...getData(), quotes: getData().quotes.filter((q) => q.id !== id) })
}

