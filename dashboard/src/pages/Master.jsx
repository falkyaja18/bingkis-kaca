import { useState } from 'react'
import Crud, { Modal, Badge } from '../Crud.jsx'
import SlotEditor from '../SlotEditor.jsx'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { useHealth, ago } from '../health.js'
import { uid, rp, fd, slots } from '../utils.js'

const kname = (S, id) => (S.kiosks.find(k => k.id === id) || {}).name || '-'

/* ---------- Kiosk ---------- */
const RDM = [
  ['rdm:kiosk:test_print', 'Test Print'], ['rdm:kiosk:last_print', 'Last Print'], ['rdm:kiosk:camera_test', 'Camera Test'],
  ['rdm:kiosk:reload', 'Reload Kiosk'], ['rdm:kiosk:force_sync', 'Force Sync'], ['rdm:kiosk:minimize', 'Minimize Kiosk']
]

function Control({ kiosk, online, onClose }) {
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState('')
  const run = async (ev, label) => {
    setBusy(ev)
    const r = await api(`/kiosks/${kiosk.id}/command`, { method: 'POST', body: JSON.stringify({ event: ev, payload: {} }) }).catch(e => ({ ok: false, error: String(e.message) }))
    setLog(l => [{ label, ok: r.ok, out: r.ok ? JSON.stringify(r.result.result ?? r.result) : r.error, t: new Date().toLocaleTimeString('id-ID') }, ...l]); setBusy('')
  }
  return (
    <Modal title={'Kontrol jarak jauh - ' + kiosk.name} onClose={onClose}>
      {!online && <div className="note">Kiosk sedang offline. Perintah hanya bisa dikirim saat kiosk terhubung (WebSocket).</div>}
      <div className="cmds">{RDM.map(([ev, l]) => <button key={ev} className="btn" disabled={!online || !!busy} onClick={() => run(ev, l)}>{busy === ev ? '…' : l}</button>)}</div>
      {log.map((x, i) => <div key={i} className="hrow"><span className={'pill ' + (x.ok ? 'ok' : 'bad')}>{x.ok ? 'OK' : 'Gagal'}</span><b>{x.label}</b><span className="sp" /><span style={{ color: 'var(--mute)' }}>{x.t}</span><code style={{ width: '100%', wordBreak: 'break-all' }}>{x.out}</code></div>)}
      <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn ghost" onClick={onClose}>Tutup</button></div>
    </Modal>
  )
}

export function Kiosks() {
  const { S, update } = useStore()
  const { health } = useHealth()
  const [view, setView] = useState(null), [ctl, setCtl] = useState(null)
  const hl = id => health.find(h => h.id === id) || {}
  const preview = k => ({
    status: 'success',
    kiosk_info: { id: k.id, name: k.name, language: k.lang, active_public_gallery: S.galleries.find(g => g.kiosk === k.id && g.active) || null },
    frames: S.frames.filter(f => f.active).map(f => ({ id: f.id, title: f.title, type: f.type, asset_url: f.asset || '', slots_config: { canvas_width: f.w, canvas_height: f.h, total_captures: f.caps, slots: slots(f) } })),
    softfile_ui: S.soft
  })
  return (
    <>
      <Crud title="Kiosk" all={S.kiosks} rows={S.kiosks}
        note="Kiosk memakai kode aktivasi ini di App Setting, lalu menarik data master lewat Reload Kiosk. Tombol Kontrol mengirim perintah jarak jauh (RDM) lewat WebSocket."
        cols={[
          { h: 'Nama', f: r => <b>{r.name}</b> }, { h: 'Cabang', f: r => (S.branches.find(b => b.id === r.branch) || {}).name || '-' },
          { h: 'Kode aktivasi', f: r => <code>{r.code}</code> },
          { h: 'Status', f: r => <span className={'pill ' + (hl(r.id).online ? 'ok' : 'bad')}>{hl(r.id).online ? 'Online' : 'Offline'}</span> },
          { h: 'Versi', f: r => <span className="mono">{hl(r.id).appVersion || '-'}</span> },
          { h: 'Aktivasi', f: r => <Badge on={r.activated} yes="Activated" no="Belum aktif" /> },
          { h: 'Terlihat', f: r => ago(hl(r.id).lastSeen) }
        ]}
        fields={[{ k: 'name', l: 'Nama kiosk', r: 1 }, { k: 'branch', l: 'Cabang', t: 'select', o: [['', '-'], ...S.branches.map(b => [b.id, b.name])] }, { k: 'lang', l: 'Bahasa', t: 'select', o: ['ID', 'EN'] }, { k: 'code', l: 'Kode aktivasi', r: 1 }]}
        defaults={() => ({ id: uid(), name: '', branch: '', lang: 'ID', code: 'KS-' + uid().toUpperCase().slice(0, 4), activated: false, lastSync: '' })}
        onChange={v => update({ kiosks: v })}
        extra={r => <><button className="ic" onClick={() => setCtl(r)}>Kontrol</button><button className="ic" onClick={() => setView(r)}>Lihat sync</button></>} />
      {ctl && <Control kiosk={ctl} online={!!hl(ctl.id).wsConnected} onClose={() => setCtl(null)} />}
      {view && (
        <Modal title="GET /api/v1/kiosk/sync" onClose={() => setView(null)}>
          <p style={{ color: 'var(--mute)' }}>Contoh respons yang diterima {view.name} saat Reload Kiosk.</p>
          <pre>{JSON.stringify(preview(view), null, 2)}</pre>
          <div className="cc" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setView(null)}>Tutup</button></div>
        </Modal>
      )}
    </>
  )
}

