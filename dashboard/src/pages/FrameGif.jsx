import { useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Pencil, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { Modal } from '../Crud.jsx'
import Pager from '../Pager.jsx'
import { fd, uid } from '../utils.js'

const PER_PAGE = 10

const fmtUpdated = s => {
  if (!s) return '-'
  const formatted = fd(s)
  if (formatted === '-') return '-'
  const parts = formatted.split(' ')
  return parts.length === 4 ? `${parts[0]} ${parts[1]} ${parts[2]}, ${parts[3]}` : formatted
}

const findKioskGifFrame = (frames, kioskId) =>
  frames.find(f =>
    f.type === 'GIF' &&
    (f.kiosk === kioskId || (Array.isArray(f.kiosks) && f.kiosks.includes(kioskId)))
  ) || null

/** Preview modal for a kiosk's configured GIF frame. */
function ViewGifModal({ kiosk, frame, onClose, onEdit }) {
  return (
    <Modal title={`Frame GIF - ${kiosk.name}`} onClose={onClose}>
      <div className="fg-viewbox">
        {frame?.asset
          ? <img src={frame.asset} alt={`Frame GIF ${kiosk.name}`} />
          : <div className="empty">Belum ada gambar frame GIF.</div>}
      </div>
      <div className="fg-meta">
        <span>Status: <b>{frame?.active !== false ? 'Aktif' : 'Nonaktif'}</b></span>
        <span>Terakhir Diubah: <b>{fmtUpdated(frame?.updatedAt)}</b></span>
      </div>
      <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn ghost" onClick={onClose}>Tutup</button>
        <button type="button" className="btn" onClick={onEdit}>Ubah Frame</button>
      </div>
    </Modal>
  )
}

/** Edit/Upload modal for a single kiosk's GIF frame. */
function EditGifModal({ kiosk, existing, onClose, onSave }) {
  const [pendingData, setPendingData] = useState('')
  const [removeAsset, setRemoveAsset] = useState(false)
  const [active, setActive] = useState(existing ? existing.active !== false : true)
  const [dim, setDim] = useState({ w: existing?.w || 1080, h: existing?.h || 1080 })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const previewUrl = removeAsset ? '' : (pendingData || existing?.asset || '')

  const handleFile = file => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setErr('File harus berupa gambar PNG atau GIF.')
    if (file.size > 15 * 1024 * 1024) return setErr('Maksimal ukuran file 15MB.')
    setErr('')
    setRemoveAsset(false)
    const r = new FileReader()
    r.onload = () => {
      const dataUrl = String(r.result || '')
      setPendingData(dataUrl)
      const img = new Image()
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) setDim({ w: img.naturalWidth, h: img.naturalHeight })
      }
      img.src = dataUrl
    }
    r.readAsDataURL(file)
  }

  const submit = async e => {
    e.preventDefault()
    setErr('')
    setSaving(true)
    try {
      await onSave({
        existing,
        kiosk,
        pendingData,
        removeAsset,
        active,
        dim
      })
      onClose()
    } catch (e2) {
      setErr(e2?.message || 'Gagal menyimpan Frame GIF.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit Frame GIF - ${kiosk.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="fe-err">{err}</div>}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/gif"
          onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
        />

        <div className="fg-dropzone" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}>
          {previewUrl ? (
            <img src={previewUrl} alt="Preview Frame GIF" />
          ) : (
            <div className="fg-dropempty">
              <ImageIcon size={34} strokeWidth={1.6} />
              <b>Klik untuk pilih PNG / GIF Frame</b>
              <span>PNG transparan atau GIF · Maks 15MB</span>
            </div>
          )}
        </div>

        <div className="cc" style={{ marginTop: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="cc">
            <button type="button" className="btn ghost fe-sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> {previewUrl ? 'Ganti File' : 'Pilih File'}
            </button>
            {previewUrl && (
              <button type="button" className="ic del" onClick={() => { setPendingData(''); setRemoveAsset(true) }}>
                <Trash2 size={14} /> Hapus Gambar
              </button>
            )}
          </div>
          <label className="fe-active" style={{ margin: 0 }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            <span>Aktif</span>
          </label>
        </div>

        <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Frame GIF page: per-kiosk GIF frame table (Daftar Frame GIF). */
export default function FrameGif() {
  const { S, update, reload } = useStore()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return S.kiosks
      .filter(k => !needle || k.name.toLowerCase().includes(needle))
      .map(k => ({ kiosk: k, frame: findKioskGifFrame(S.frames, k.id) }))
  }, [S.kiosks, S.frames, q])

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const pg = Math.min(page, pages)
  const shown = rows.slice((pg - 1) * PER_PAGE, pg * PER_PAGE)

  const handleSave = async ({ existing, kiosk, pendingData, removeAsset, active, dim }) => {
    const now = new Date().toISOString()
    if (removeAsset && existing && !pendingData) {
      await update({ frames: S.frames.filter(f => f.id !== existing.id) })
      flash(`Frame GIF ${kiosk.name} dihapus`)
      return
    }

    const frameId = existing?.id || uid()
    const record = {
      ...(existing || {}),
      id: frameId,
      type: 'GIF',
      title: `Frame GIF - ${kiosk.name}`,
      size: 'SQ',
      source: 'Ditambah manual',
      kiosk: kiosk.id,
      kiosks: [kiosk.id],
      caps: existing?.caps || 4,
      w: dim.w,
      h: dim.h,
      active,
      updatedAt: now
    }

    const nextFrames = existing
      ? S.frames.map(f => f.id === existing.id ? record : f)
      : [record, ...S.frames]

    await update({ frames: nextFrames })
    if (pendingData) {
      const res = await api(`/frames/${frameId}/asset`, {
        method: 'POST',
        body: JSON.stringify({ data: pendingData })
      })
      if (res && res.error) throw new Error(res.error)
      await reload()
    }
    flash(`Frame GIF ${kiosk.name} disimpan`)
  }

  return (
    <>
      <section className="card trx-card">
        <div className="trx-hd">
          <h3>Daftar Frame GIF</h3>
          <input
            className="trx-search"
            placeholder="Nama Kiosk"
            aria-label="Cari Nama Kiosk"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
          />
        </div>

        <div className="tw trx-tw">
          <table className="fg-table">
            <thead>
              <tr>
                <th>Nama Kiosk</th>
                <th>Link Frame</th>
                <th>Terakhir Diubah</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ kiosk, frame }) => (
                <tr key={kiosk.id}>
                  <td>{kiosk.name}</td>
                  <td>
                    {frame?.asset ? (
                      <button type="button" className="fg-link" onClick={() => setViewing({ kiosk, frame })}>
                        Lihat
                      </button>
                    ) : (
                      <span style={{ color: 'var(--mute)' }}>-</span>
                    )}
                  </td>
                  <td>{fmtUpdated(frame?.updatedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="ic"
                      title={`Edit Frame GIF ${kiosk.name}`}
                      aria-label={`Edit Frame GIF ${kiosk.name}`}
                      onClick={() => setEditing({ kiosk, frame })}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan="4" className="trx-empty">Tidak ada data yang tersedia</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={pg} perPage={PER_PAGE} onChange={setPage} />
      </section>

      {viewing && (
        <ViewGifModal
          kiosk={viewing.kiosk}
          frame={viewing.frame}
          onClose={() => setViewing(null)}
          onEdit={() => { const cur = viewing; setViewing(null); setEditing(cur) }}
        />
      )}

      {editing && (
        <EditGifModal
          kiosk={editing.kiosk}
          existing={editing.frame}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {msg && <div className="toast">{msg}</div>}
    </>
  )
}

