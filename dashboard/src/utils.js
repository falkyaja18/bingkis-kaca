export const uid = () => Math.random().toString(36).slice(2, 9)
export const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
export const fd = s => {
  if (!s) return '-'
  const d = new Date(s); if (isNaN(d)) return s
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const pad = n => String(n).padStart(2, '0')
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const shortDate = d => `${pad(d.getDate())} ${MON[d.getMonth()]}`
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
// Periode statistik: start, end (eksklusif), jumlah bucket, dan fungsi bucket per satuan waktu.
export function period(range, dateStr, back = 0) {
  const d = new Date(dateStr + 'T00:00:00')
  if (range === 'day') { const s = addDays(d, -back), e = addDays(s, 1); return { s, e, n: 24, idx: t => t.getHours(), label: i => pad(i) } }
  if (range === 'week') { const e = addDays(d, 1 - back * 7), s = addDays(e, -7); return { s, e, n: 7, idx: t => Math.floor((t - s) / 864e5), label: i => shortDate(addDays(s, i)) } }
  const s = new Date(d.getFullYear(), d.getMonth() - back, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 1)
  return { s, e, n: Math.round((e - s) / 864e5), idx: t => t.getDate() - 1, label: i => pad(i + 1) }
}
export const bucket = (items, getT, getV, p) => {
  const b = Array(p.n).fill(0)
  items.forEach(it => { const t = new Date(getT(it)); if (t >= p.s && t < p.e) b[p.idx(t)] += getV(it) })
  return b
}
export const sum = a => a.reduce((x, y) => x + y, 0)
export const periodLabel = p => `${shortDate(p.s)} – ${shortDate(addDays(p.e, -1))}`
export function downloadCsv(name, rows) {
  const text = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
// Slot foto: layout kustom (customSlots, tiap slot menunjuk nomor foto "capture") atau otomatis (strip vertikal).
// Harus sama dengan fungsi slots() di server/server.js
export function slots(f) {
  if (Array.isArray(f.customSlots) && f.customSlots.length)
    return f.customSlots.map((s, i) => ({ slot_index: i + 1, x: s.x, y: s.y, width: s.width, height: s.height, rotation: 0, capture: s.capture ?? i }))
  const n = f.caps, pad = Math.round(f.w * .0625), gap = 30, top = Math.round(f.h * .067)
  const h = Math.floor((f.h - top * 2 - gap * (n - 1)) / n)
  return Array.from({ length: n }, (_, i) => ({ slot_index: i + 1, x: pad, y: top + i * (h + gap), width: f.w - pad * 2, height: h, rotation: 0, capture: i }))
}
