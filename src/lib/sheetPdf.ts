import { jsPDF } from 'jspdf'
import { toCanvas } from 'html-to-image'

/** Convierte una hoja HTML (carta, 816 px de ancho) en un PDF tamaño carta; si es más alta, usa varias páginas. */
export async function sheetToPdf(node: HTMLElement): Promise<Blob> {
  const canvas = await toCanvas(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
  const pageW = 215.9
  const pageH = 279.4
  const imgH = (pageW * canvas.height) / canvas.width
  const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
  const data = canvas.toDataURL('image/jpeg', 0.92)
  // Si sobra poco (hasta ~18 %), se reduce para que quepa en una sola hoja carta.
  if (imgH > pageH && imgH <= pageH * 1.18) {
    const k = pageH / imgH
    pdf.addImage(data, 'JPEG', (pageW - pageW * k) / 2, 0, pageW * k, pageH)
    return pdf.output('blob')
  }
  const pages = Math.max(1, Math.ceil(imgH / pageH - 0.01))
  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage()
    pdf.addImage(data, 'JPEG', 0, -i * pageH, pageW, imgH)
  }
  return pdf.output('blob')
}

/** Hoja HTML → imagen PNG (para compartir directo en WhatsApp). */
export async function sheetToPng(node: HTMLElement): Promise<Blob> {
  const canvas = await toCanvas(node, { pixelRatio: 3, backgroundColor: '#ffffff', cacheBust: true })
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))
}

/** Hoja HTML angosta → PDF de una sola página con el ancho de una pantalla de celular (100 mm) y el alto que necesite. */
export async function sheetToPhonePdf(node: HTMLElement): Promise<Blob> {
  const canvas = await toCanvas(node, { pixelRatio: 3, backgroundColor: '#ffffff', cacheBust: true })
  const w = 100
  const h = (w * canvas.height) / canvas.width
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: h > w ? 'portrait' : 'landscape' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h)
  return pdf.output('blob')
}