/* ---------- Branch Manager ---------- */
export function Branches() {
  const { S, update } = useStore()
  return (
    <Crud title="Branch Manager" all={S.branches} rows={S.branches}
      note="Cabang / lokasi usaha. Kiosk dikelompokkan per cabang."
      cols={[{ h: 'Nama', f: r => <b>{r.name}</b> }, { h: 'Alamat', f: r => r.address || '-' }, { h: 'Kontak', f: r => [r.contact_person, r.contact_phone].filter(Boolean).join(' · ') || '-' },
        { h: 'Kiosk', f: r => S.kiosks.filter(k => k.branch === r.id).length }, { h: 'Status', f: r => <Badge on={r.active} /> }]}
      fields={[{ k: 'name', l: 'Nama cabang', r: 1 }, { k: 'address', l: 'Alamat' }, { k: 'contact_person', l: 'Nama kontak' }, { k: 'contact_phone', l: 'Telepon' }, { k: 'active', l: 'Aktif', t: 'check' }]}
      defaults={() => ({ id: uid(), name: '', address: '', contact_person: '', contact_phone: '', active: true })}
      onChange={v => update({ branches: v })} />
  )
}

/* ---------- Public Gallery ---------- */
export function PublicGalleries() {
  const { S, update } = useStore()
  const [msg, setMsg] = useState('')
  const copy = slug => { const u = `${location.origin}/e/${slug}`; try { navigator.clipboard.writeText(u) } catch { /* abaikan */ } setMsg('Tersalin: ' + u); setTimeout(() => setMsg(''), 2500) }
  return (
    <>
      <Crud title="Galeri Publik" all={S.galleries} rows={S.galleries}
        note="Foto pelanggan dihapus otomatis setelah tanggal Aktif sampai (isi 30 hari setelah event selesai). Kolom Tema kiosk dipakai kiosk saat event ini aktif (diunduh saat Reload Kiosk)."
        cols={[
          { h: 'Nama', f: r => <b>{r.name}</b> }, { h: 'Kiosk', f: r => <span className="tag">{kname(S, r.kiosk)}</span> },
          { h: 'Rentang tanggal (GMT+7)', f: r => `${fd(r.start)} - ${fd(r.end)}` },
          { h: 'Aktif sampai', f: r => fd(r.until) }, { h: 'Status', f: r => <Badge on={r.active} /> },
          { h: 'URL publik', f: r => <button className="ic" onClick={() => copy(r.slug)}>Salin</button> }
        ]}
        fields={[
          { k: 'name', l: 'Nama event', r: 1 }, { k: 'kiosk', l: 'Kiosk', t: 'select', o: S.kiosks.map(k => [k.id, k.name]) },
          { k: 'start', l: 'Mulai (GMT+7)', t: 'datetime-local', r: 1 }, { k: 'end', l: 'Selesai (GMT+7)', t: 'datetime-local', r: 1 },
          { k: 'until', l: 'Aktif sampai (GMT+7)', t: 'datetime-local', r: 1 }, { k: 'active', l: 'Aktif', t: 'check' },
          { k: 'bg', l: 'Tema kiosk: gambar background', t: 'asset', accept: 'image/*', max: 8 },
          { k: 'idle', l: 'Tema kiosk: video layar tunggu (MP4/WebM)', t: 'asset', accept: 'video/mp4,video/webm', max: 35 },
          { k: 'logo', l: 'Tema kiosk: logo (kiri atas)', t: 'asset', accept: 'image/*', max: 8 },
          { k: 'accent', l: 'Tema kiosk: warna aksen', t: 'color' }, { k: 'startText', l: 'Teks mulai (mis. SENTUH UNTUK MEMULAI!)' }, { k: 'footerText', l: 'Teks bawah (mis. IN COLLABORATION WITH ...)' }
        ]}
        defaults={() => ({ id: uid(), name: '', kiosk: S.kiosks[0]?.id || '', start: '', end: '', until: '', active: true, bg: '', idle: '', logo: '', accent: '#6c4cf5', startText: '', footerText: '' })}
        beforeSave={n => ({ ...n, slug: n.slug || n.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })}
        onChange={v => update({ galleries: v })} />
      {msg && <div className="toast">{msg}</div>}
    </>
  )
}

