import { useState } from 'react'
import { api } from './api.js'

export function Modal({ title, onClose, children, className = '' }) {
  return (
    <div className="ov" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={className ? `dlg ${className}` : 'dlg'} role="dialog" aria-modal="true" aria-label={title}><h1>{title}</h1>{children}</div>
    </div>
  )
}

// Upload file (gambar/video) langsung ke server, nilai field = URL aset
function AssetField({ f, v, set }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const pick = file => {
    if (!file) return
    if (file.size > f.max * 1024 * 1024) return setErr('Maksimal ' + f.max + 'MB')
    setBusy(true); setErr('')
    const r = new FileReader()
    r.onload = async () => { try { const j = await api('/assets', { method: 'POST', body: JSON.stringify({ data: r.result }) }); if (j.error) throw new Error(j.error); set(j.url) } catch (e) { setErr(e.message) } setBusy(false) }
    r.readAsDataURL(file)
  }
  return (
    <div>
      {v && <div style={{ marginBottom: 6 }}>{f.accept.startsWith('video') ? <video src={v} muted height="60" /> : <img src={v} height="60" alt="" style={{ borderRadius: 6 }} />} <button type="button" className="ic del" onClick={() => set('')}>Hapus</button></div>}
      <input type="file" accept={f.accept} onChange={e => { pick(e.target.files[0]); e.target.value = '' }} />
      <small style={{ color: 'var(--mute)' }}>{busy ? 'Mengunggah…' : 'Maks ' + f.max + 'MB'} <span className="err">{err}</span></small>
    </div>
  )
}

function Input({ f, v, set }) {
  if (f.t === 'asset') return <AssetField f={f} v={v} set={set} />
  if (f.t === 'select')
    return <select value={v ?? ''} onChange={e => set(e.target.value)}>{f.o.map(o => { const [a, b] = Array.isArray(o) ? o : [o, o]; return <option key={a} value={a}>{b}</option> })}</select>
  if (f.t === 'check') return <input type="checkbox" checked={!!v} onChange={e => set(e.target.checked)} />
  return <input type={f.t || 'text'} value={v ?? ''} required={f.r} min={f.t === 'number' ? 0 : undefined}
    onChange={e => set(f.t === 'number' ? Number(e.target.value) : e.target.value)} />
}

export const Badge = ({ on, yes = 'Aktif', no = 'Nonaktif' }) => <span className={'tag ' + (on ? 'ok' : 'bad')}>{on ? yes : no}</span>

// Halaman CRUD generik: tabel + pencarian + form tambah/ubah.
// all = seluruh daftar (disimpan utuh), rows = yang ditampilkan (boleh terfilter)
export default function Crud({ title, all, rows, cols, fields, defaults, onChange, extra, note, beforeSave }) {
  const [q, setQ] = useState('')
  const [ed, setEd] = useState(null)
  const shown = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  const submit = e => {
    e.preventDefault()
    const rec = beforeSave ? beforeSave({ ...ed.rec }, ed.isNew) : ed.rec
    onChange(ed.isNew ? [rec, ...all] : all.map(x => x.id === rec.id ? rec : x))
    setEd(null)
  }
  return (
    <div className="panel">
      <div className="hd">
        <h1>{title}</h1>
        <div className="cc">
          <input className="search" placeholder="Cari…" aria-label="Cari" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={() => setEd({ rec: defaults(), isNew: true })}>+ Tambah</button>
        </div>
      </div>
      {note && <div className="note">{note}</div>}
      <div className="tw">
        <table>
          <thead><tr>{cols.map(c => <th key={c.h}>{c.h}</th>)}<th>Aksi</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                {cols.map(c => <td key={c.h}>{c.f(r)}</td>)}
                <td>
                  {extra && extra(r)}
                  <button className="ic" onClick={() => setEd({ rec: { ...r }, isNew: false })}>Ubah</button>
                  <button className="ic del" onClick={() => confirm('Hapus data ini?') && onChange(all.filter(x => x.id !== r.id))}>Hapus</button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={cols.length + 1} className="empty">Belum ada data. Klik Tambah untuk membuat yang pertama.</td></tr>}
          </tbody>
        </table>
      </div>
      {ed && (
        <Modal title={(ed.isNew ? 'Tambah' : 'Ubah') + ' data'} onClose={() => setEd(null)}>
          <form onSubmit={submit}>
            {fields.map(f => <div className="fld" key={f.k}><label>{f.l}</label><Input f={f} v={ed.rec[f.k]} set={v => setEd({ ...ed, rec: { ...ed.rec, [f.k]: v } })} /></div>)}
            <div className="cc" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setEd(null)}>Batal</button>
              <button className="btn">Simpan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
