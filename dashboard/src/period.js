// Utilitas periode & bucket untuk halaman analitik (Overview, Statistics).
export const pad = n => String(n).padStart(2, '0')
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
export const short = d => `${pad(d.getDate())} ${MON[d.getMonth()]}`
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const COLORS = ['#6c4cf5', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#64748b']
export const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

// Periode (start, end eksklusif) + jumlah bucket + fungsi bucket
export function period(range, dateStr, back = 0) {
  const d = new Date(dateStr + 'T00:00:00')
  if (range === 'day') { const s = addDays(d, -back), e = addDays(s, 1); return { s, e, n: 24, idx: t => t.getHours(), label: i => pad(i) } }
  if (range === 'week') { const e = addDays(d, 1 - back * 7), s = addDays(e, -7); return { s, e, n: 7, idx: t => Math.floor((t - s) / 864e5), label: i => short(addDays(s, i)) } }
  const s = new Date(d.getFullYear(), d.getMonth() - back, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 1)
  return { s, e, n: Math.round((e - s) / 864e5), idx: t => t.getDate() - 1, label: i => pad(i + 1) }
}

export const bucket = (items, getT, getV, p) => {
  const b = Array(p.n).fill(0)
  items.forEach(it => { const t = new Date(getT(it)); if (t >= p.s && t < p.e) b[p.idx(t)] += getV(it) })
  return b
}

export const sum = a => a.reduce((x, y) => x + y, 0)

// Minggu Senin–Minggu yang memuat tanggal terpilih.
export function weekRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const s = addDays(d, -((d.getDay() + 6) % 7))
  return { s, e: addDays(s, 7), n: 7 }
}
