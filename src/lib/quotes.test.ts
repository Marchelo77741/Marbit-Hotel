import { describe, expect, it } from 'vitest'
import { applyGuests, defaultCatalog, newQuote, numLetras, previewQuoteFolio, quoteNights, quoteRoomsText, quoteToPrefill, quoteTotals, suggestedQty, lineFrom } from './quotes'
import { defaultSettings, normalizeData } from '../store'

const catalog = defaultCatalog()
const doble = catalog.find((c) => c.id === 'hab2')!
const desayuno = catalog.find((c) => c.id === 'desa')!

describe('número a letras', () => {
  it('convierte importes', () => {
    expect(numLetras(1100)).toBe('MIL CIEN PESOS 00/100 M.N.')
    expect(numLetras(1)).toBe('UN PESO 00/100 M.N.')
    expect(numLetras(2279.6)).toBe('DOS MIL DOSCIENTOS SETENTA Y NUEVE PESOS 60/100 M.N.')
    expect(numLetras(0)).toBe('CERO PESOS 00/100 M.N.')
    expect(numLetras(1000000)).toBe('UN MILLÓN DE PESOS 00/100 M.N.')
  })
})

describe('folios de cotización', () => {
  it('numera y reinicia cada año', () => {
    const s = { ...defaultSettings, quoteYear: 2026, nextQuote: 7 }
    expect(previewQuoteFolio(s, 2026).folio).toBe('COT-2026-007')
    const nuevo = previewQuoteFolio(s, 2027)
    expect(nuevo.folio).toBe('COT-2027-001')
    expect(nuevo.patch).toEqual({ nextQuote: 2, quoteYear: 2027 })
  })
  it('sin reinicio anual usa 4 dígitos', () => {
    expect(previewQuoteFolio({ ...defaultSettings, quoteAnnual: false, nextQuote: 12 }, 2026).folio).toBe('COT-0012')
  })
})

describe('totales y textos', () => {
  const q = newQuote(defaultSettings, catalog, { client: 'Ana', guests: 4, arrival: '2026-12-05', departure: '2026-12-08' })
  q.lines = [lineFrom(doble, 2), lineFrom(desayuno, 4)]
  it('calcula por noche y por estancia (noches según fechas)', () => {
    const t = quoteTotals(q)
    expect(quoteNights(q)).toBe(3)
    expect(t.Hospedaje).toBe(2200)
    expect(t.Alimento).toBeCloseTo(679.6, 5)
    expect(t.night).toBeCloseTo(2879.6, 5)
    expect(t.stay).toBeCloseTo(8638.8, 5)
  })
  it('sin fechas usa el número de noches', () => {
    expect(quoteNights({ arrival: '', departure: '', nights: 4 })).toBe(4)
    expect(quoteNights({ arrival: '2026-12-05', departure: '2026-12-05', nights: 2 })).toBe(2)
  })
  it('arma el texto de habitaciones', () => {
    expect(quoteRoomsText(q)).toBe('2 habitaciones dobles')
    expect(quoteRoomsText({ ...q, lines: [lineFrom(doble, 1)] })).toBe('1 habitación doble')
  })
  it('cantidades sugeridas', () => {
    expect(suggestedQty(doble, 5)).toBe(3)
    expect(suggestedQty(desayuno, 4)).toBe(4)
  })
  it('una cotización nueva propone habitaciones dobles para los huéspedes', () => {
    const n = newQuote(defaultSettings, catalog, { guests: 4 })
    expect(n.lines[0].catId).toBe('hab2')
    expect(n.lines[0].qty).toBe(2)
  })
  it('datos para convertir en reservación', () => {
    const p = quoteToPrefill({ ...q, folio: 'COT-2026-001' })
    expect(p.guest).toBe('Ana')
    expect(p.checkIn).toBe('2026-12-05')
    expect(p.total).toBeCloseTo(8638.8, 5)
    expect(p.notes).toContain('COT-2026-001')
    expect(p.notes).toContain('4 x Desayuno a Elegir')
  })
})

describe('cantidades automáticas', () => {
  it('siguen a los huéspedes mientras no se editen a mano', () => {
    const lines = [lineFrom(doble, 1, true), lineFrom(desayuno, 2, true), { ...lineFrom(desayuno, 9, false), id: 'manual' }]
    const out = applyGuests(lines, catalog, 5)
    expect(out[0].qty).toBe(3)
    expect(out[1].qty).toBe(5)
    expect(out[2].qty).toBe(9)
  })
})

describe('respaldos antiguos', () => {
  it('rellena catálogo y cotizaciones si el respaldo no los trae', () => {
    const d = normalizeData({ version: 1, rooms: [], reservations: [], settings: { businessName: 'X' } })
    expect(d.catalog.length).toBeGreaterThan(0)
    expect(d.quotes).toEqual([])
    expect(d.settings.quotePrefix).toBe('COT')
  })
})
