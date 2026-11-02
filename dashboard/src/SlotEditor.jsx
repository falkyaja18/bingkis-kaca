import { useState } from 'react'
import { Modal } from './Crud.jsx'
import { slots as autoSlots } from './utils.js'
import { detectFromUrl } from './slotDetect.js'

const COLORS = ['#f97316', '#2563eb', '#16a34a', '#db2777', '#7c3aed', '#0891b2', '#ca8a04', '#475569']

// Editor slot foto: posisi/ukuran tiap slot + nomor foto (capture). Beberapa slot boleh memakai nomor foto yang sama.
export default function SlotEditor({ frame, onSave, onClose }) {
  const start = (frame.customSlots && frame.customSlots.length ? frame.customSlots : autoSlots(frame)).map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height, capture: s.capture }))
  const [sl, setSl] = useState(start), [dim, setDim] = useState({ w: frame.w, h: frame.h }), [msg, setMsg] = useState('')
  const set = (i, k, v) => setSl(sl.map((s, j) => j === i ? { ...s, [k]: Math.max(0, Math.round(Number(v) || 0)) } : s))
  const caps = sl.length ? Math.max(...sl.map(s => s.capture)) + 1 : 0

  const detect = async () => {
    if (!frame.asset) return setMsg('Upload PNG frame dulu.')
    try {
      const r = await detectFromUrl(frame.asset)
      if (!r.slots.length) return setMsg('Tidak ada area transparan yang cukup besar di PNG ini.')
      setSl(r.slots); setDim({ w: r.w, h: r.h }); setMsg(`${r.slots.length} slot terdeteksi (${r.caps} foto). Ukuran kanvas disesuaikan ke ${r.w} × ${r.h}. Periksa lalu Simpan.`)
    } catch { setMsg('Gagal membaca PNG.') }
  }
  const add = () => setSl([...sl, { x: 50, y: 50, width: Math.round(dim.w / 3), height: Math.round(dim.h / 6), capture: caps }])
  const col = c => COLORS[c % COLORS.length]

  return (
    <Modal title={'Slot foto - ' + frame.title} onClose={onClose}>
      <div className="note">Satu nomor foto bisa dipakai beberapa slot (strip 2 kolom: slot kiri dan kanan memakai foto yang sama). Total foto yang diambil kiosk: <b>{caps}</b>.</div>
      <svg viewBox={`0 0 ${dim.w} ${dim.h}`} style={{ width: '100%', maxHeight: 360, background: '#d1d5db', borderRadius: 8 }} role="img" aria-label="Pratinjau slot">
        {sl.map((s, i) => <rect key={'f' + i} x={s.x} y={s.y} width={s.width} height={s.height} fill={col(s.capture)} opacity=".55" />)}
        {frame.asset && <image href={frame.asset} width={dim.w} height={dim.h} />}
        {sl.map((s, i) => <g key={'t' + i}><rect x={s.x} y={s.y} width={s.width} height={s.height} fill="none" stroke={col(s.capture)} strokeWidth={Math.max(4, dim.w / 200)} />
          <text x={s.x + s.width / 2} y={s.y + s.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(s.width, s.height) / 3} fill="#fff" stroke="#000" strokeWidth={dim.w / 400} paintOrder="stroke" fontWeight="700">{s.capture + 1}</text></g>)}
      </svg>
      <div className="cc" style={{ margin: '10px 0', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={detect}>Deteksi otomatis dari PNG</button>
        <button type="button" className="btn ghost" onClick={add}>+ Slot</button>
        <button type="button" className="btn ghost" onClick={() => { setSl(autoSlots({ ...frame, ...dim }).map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height, capture: s.capture }))); setMsg('Kembali ke strip otomatis (tekan Simpan Otomatis untuk menerapkan).') }}>Reset</button>
      </div>
      {msg && <p style={{ fontSize: 13 }}>{msg}</p>}
      <div className="tw"><table style={{ minWidth: 420 }}>
        <thead><tr><th>#</th><th>X</th><th>Y</th><th>Lebar</th><th>Tinggi</th><th>Foto ke-</th><th /></tr></thead>
        <tbody>{sl.map((s, i) => (
          <tr key={i}>
            <td><b style={{ color: col(s.capture) }}>{i + 1}</b></td>
            {['x', 'y', 'width', 'height'].map(k => <td key={k}><input type="number" aria-label={k} style={{ width: 76 }} value={s[k]} onChange={e => set(i, k, e.target.value)} /></td>)}
            <td><input type="number" aria-label="foto ke" min="1" style={{ width: 60 }} value={s.capture + 1} onChange={e => set(i, 'capture', Math.max(1, Number(e.target.value) || 1) - 1)} /></td>
            <td><button type="button" className="ic del" onClick={() => setSl(sl.filter((_, j) => j !== i))}>Hapus</button></td>
          </tr>))}</tbody>
      </table></div>
      <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
        <button type="button" className="btn ghost" onClick={() => onSave({ customSlots: [], w: dim.w, h: dim.h })}>Simpan Otomatis</button>
        <button type="button" className="btn" disabled={!sl.length} onClick={() => onSave({ customSlots: sl, w: dim.w, h: dim.h, caps })}>Simpan Slot</button>
      </div>
    </Modal>
  )
}
