const COL = ['#f97316', '#2563eb', '#16a34a', '#db2777', '#7c3aed', '#0891b2']

// Pratinjau frame: kotak slot bernomor (atau foto bila sudah ada), PNG frame ditumpuk di atas.
// photos[nomorFoto] = url gambar. onSlot(slot) membuat slot bisa disentuh (layar pilih foto).
export default function Strip({ frame, frameUrl, photos = [], active = -1, onSlot, photoFilter = 'none', uid = 's', className = '' }) {
  const sc = frame.slots_config, W = sc.canvas_width, H = sc.canvas_height
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={'strip ' + className} role="img" aria-label={frame.title}>
      <defs>{sc.slots.map((s, i) => <clipPath id={`${uid}c${i}`} key={i}><rect x={s.x} y={s.y} width={s.width} height={s.height} /></clipPath>)}</defs>
      <rect width={W} height={H} fill="#fff" />
      {sc.slots.map((s, i) => {
        const p = photos[s.capture], c = COL[s.capture % COL.length]
        return (
          <g key={i}>
            <rect x={s.x} y={s.y} width={s.width} height={s.height} fill={c} />
            {p ? <image href={p} x={s.x} y={s.y} width={s.width} height={s.height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}c${i})`} style={{ filter: photoFilter }} />
              : <text x={s.x + s.width / 2} y={s.y + s.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(s.width, s.height) / 2.2} fill="#fff" fontWeight="600">{s.capture + 1}</text>}
            {active === s.capture && <rect x={s.x} y={s.y} width={s.width} height={s.height} fill="none" stroke="#fff" strokeWidth={Math.max(6, W / 120)} />}
          </g>
        )
      })}
      {frameUrl && <image href={frameUrl} width={W} height={H} />}
      {onSlot && sc.slots.map((s, i) => <rect key={'h' + i} x={s.x} y={s.y} width={s.width} height={s.height} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSlot(s)} />)}
    </svg>
  )
}
