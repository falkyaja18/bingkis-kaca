import { useState } from 'react'
import Crud, { Modal, Badge } from '../Crud.jsx'
import SlotEditor, { detectSizeLabel } from '../SlotEditor.jsx'
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
const PREVIEW_COLORS = ['#ef4444', '#1e293b', '#f59e0b', '#7c3aed', '#16a34a', '#db2777', '#0891b2', '#ca8a04']

function Preview({ f }) {
  const sc = 56 / (f.h || 1800)
  const w = Math.max(36, Math.round((f.w || 1200) * sc))
  const sl = slots(f)
  return (
    <svg width={w} height="56" viewBox={`0 0 ${f.w || 1200} ${f.h || 1800}`} style={{ borderRadius: 6, border: '1px solid var(--line)', background: '#e5e7eb', display: 'block' }}>
      {sl.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={s.y} width={s.width} height={s.height} fill={PREVIEW_COLORS[s.capture % PREVIEW_COLORS.length]} />
          <text x={s.x + s.width / 2} y={s.y + s.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(s.width, s.height) * 0.4} fill="#fff" fontWeight="700">{s.capture + 1}</text>
        </g>
      ))}
      {f.asset && <image href={f.asset} width={f.w || 1200} height={f.h || 1800} />}
    </svg>
  )
}

export function Frames({ type }) {
  const { S, update } = useStore()
  const [msg, setMsg] = useState('')
  const [ed, setEd] = useState(null) // { frame, isNew }
  const [q, setQ] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [massModal, setMassModal] = useState(false)

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const typeRows = S.frames.filter(f => f.type === type)
  const shown = typeRows.filter(r => {
    const matchName = (r.title || '').toLowerCase().includes(q.toLowerCase())
    const sz = detectSizeLabel(r)
    const matchSize = !sizeFilter || sz === sizeFilter
    return matchName && matchSize
  })

  const createNew = () => {
    setEd({
      isNew: true,
      frame: {
        id: uid(),
        type,
        title: '',
        sizeLabel: type === 'PHOTO' ? '2R' : 'SQUARE',
        caps: 4,
        w: type === 'PHOTO' ? 1200 : 1080,
        h: type === 'PHOTO' ? 1800 : 1080,
        active: true,
        asset: '',
        customSlots: []
      }
    })
  }

  const duplicateFrame = r => {
    const copy = {
      ...r,
      id: uid(),
      title: `${r.title} (Copy)`,
      customSlots: r.customSlots ? r.customSlots.map(s => ({ ...s })) : []
    }
    update({ frames: [copy, ...S.frames] })
    flash('Frame berhasil diduplikasi')
  }

  const deleteFrame = r => {
    if (!confirm(`Hapus frame "${r.title}"?`)) return
    update({ frames: S.frames.filter(x => x.id !== r.id) })
    flash('Frame dihapus')
  }

  const saveFrame = saved => {
    const next = ed.isNew
      ? [saved, ...S.frames]
      : S.frames.map(f => f.id === saved.id ? saved : f)
    update({ frames: next })
    setEd(null)
    flash('Frame berhasil disimpan')
  }

  // Jika sedang mode Tambah Frame / Ubah Frame, tampilkan Full-Page Editor seperti ss1 & ss2
  if (ed) {
    return (
      <>
        <SlotEditor
          frame={ed.frame}
          isNew={ed.isNew}
          onClose={() => setEd(null)}
          onSave={saveFrame}
        />
        {msg && <div className="toast">{msg}</div>}
      </>
    )
  }

  // Tampilan Daftar Frame sesuai ss b (image_eeae33.png)
  return (
    <div className="panel">
      <div className="hd">
        <h1>Daftar Frame</h1>
        <div className="cc" style={{ flexWrap: 'wrap' }}>
          <input
            className="search"
            style={{ width: 190 }}
            placeholder="Nama Frame"
            aria-label="Nama Frame"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select
            style={{ width: 140 }}
            value={sizeFilter}
            onChange={e => setSizeFilter(e.target.value)}
            aria-label="Pilih Ukuran"
          >
            <option value="">Pilih Ukuran</option>
            <option value="2R">2R</option>
            <option value="4R">4R</option>
            <option value="A4">A4</option>
            <option value="Square">Square</option>
          </select>
          <button
            type="button"
            className="btn ghost"
            style={{ border: '1px solid var(--pri)', color: 'var(--pri)', background: 'transparent' }}
            onClick={() => setMassModal(true)}
          >
            🥞 Tambah Frame Massal ke Kiosk
          </button>
          <button type="button" className="btn" onClick={createNew}>
            + Tambah Frame
          </button>
        </div>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Nama</th>
              <th>Sumber</th>
              <th>Ukuran</th>
              <th>Jumlah Foto</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const slCount = (r.customSlots && r.customSlots.length) ? r.customSlots.length : (r.caps || 0)
              const capCount = r.caps || 0
              return (
                <tr key={r.id}>
                  <td><Preview f={r} /></td>
                  <td><b style={{ fontWeight: 500 }}>{r.title}</b></td>
                  <td style={{ color: 'var(--mute)', fontSize: 12.5 }}>Ditambah manual</td>
                  <td><b>{detectSizeLabel(r)}</b></td>
                  <td><b>{capCount} / {slCount}</b></td>
                  <td>
                    <div className="cc" style={{ gap: 10 }}>
                      <button
                        type="button"
                        className="fe-act-icon"
                        title="Ubah Frame"
                        onClick={() => setEd({ frame: { ...r }, isNew: false })}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="fe-act-icon"
                        title="Duplikasi Frame"
                        onClick={() => duplicateFrame(r)}
                      >
                        ❐
                      </button>
                      <button
                        type="button"
                        className="fe-act-icon del"
                        title="Hapus Frame"
                        onClick={() => deleteFrame(r)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="empty">
                  Belum ada frame. Klik + Tambah Frame untuk membuat yang pertama.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {massModal && (
        <Modal title="Tambah Frame Massal ke Kiosk" onClose={() => setMassModal(false)}>
          <p style={{ color: 'var(--mute)' }}>
            Mengaktifkan seluruh frame pada daftar ini ({typeRows.length} frame) agar langsung tersinkronisasi ke semua Kiosk saat Reload Kiosk dijalankan.
          </p>
          <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={() => setMassModal(false)}>Batal</button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                update({ frames: S.frames.map(f => f.type === type ? { ...f, active: true } : f) })
                setMassModal(false)
                flash('Semua frame diaktifkan ke Kiosk')
              }}
            >
              Terapkan ke Semua Kiosk
            </button>
          </div>
        </Modal>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}