/* ---------- Voucher ---------- */
export function Vouchers() {
  const { S, update } = useStore()
  return (
    <Crud title="Voucher" all={S.vouchers} rows={S.vouchers}
      cols={[
        { h: 'Kode', f: r => <code>{r.code}</code> }, { h: 'Tipe', f: r => r.dtype },
        { h: 'Nilai', f: r => r.dtype === 'PERCENTAGE' ? r.val + '%' : r.dtype === 'FIXED' ? rp(r.val) : '-' },
        { h: 'Terpakai', f: r => `${r.used ?? 0}/${r.max}` }, { h: 'Berlaku sampai', f: r => fd(r.until) }, { h: 'Status', f: r => <Badge on={r.active} /> }
      ]}
      fields={[
        { k: 'code', l: 'Kode voucher', r: 1 }, { k: 'dtype', l: 'Tipe diskon', t: 'select', o: ['PERCENTAGE', 'FIXED', 'FREE_SESSION'] },
        { k: 'val', l: 'Nilai diskon (% atau Rp)', t: 'number' }, { k: 'max', l: 'Kuota pemakaian', t: 'number', r: 1 },
        { k: 'until', l: 'Berlaku sampai', t: 'datetime-local', r: 1 }, { k: 'active', l: 'Aktif', t: 'check' }
      ]}
      defaults={() => ({ id: uid(), code: '', dtype: 'PERCENTAGE', val: 10, max: 50, used: 0, until: '', active: true })}
      beforeSave={n => ({ ...n, code: n.code.toUpperCase().replace(/\s/g, '') })}
      onChange={v => update({ vouchers: v })} />
  )
}

/* ---------- Frame Photo / Frame GIF ---------- */
function Preview({ f }) {
  if (f.asset) return <img src={f.asset} height="70" alt="" style={{ background: '#d1d5db' }} />
  const sc = 70 / f.h
  return (
    <svg width={Math.round(f.w * sc)} height="70" viewBox={`0 0 ${f.w} ${f.h}`}>
      <rect width={f.w} height={f.h} fill="#d1d5db" />
      {slots(f).map(s => <rect key={s.slot_index} x={s.x} y={s.y} width={s.width} height={s.height} fill="#6c4cf5" />)}
    </svg>
  )
}

export function Frames({ type }) {
  const { S, update, reload } = useStore()
  const [msg, setMsg] = useState(''), [slotFor, setSlotFor] = useState(null)
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  const upload = (id, file) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return flash('Maksimal 8MB')
    const r = new FileReader()
    r.onload = async () => {
      try { await api(`/frames/${id}/asset`, { method: 'POST', body: JSON.stringify({ data: r.result }) }); await reload(); flash('Aset terunggah') }
      catch { flash('Gagal unggah') }
    }
    r.readAsDataURL(file)
  }
  return (
    <>
      <Crud title={type === 'PHOTO' ? 'Frame Photo' : 'Frame GIF'} all={S.frames} rows={S.frames.filter(f => f.type === type)}
        note="Setelah menyimpan, klik Upload PNG (area foto harus transparan), lalu Slot > Deteksi otomatis untuk membaca posisi slot dari PNG. Satu foto boleh dipakai beberapa slot (mis. strip 2 kolom)."
        cols={[
          { h: 'Preview', f: r => <Preview f={r} /> }, { h: 'Judul', f: r => <b>{r.title}</b> }, { h: 'Slot foto', f: r => r.caps },
          { h: 'Kanvas', f: r => `${r.w} × ${r.h}` }, { h: 'Status', f: r => <Badge on={r.active} /> }
        ]}
        fields={[
          { k: 'title', l: 'Judul frame', r: 1 }, { k: 'caps', l: 'Jumlah slot foto', t: 'number', r: 1 },
          { k: 'w', l: 'Lebar kanvas (px)', t: 'number', r: 1 }, { k: 'h', l: 'Tinggi kanvas (px)', t: 'number', r: 1 }, { k: 'active', l: 'Aktif', t: 'check' }
        ]}
        defaults={() => ({ id: uid(), type, title: '', caps: 4, w: type === 'PHOTO' ? 1200 : 1080, h: type === 'PHOTO' ? 1800 : 1080, active: true })}
        beforeSave={n => ({ ...n, caps: n.customSlots && n.customSlots.length ? Math.max(...n.customSlots.map(s => s.capture)) + 1 : Math.max(1, n.caps) })}
        onChange={v => update({ frames: v })}
        extra={r => (<>
          <button className="ic" onClick={() => setSlotFor(r)}>Slot</button>
          <label className="ic" style={{ cursor: 'pointer' }}>
            Upload PNG<input type="file" hidden accept="image/png,image/gif" onChange={e => { upload(r.id, e.target.files[0]); e.target.value = '' }} />
          </label></>
        )} />
      {slotFor && <SlotEditor frame={S.frames.find(f => f.id === slotFor.id) || slotFor} onClose={() => setSlotFor(null)} onSave={patch => { update({ frames: S.frames.map(f => f.id === slotFor.id ? { ...f, ...patch } : f) }); setSlotFor(null) }} />}
      {msg && <div className="toast">{msg}</div>}
    </>
  )
}
