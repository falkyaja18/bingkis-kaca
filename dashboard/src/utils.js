export const uid = () => Math.random().toString(36).slice(2, 9)
export const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
export const fd = s => {
  if (!s) return '-'
  const d = new Date(s); if (isNaN(d)) return s
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
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
