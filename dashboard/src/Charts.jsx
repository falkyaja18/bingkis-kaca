// Grafik SVG ringan tanpa library
export const compact = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + 'jt' : v >= 1e3 ? Math.round(v / 1e3) + 'rb' : String(Math.round(v))

function smooth(p) {
  if (p.length < 2) return ''
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`
  }
  return d
}

// data: [{label, value}]
export function AreaChart({ data, fmt = v => 'Rp ' + compact(v), color = '#6c4cf5', height = 250 }) {
  const W = 1000, L = 62, R = 14, T = 14, B = 28, max = Math.max(1, ...data.map(d => d.value))
  const top = Math.ceil(max / 4 / (10 ** Math.max(0, String(Math.round(max)).length - 2))) * (10 ** Math.max(0, String(Math.round(max)).length - 2)) * 4 || 4
  const x = i => L + (data.length < 2 ? 0 : i * (W - L - R) / (data.length - 1)), y = v => T + (height - T - B) * (1 - v / top)
  const pts = data.map((d, i) => [x(i), y(d.value)])
  const line = smooth(pts), area = pts.length ? `${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z` : ''
  const step = Math.ceil(data.length / 24)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Grafik pendapatan">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(i => { const v = top * i / 4; return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" /><text x={L - 8} y={y(v) + 4} textAnchor="end">{i === 0 ? 'Rp 0' : fmt(v)}</text></g> })}
      {area && <path d={area} fill="url(#ag)" />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="2" />}
      {data.map((d, i) => i % step === 0 && <text key={i} x={x(i)} y={height - 8} textAnchor="middle">{d.label}</text>)}
    </svg>
  )
}

export function Spark({ values, color = '#6c4cf5' }) {
  const W = 200, H = 46, max = Math.max(1, ...values), pts = values.map((v, i) => [values.length < 2 ? 0 : i * W / (values.length - 1), H - 4 - (H - 10) * v / max])
  const line = smooth(pts)
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {line && <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

// Bar chart harian (Senin–Minggu). data: [{label, value}]
export function DailyBars({ data, color = '#6c4cf5', fmt = v => Number(v).toLocaleString('id-ID') }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="dchart" role="img" aria-label="Grafik harian">
      {data.map((d, i) => (
        <div className="dcol" key={i}>
          <div className="dval">{fmt(d.value)}</div>
          <div className="dtrack">
            <div className="dbar" style={{ height: d.value ? Math.max(4, d.value / max * 100) + '%' : '3px', background: d.value ? color : 'var(--line)' }} />
          </div>
          <div className="dlbl">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

export function Donut({ items }) {
  const total = items.reduce((a, i) => a + i.value, 0), R = 52, C = 2 * Math.PI * R
  let off = 0
  return (
    <div className="donutw">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Porsi pendapatan per booth">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--field)" strokeWidth="18" />
        {items.map(i => { const len = C * i.value / total, el = <circle key={i.label} cx="70" cy="70" r={R} fill="none" stroke={i.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />; off += len; return el })}
      </svg>
      <div>{items.map(i => <div className="lg" key={i.label}><i style={{ background: i.color }} />{i.label} <b>{Math.round(i.value / total * 100)}%</b></div>)}</div>
    </div>
  )
}
