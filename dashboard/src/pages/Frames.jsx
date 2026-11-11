import { useMemo, useState } from 'react'
import { CopyPlus, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { Modal } from '../Crud.jsx'
import Pager from '../Pager.jsx'
import FrameEditor, { FRAME_SIZES, inferFrameSize } from '../FrameEditor.jsx'
import { slots, uid } from '../utils.js'

const PER_PAGE = 10

function FrameThumb({ f }) {
  if (f.asset) {
    return (
      <div className="fr-thumb">
        <img src={f.asset} alt={f.title} />
      </div>
    )
  }
  const sc = 48 / Math.max(1, f.h || 1800)
  return (
    <div className="fr-thumb">
      <svg width={Math.max(24, Math.round((f.w || 1200) * sc))} height="48" viewBox={`0 0 ${f.w || 1200} ${f.h || 1800}`}>
        <rect width={f.w || 1200} height={f.h || 1800} fill="#e2e8f0" />
        {slots(f).map(s => <rect key={s.slot_index} x={s.x} y={s.y} width={s.width} height={s.height} fill="#6c4cf5" opacity="0.7" />)}
      </svg>
    </div>
  )
}

function BulkAssignModal({ frames, kiosks, onClose, onApply }) {
  const [pickedFrames, setPickedFrames] = useState(() => new Set())
  const [pickedKiosks, setPickedKiosks] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const toggle = (setter, id) => setter(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async e => {
    e.preventDefault()
    if (!pickedFrames.size || !pickedKiosks.size) return
    setBusy(true)
    try {
      await onApply([...pickedFrames], [...pickedKiosks])
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Tambah Frame Massal ke Kiosk" onClose={onClose} className="dlg-wide">
      <form onSubmit={submit}>
        <div className="fr-bulkgrid">
          <div className="fr-bulkcol">
            <div className="fe-shead" style={{ marginBottom: 8 }}>
              <b>Pilih Frame ({pickedFrames.size}/{frames.length})</b>
              <button
                type="button"
                className="fe-linkbtn"
                onClick={() => setPickedFrames(pickedFrames.size === frames.length ? new Set() : new Set(frames.map(f => f.id)))}
              >
                {pickedFrames.size === frames.length ? 'Kosongkan' : 'Pilih Semua'}
              </button>
            </div>
            <div className="fr-checklist">
              {frames.map(f => (
                <label key={f.id} className="fr-checkitem">
                  <input type="checkbox" checked={pickedFrames.has(f.id)} onChange={() => toggle(setPickedFrames, f.id)} />
                  <FrameThumb f={f} />
                  <span>{f.title}</span>
                </label>
              ))}
              {!frames.length && <div className="empty">Belum ada frame.</div>}
            </div>
          </div>

          <div className="fr-bulkcol">
            <div className="fe-shead" style={{ marginBottom: 8 }}>
              <b>Pilih Kiosk ({pickedKiosks.size}/{kiosks.length})</b>
              <button
                type="button"
                className="fe-linkbtn"
                onClick={() => setPickedKiosks(pickedKiosks.size === kiosks.length ? new Set() : new Set(kiosks.map(k => k.id)))}
              >
                {pickedKiosks.size === kiosks.length ? 'Kosongkan' : 'Pilih Semua'}
              </button>
            </div>
            <div className="fr-checklist">
              {kiosks.map(k => (
                <label key={k.id} className="fr-checkitem">
                  <input type="checkbox" checked={pickedKiosks.has(k.id)} onChange={() => toggle(setPickedKiosks, k.id)} />
                  <span><b>{k.name}</b> <small style={{ color: 'var(--mute)' }}>({k.code})</small></span>
                </label>
              ))}
              {!kiosks.length && <div className="empty">Belum ada kiosk.</div>}
            </div>
          </div>
        </div>

        <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="btn" disabled={busy || !pickedFrames.size || !pickedKiosks.size}>
            {busy ? 'Menyimpan…' : 'Terapkan ke Kiosk'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const blobToDataUrl = blob => new Promise((ok, no) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result || ''))
  r.onerror = no
  r.readAsDataURL(blob)
})

/** Frame Photo / Frame GIF list + interactive full-page editor. */
export default function Frames({ type }) {
  const { S, update, reload } = useStore()
  const [q, setQ] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [msg, setMsg] = useState('')

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const typedFrames = useMemo(() => S.frames.filter(f => f.type === type), [S.frames, type])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return typedFrames.filter(f => {
      if (needle && !String(f.title || '').toLowerCase().includes(needle)) return false
      if (sizeFilter && inferFrameSize(f) !== sizeFilter) return false
      return true
    })
  }, [typedFrames, q, sizeFilter])

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pg = Math.min(page, pages)
  const shown = filtered.slice((pg - 1) * PER_PAGE, pg * PER_PAGE)

  const openNew = () => setEditing({
    isNew: true,
    frame: {
      id: uid(),
      type,
      title: '',
      size: type === 'GIF' ? 'SQ' : '2R',
      source: 'Ditambah manual',
      caps: 1,
      w: type === 'GIF' ? 1080 : 1200,
      h: type === 'GIF' ? 1080 : 1800,
      active: true,
      customSlots: []
    }
  })

  const saveEditor = async (nextFrame, pendingAsset) => {
    const nextList = editing.isNew
      ? [nextFrame, ...S.frames]
      : S.frames.map(f => f.id === nextFrame.id ? nextFrame : f)
    await update({ frames: nextList })
    if (pendingAsset) {
      const res = await api(`/frames/${nextFrame.id}/asset`, {
        method: 'POST',
        body: JSON.stringify({ data: pendingAsset })
      })
      if (res && res.error) throw new Error(res.error)
      await reload()
    }
    setEditing(null)
    flash(editing.isNew ? 'Frame berhasil ditambahkan' : 'Frame berhasil disimpan')
  }

  const duplicateFrame = async f => {
    const copyId = uid()
    const copy = {
      ...JSON.parse(JSON.stringify(f)),
      id: copyId,
      title: `${f.title} (Salinan)`,
      source: f.source || 'Ditambah manual',
      asset: '',
      checksum: ''
    }
    await update({ frames: [copy, ...S.frames] })
    if (f.asset) {
      try {
        const res = await fetch(f.asset)
        if (res.ok) {
          const dataUrl = await blobToDataUrl(await res.blob())
          await api(`/frames/${copyId}/asset`, { method: 'POST', body: JSON.stringify({ data: dataUrl }) })
          await reload()
        }
      } catch {
        /* abaikan bila aset gagal disalin */
      }
    }
    flash('Frame berhasil diduplikasi')
  }

  const deleteFrame = async f => {
    if (!confirm(`Hapus frame "${f.title}"?`)) return
    await update({ frames: S.frames.filter(x => x.id !== f.id) })
    flash('Frame dihapus')
  }

  const applyBulk = async (frameIds, kioskIds) => {
    const fSet = new Set(frameIds)
    const next = S.frames.map(f => {
      if (!fSet.has(f.id)) return f
      const merged = Array.from(new Set([...(f.kiosks || []), ...kioskIds]))
      return { ...f, kiosks: merged }
    })
    await update({ frames: next })
    flash(`${frameIds.length} frame diterapkan ke ${kioskIds.length} kiosk`)
  }

  if (editing) {
    return (
      <FrameEditor
        frame={editing.frame}
        isNew={editing.isNew}
        type={type}
        onCancel={() => setEditing(null)}
        onSave={saveEditor}
      />
    )
  }

  const countLabel = f => {
    const sl = slots(f)
    const uniq = sl.length ? new Set(sl.map(s => s.capture)).size : (f.caps || 0)
    return `${uniq} / ${sl.length}`
  }

  const sizeText = f => {
    const k = inferFrameSize(f)
    return k === 'SQ' ? 'Square' : k
  }

  return (
    <>
      <section className="card trx-card">
        <div className="trx-hd">
          <h3>Daftar Frame</h3>
          <div className="cc" style={{ flexWrap: 'wrap' }}>
            <input
              className="trx-search"
              placeholder="Nama Frame"
              aria-label="Cari Nama Frame"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
            />
            <select
              className="fr-sizefilter"
              aria-label="Pilih Ukuran"
              value={sizeFilter}
              onChange={e => { setSizeFilter(e.target.value); setPage(1) }}
            >
              <option value="">Pilih Ukuran</option>
              {FRAME_SIZES.filter(s => s.key !== 'CUSTOM').map(s => (
                <option key={s.key} value={s.key}>{s.key === 'SQ' ? 'Square' : s.key}</option>
              ))}
            </select>
            <button type="button" className="btn fr-bulkbtn" onClick={() => setBulkOpen(true)}>
              <Layers size={15} /> Tambah Frame Massal ke Kiosk
            </button>
            <button type="button" className="btn exp" onClick={openNew}>
              <Plus size={16} /> Tambah Frame
            </button>
          </div>
        </div>

        <div className="tw trx-tw">
          <table className="fr-table">
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
              {shown.map(r => (
                <tr key={r.id}>
                  <td><FrameThumb f={r} /></td>
                  <td><b>{r.title}</b></td>
                  <td style={{ color: 'var(--mute)' }}>{r.source || 'Ditambah manual'}</td>
                  <td><b>{sizeText(r)}</b></td>
                  <td><b>{countLabel(r)}</b></td>
                  <td>
                    <div className="fr-actions">
                      <button type="button" className="ic" title="Edit frame" aria-label={`Edit ${r.title}`} onClick={() => setEditing({ isNew: false, frame: r })}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="ic" title="Duplikasi frame" aria-label={`Duplikasi ${r.title}`} onClick={() => duplicateFrame(r)}>
                        <CopyPlus size={16} />
                      </button>
                      <button type="button" className="ic del" title="Hapus frame" aria-label={`Hapus ${r.title}`} onClick={() => deleteFrame(r)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan="6" className="trx-empty">Tidak ada data yang tersedia</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager total={filtered.length} page={pg} perPage={PER_PAGE} onChange={setPage} />
      </section>

      {bulkOpen && (
        <BulkAssignModal
          frames={typedFrames}
          kiosks={S.kiosks}
          onClose={() => setBulkOpen(false)}
          onApply={applyBulk}
        />
      )}
      {msg && <div className="toast">{msg}</div>}
    </>
  )
}

