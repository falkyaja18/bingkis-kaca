import { useRef, useState } from 'react'
import Crud, { Modal, Badge } from '../Crud.jsx'
import SlotEditor, { detectSizeLabel } from '../SlotEditor.jsx'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { detectFromUrl } from '../slotDetect.js'
import { uid, rp, fd, slots } from '../utils.js'

export { default as Kiosks } from './KioskMaster.jsx'

const kname = (S, id) => (S.kiosks.find(k => k.id === id) || {}).name || '-'

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
  const [uploading, setUploading] = useState('')
  const uploadInputRef = useRef(null)
  const uploadTargetRef = useRef(null)

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
      .then(() => flash('Frame berhasil diduplikasi'))
      .catch(error => flash(`Gagal menduplikasi frame: ${error.message}`))
  }

  const deleteFrame = async r => {
    if (!confirm(`Hapus frame "${r.title}"?`)) return
    try {
      await update({ frames: S.frames.filter(x => x.id !== r.id) })
      flash('Frame dihapus')
    } catch (error) {
      flash(`Gagal menghapus frame: ${error.message}`)
    }
  }

  const saveFrame = async saved => {
    const next = ed.isNew
      ? [saved, ...S.frames]
      : S.frames.map(f => f.id === saved.id ? saved : f)
    await update({ frames: next })
    setEd(null)
    flash('Frame berhasil disimpan')
  }

  const uploadFrame = async file => {
    const target = uploadTargetRef.current
    uploadTargetRef.current = null
    if (!file || !target) return
    if (file.type !== 'image/png') return flash('Pilih file PNG transparan.')
    if (file.size > 15 * 1024 * 1024) return flash('Maksimal ukuran file 15MB.')
    setUploading(target.id)
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('File PNG tidak dapat dibaca.'))
        reader.readAsDataURL(file)
      })
      const image = await detectFromUrl(data)
      const result = await api(`/frames/${target.id}/asset`, {
        method: 'POST',
        body: JSON.stringify({ data })
      })
      if (result.error || !result.asset) throw new Error(result.error || 'Server tidak mengembalikan URL PNG.')
      const frames = S.frames.map(frame => frame.id === target.id
        ? { ...frame, asset: result.asset, w: image.w, h: image.h }
        : frame)
      await update({ frames })
      flash(`PNG berhasil diunggah untuk "${target.title}". Atur slot melalui tombol Slot.`)
    } catch (error) {
      flash(`Gagal mengunggah PNG: ${error.message}`)
    } finally {
      setUploading('')
    }
  }

  const toggleFrameStatus = async frame => {
    try {
      await update({ frames: S.frames.map(item => item.id === frame.id ? { ...item, active: !item.active } : item) })
      flash(`Frame ${frame.active ? 'dinonaktifkan' : 'diaktifkan'}.`)
    } catch (error) {
      flash(`Gagal mengubah status frame: ${error.message}`)
    }
  }

  // Jika sedang mode Tambah Frame / Ubah Frame, tampilkan Full-Page Editor seperti ss1 & ss2
  if (ed) {
    return (
      <>
        <SlotEditor
          frame={ed.frame}
          isNew={ed.isNew}
          focusSlots={ed.focusSlots}
          onClose={() => setEd(null)}
          onSave={saveFrame}
        />
        {msg && <div className="toast">{msg}</div>}
      </>
    )
  }

  return (
    <div className="panel">
      <div className="hd">
        <h1>{type === 'PHOTO' ? 'Frame Photo' : 'Frame GIF'}</h1>
        <div className="cc" style={{ flexWrap: 'wrap' }}>
          <input
            className="search"
            style={{ width: 190 }}
            placeholder="Cari..."
            aria-label="Cari frame"
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
            <option value="Kustom">Kustom</option>
          </select>
          <button
            type="button"
            className="btn ghost"
            style={{ border: '1px solid var(--pri)', color: 'var(--pri)', background: 'transparent' }}
            onClick={() => setMassModal(true)}
          >
            Tambah Frame Massal ke Kiosk
          </button>
          <button type="button" className="btn" onClick={createNew}>
            + Tambah
          </button>
        </div>
      </div>

      <div className="note">
        Setelah menyimpan, unggah PNG dengan area foto transparan. Buka Slot lalu klik Deteksi Otomatis untuk membaca posisi slot dari PNG. Satu foto dapat digunakan di beberapa slot.
      </div>
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/png"
        hidden
        onChange={e => {
          uploadFrame(e.target.files[0])
          e.target.value = ''
        }}
      />
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Judul</th>
              <th>Slot foto</th>
              <th>Kanvas</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const frameSlots = r.customSlots?.length ? r.customSlots : slots(r)
              const captureCount = new Set(frameSlots.map(slot => slot.capture ?? 0)).size
              return (
                <tr key={r.id}>
                  <td><Preview f={r} /></td>
                  <td><b style={{ fontWeight: 500 }}>{r.title}</b></td>
                  <td><b>{frameSlots.length} / {captureCount}</b></td>
                  <td>{r.w || 1200} × {r.h || 1800}</td>
                  <td>
                    <button
                      type="button"
                      className={'fe-status' + (r.active ? ' on' : '')}
                      aria-label={`${r.active ? 'Nonaktifkan' : 'Aktifkan'} frame ${r.title}`}
                      onClick={() => toggleFrameStatus(r)}
                    >
                      {r.active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td>
                    <div className="cc fe-actions">
                      <button
                        type="button"
                        className="ic"
                        onClick={() => setEd({ frame: { ...r }, isNew: false, focusSlots: true })}
                      >
                        Slot
                      </button>
                      <button
                        type="button"
                        className="ic"
                        disabled={uploading === r.id}
                        onClick={() => {
                          uploadTargetRef.current = r
                          uploadInputRef.current?.click()
                        }}
                      >
                        {uploading === r.id ? 'Mengunggah...' : 'Upload PNG'}
                      </button>
                      <button
                        type="button"
                        className="ic"
                        onClick={() => setEd({ frame: { ...r }, isNew: false })}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        className="ic del"
                        onClick={() => deleteFrame(r)}
                      >
                        Hapus
                      </button>
                      <button type="button" className="ic" title="Duplikasi Frame" onClick={() => duplicateFrame(r)}>Duplikasi</button>
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
              onClick={async () => {
                try {
                  await update({ frames: S.frames.map(f => f.type === type ? { ...f, active: true } : f) })
                  setMassModal(false)
                  flash('Semua frame diaktifkan ke Kiosk')
                } catch (error) {
                  flash(`Gagal mengaktifkan frame: ${error.message}`)
                }
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