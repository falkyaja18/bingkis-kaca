import { useState } from 'react'
import { useStore } from '../store.jsx'

const readable = h => { const n = parseInt(String(h).slice(1), 16) || 0; return (((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000) > 150 ? '#111' : '#fff' }

function ColorField({ label, value, onChange }) {
  return (
    <div className="fld"><label>{label}</label>
      <div className="cc">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} />
        <input value={value} style={{ maxWidth: 130 }} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  )
}

export function SoftFile() {
  const { S, update } = useStore()
  const [t, setT] = useState(S.soft)
  const [msg, setMsg] = useState('')
  const set = (k, v) => setT({ ...t, [k]: v })
  const logo = file => {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return setMsg('Logo maksimal 3MB')
    const r = new FileReader(); r.onload = () => set('logo', r.result); r.readAsDataURL(file)
  }
  const save = async () => { await update({ soft: t }); setMsg('Tema tersimpan'); setTimeout(() => setMsg(''), 2000) }
  return (
    <div className="panel">
      <h1>Soft File UI</h1>
      <div className="row2">
        <div>
          <div className="note">Tampilan halaman unduh yang dibuka pelanggan setelah scan QR. Maksimal ukuran logo 3MB.</div>
          <div className="fld"><label>Logo</label><input type="file" accept="image/*" onChange={e => logo(e.target.files[0])} /></div>
          <h2>Tema halaman galeri digital</h2>
          <ColorField label="Warna aksen" value={t.accent} onChange={v => set('accent', v)} />
          <ColorField label="Warna latar" value={t.bg} onChange={v => set('bg', v)} />
          <div className="fld"><label>Instagram</label><input value={t.ig} onChange={e => set('ig', e.target.value)} /></div>
          <div className="fld"><label>TikTok</label><input value={t.tt} onChange={e => set('tt', e.target.value)} /></div>
          <div className="fld"><label>Teks footer</label><input value={t.footer} onChange={e => set('footer', e.target.value)} /></div>
          <p style={{ color: 'var(--mute)', fontSize: 12 }}>Kosongkan Instagram atau TikTok jika tidak ingin ditampilkan di galeri.</p>
          <button className="btn" onClick={save}>Simpan tema</button> <span>{msg}</span>
        </div>
        <div className="phone" style={{ background: t.bg, color: readable(t.bg) }}>
          {t.logo ? <img src={t.logo} alt="" style={{ maxHeight: 48, maxWidth: '100%' }} /> : <b>Logo</b>}
          <div className="pic" />
          <div className="dl" style={{ background: t.accent, color: readable(t.accent) }}>Unduh foto</div>
          <div>{t.footer}</div>
          <div style={{ marginTop: 10, fontSize: 12 }}>{[t.ig && 'IG ' + t.ig, t.tt && 'TikTok ' + t.tt].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    </div>
  )
}

export function PayKey() {
  const { S, update } = useStore()
  const [p, setP] = useState(S.pay)
  const [msg, setMsg] = useState('')
  const set = (k, v) => setP({ ...p, [k]: v })
  const save = async () => { await update({ pay: { ...p, price: Number(p.price) || 0 } }); setMsg('Tersimpan'); setTimeout(() => setMsg(''), 2000) }
  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h1>Payment Key</h1>
      <div className="note">Pembayaran memakai QRIS. Di server, pembayaran masih simulasi sampai payment gateway disambungkan.</div>
      <div className="fld"><label>Provider</label><select value={p.provider} onChange={e => set('provider', e.target.value)}><option>QRIS</option></select></div>
      <div className="fld"><label>Merchant ID</label><input value={p.merchant} onChange={e => set('merchant', e.target.value)} /></div>
      <div className="fld"><label>API key</label><input type="password" autoComplete="off" value={p.apikey} onChange={e => set('apikey', e.target.value)} /></div>
      <div className="fld"><label>Webhook secret</label><input type="password" autoComplete="off" value={p.secret} onChange={e => set('secret', e.target.value)} /></div>
      <div className="fld"><label>Harga per sesi (Rp)</label><input type="number" min="0" value={p.price ?? 35000} onChange={e => set('price', e.target.value)} /></div>
      <div className="fld"><label>Mode</label><select value={p.mode} onChange={e => set('mode', e.target.value)}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
      <button className="btn" onClick={save}>Simpan kunci</button> <span>{msg}</span>
    </div>
  )
}
