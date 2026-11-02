import { useState } from 'react'
import { useStore } from '../store.jsx'
import { rp, fd } from '../utils.js'

const kname = (S, id) => (S.kiosks.find(k => k.id === id) || {}).name || '-'
const Status = ({ s }) => <span className={'tag ' + (s === 'PAID' ? 'ok' : s === 'FAILED' ? 'bad' : '')}>{s}</span>

export function Gallery() {
  const { S } = useStore()
  return (
    <div className="panel">
      <h1>Gallery</h1>
      <div className="tw"><table>
        <thead><tr><th>Foto</th><th>Kode</th><th>Kiosk</th><th>Cetak</th><th>Dibuat</th><th>Kedaluwarsa</th></tr></thead>
        <tbody>
          {S.sessions.map(x => (
            <tr key={x.code}>
              <td><a href={`/s/${x.code}`} target="_blank" rel="noreferrer"><img src={x.composite} height="60" alt="" /></a></td>
              <td><code>{x.code}</code></td><td>{kname(S, x.kiosk)}</td><td>{x.prints || 0}</td><td>{fd(x.createdAt)}</td><td>{fd(x.expiredAt)}</td>
            </tr>
          ))}
          {!S.sessions.length && <tr><td colSpan="6" className="empty">Belum ada sesi. Foto muncul setelah kiosk mengunggah.</td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}

const Bar = ({ label, pct, value }) => <div className="bar"><span>{label}</span><span><i style={{ width: pct + '%' }} /></span><b>{value}</b></div>

export function Stats() {
  const { S } = useStore()
  const by = {}
  S.trx.filter(t => t.status === 'PAID').forEach(t => { by[t.kiosk] = (by[t.kiosk] || 0) + t.base - t.disc })
  const max = Math.max(1, ...Object.values(by))
  return (
    <div className="panel">
      <h1>Statistics</h1>
      <h2>Pendapatan per kiosk</h2>
      {S.kiosks.map(k => <Bar key={k.id} label={k.name} pct={(by[k.id] || 0) / max * 100} value={rp(by[k.id] || 0)} />)}
      <h2>Status transaksi</h2>
      {['PAID', 'PENDING', 'FAILED'].map(s => { const n = S.trx.filter(t => t.status === s).length; return <Bar key={s} label={s} pct={n / Math.max(1, S.trx.length) * 100} value={n} /> })}
    </div>
  )
}

export function Transactions() {
  const { S } = useStore()
  const [q, setQ] = useState('')
  const rows = S.trx.filter(t => (t.inv + kname(S, t.kiosk) + t.method + t.status).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="panel">
      <div className="hd"><h1>Transaction</h1><input className="search" placeholder="Cari invoice, kiosk…" aria-label="Cari" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="tw"><table>
        <thead><tr><th>Invoice</th><th>Kiosk</th><th>Metode</th><th>Harga</th><th>Diskon</th><th>Total</th><th>Status</th><th>Waktu</th></tr></thead>
        <tbody>
          {rows.map(t => <tr key={t.id}><td>{t.inv}</td><td>{kname(S, t.kiosk)}</td><td>{t.method}</td><td>{rp(t.base)}</td><td>{rp(t.disc)}</td><td><b>{rp(t.base - t.disc)}</b></td><td><Status s={t.status} /></td><td>{fd(t.at)}</td></tr>)}
          {!rows.length && <tr><td colSpan="8" className="empty">Tidak ada transaksi.</td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}
