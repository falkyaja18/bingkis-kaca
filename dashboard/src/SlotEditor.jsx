import { useState, useRef } from 'react'
import { slots as autoSlots } from './utils.js'
import { detectFromUrl } from './slotDetect.js'
import { api } from './api.js'

const COLORS = ['#ef4444', '#1e293b', '#f59e0b', '#7c3aed', '#16a34a', '#db2777', '#0891b2', '#ca8a04']

export const SIZES = [
  { id: '2R', label: '2R (4x6 CUT)', w: 1200, h: 1800, rec: '1200x1800 · Pembagi: 1.00' },
  { id: '4R', label: '4R (4x6 FULL)', w: 1200, h: 1800, rec: '1200x1800 · Pembagi: 1.00' },
  { id: 'A4', label: 'A4', w: 2480, h: 3508, rec: '2480x3508 · Pembagi: 1.00' },
  { id: 'SQUARE', label: 'Square (1:1)', w: 1080, h: 1080, rec: '1080x1080 · Pembagi: 1.00' },
  { id: 'CUSTOM', label: 'Kustom', w: 1200, h: 1800, rec: 'Bebas disesuaikan' }
]

export function detectSizeLabel(f) {
  if (f.sizeLabel) return f.sizeLabel
  if (f.w === 2480 && f.h === 3508) return 'A4'
  if (f.w === 1080 && f.h === 1080) return 'Square'
  return '2R'
}

export default function SlotEditor({ frame, isNew, onSave, onClose }) {
  const initialSlots = (frame.customSlots && frame.customSlots.length
    ? frame.customSlots
    : (frame.asset ? autoSlots(frame) : [])
  ).map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height, capture: s.capture ?? 0 }))

  const [title, setTitle] = useState(frame.title || '')
  const [sizeId, setSizeId] = useState(frame.sizeLabel || (frame.w === 2480 ? 'A4' : frame.w === 1080 ? 'SQUARE' : '2R'))
  const [dim, setDim] = useState({ w: frame.w || 1200, h: frame.h || 1800 })
  const [asset, setAsset] = useState(frame.asset || '')
  const [sl, setSl] = useState(initialSlots)
  const [active, setActive] = useState(frame.active ?? true)

  // State UI Editor sesuai ss1 & ss2
  const [bgMode, setBgMode] = useState('grid') // 'light' | 'dark' | 'grid'
  const [rot, setRot] = useState(0) // 0 | -90 | 90
  const [viewMode, setViewMode] = useState('edit') // 'edit' | 'preview'
  const [zoom, setZoom] = useState(1)
  const [showOverlay, setShowOverlay] = useState(true)
  const [selIdx, setSelIdx] = useState(null)
  const [samplePhotos, setSamplePhotos] = useState({})
  const [qrBox, setQrBox] = useState(frame.qrBox || null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const svgRef = useRef(null)
  const fileInputRef = useRef(null)
  const dragRef = useRef(null)

  const uniqueCaptures = [...new Set(sl.map(s => s.capture))].sort((a, b) => a - b)
  const caps = sl.length ? Math.max(...sl.map(s => s.capture)) + 1 : 0
  const col = c => COLORS[c % COLORS.length]
  const curSizeObj = SIZES.find(s => s.id === sizeId) || SIZES[0]

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  // Ganti preset ukuran kanvas
  const handleSizeChange = id => {
    setSizeId(id)
    const found = SIZES.find(s => s.id === id)
    if (found && id !== 'CUSTOM') setDim({ w: found.w, h: found.h })
  }

  // Upload file PNG Frame (Drag & Drop atau Pilih File) + Auto Detect
  const handleFileUpload = file => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) return flash('Maksimal ukuran file 15MB')
    setBusy(true)
    const r = new FileReader()
    r.onload = async () => {
      const dataUrl = r.result
      let finalUrl = dataUrl
      try {
        if (!isNew && frame.id) {
          await api(`/frames/${frame.id}/asset`, { method: 'POST', body: JSON.stringify({ data: dataUrl }) })
        } else {
          const j = await api('/assets', { method: 'POST', body: JSON.stringify({ data: dataUrl }) })
          if (j && j.url) finalUrl = j.url
        }
      } catch {
        // Fallback ke dataUrl jika endpoint gagal
      }
      setAsset(finalUrl)
      try {
        const det = await detectFromUrl(dataUrl)
        if (det.w && det.h) setDim({ w: det.w, h: det.h })
        if (det.slots && det.slots.length) {
          setSl(det.slots)
          flash(`${det.slots.length} slot otomatis terdeteksi (${det.caps} foto).`)
        } else {
          flash('Frame diunggah. Klik Deteksi Otomatis atau + Tambah Foto untuk mengatur slot.')
        }
      } catch {
        flash('Frame berhasil diunggah.')
      }
      setBusy(false)
    }
    r.readAsDataURL(file)
  }

  // Tombol Deteksi Otomatis di Toolbar
  const runAutoDetect = async () => {
    if (!asset) return flash('Upload PNG frame terlebih dahulu!')
    setBusy(true)
    try {
      const r = await detectFromUrl(asset)
      if (!r.slots.length) {
        flash('Tidak ditemukan area transparan yang cukup besar pada PNG ini.')
      } else {
        setSl(r.slots)
        setDim({ w: r.w, h: r.h })
        flash(`${r.slots.length} slot berhasil dideteksi (${r.caps} foto).`)
      }
    } catch {
      flash('Gagal mendeteksi slot dari gambar PNG.')
    }
    setBusy(false)
  }

  // Tambah nomor foto baru (+ Tambah Foto)
  const addNewPhotoNumber = () => {
    const nextCap = caps
    const w = Math.round(dim.w * 0.38)
    const h = Math.round(dim.h * 0.2)
    const offset = (sl.length % 5) * 35
    const newSlot = {
      x: Math.round((dim.w - w) / 2) + offset,
      y: Math.round((dim.h - h) / 2) + offset,
      width: w,
      height: h,
      capture: nextCap
    }
    setSl([...sl, newSlot])
    setSelIdx(sl.length)
  }

  // Klik tile angka di kanan untuk duplikasi slot dengan nomor foto yang sama (misal strip 2 kolom)
  const addSlotForCapture = capIndex => {
    const refSlot = sl.find(s => s.capture === capIndex)
    const w = refSlot ? refSlot.width : Math.round(dim.w * 0.38)
    const h = refSlot ? refSlot.height : Math.round(dim.h * 0.2)
    const newSlot = {
      x: Math.min(dim.w - w, (refSlot ? refSlot.x + 50 : 80)),
      y: Math.min(dim.h - h, (refSlot ? refSlot.y + 50 : 80)),
      width: w,
      height: h,
      capture: capIndex
    }
    setSl([...sl, newSlot])
    setSelIdx(sl.length)
  }

  // Toggle QR Code Box
  const toggleQrCode = () => {
    if (qrBox) {
      setQrBox(null)
    } else {
      const size = Math.round(Math.min(dim.w, dim.h) * 0.14)
      setQrBox({ x: dim.w - size - 40, y: dim.h - size - 40, width: size, height: size })
    }
  }

  // Upload foto sample untuk Foto Preview (tidak disimpan ke server)
  const uploadSamplePhoto = (capIndex, file) => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => setSamplePhotos(prev => ({ ...prev, [capIndex]: r.result }))
    r.readAsDataURL(file)
  }

  // Urutan Layer (Naik / Turun / Hapus)
  const moveLayer = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= sl.length) return
    const copy = [...sl]
    const temp = copy[idx]
    copy[idx] = copy[target]
    copy[target] = temp
    setSl(copy)
    setSelIdx(target)
  }

  const removeLayer = idx => {
    setSl(sl.filter((_, i) => i !== idx))
    if (selIdx === idx) setSelIdx(null)
  }

  // Konversi koordinat pointer mouse ke koordinat SVG
  const getSvgCoords = e => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const scaleX = dim.w / rect.width
    const scaleY = dim.h / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const startDrag = (e, idx, mode) => {
    if (viewMode === 'preview') return
    e.stopPropagation()
    const pt = getSvgCoords(e)
    const item = idx === 'qr' ? qrBox : sl[idx]
    if (!item) return
    setSelIdx(idx)
    dragRef.current = { idx, mode, startX: pt.x, startY: pt.y, orig: { ...item } }
  }

  const onPointerMove = e => {
    if (!dragRef.current) return
    const { idx, mode, startX, startY, orig } = dragRef.current
    const pt = getSvgCoords(e)
    const dx = Math.round(pt.x - startX)
    const dy = Math.round(pt.y - startY)

    if (idx === 'qr') {
      if (mode === 'move') {
        setQrBox({
          ...orig,
          x: Math.max(0, Math.min(dim.w - orig.width, orig.x + dx)),
          y: Math.max(0, Math.min(dim.h - orig.height, orig.y + dy))
        })
      } else {
        const nw = Math.max(40, Math.min(dim.w - orig.x, orig.width + dx))
        setQrBox({ ...orig, width: nw, height: nw })
      }
      return
    }

    setSl(prev => prev.map((s, i) => {
      if (i !== idx) return s
      if (mode === 'move') {
        return {
          ...s,
          x: Math.max(0, Math.min(dim.w - s.width, orig.x + dx)),
          y: Math.max(0, Math.min(dim.h - s.height, orig.y + dy))
        }
      } else {
        return {
          ...s,
          width: Math.max(40, Math.min(dim.w - orig.x, orig.width + dx)),
          height: Math.max(40, Math.min(dim.h - orig.y, orig.height + dy))
        }
      }
    }))
  }

  const endDrag = () => { dragRef.current = null }

  const handleSave = () => {
    if (!title.trim()) return flash('Nama frame wajib diisi!')
    const finalCaps = sl.length ? Math.max(...sl.map(s => s.capture)) + 1 : (frame.caps || 4)
    onSave({
      ...frame,
      title: title.trim(),
      sizeLabel: sizeId,
      w: dim.w,
      h: dim.h,
      caps: finalCaps,
      asset,
      active,
      customSlots: sl,
      qrBox
    })
  }

  return (
    <div className="fe-wrap" onPointerMove={onPointerMove} onPointerUp={endDrag}>
      {/* HEADER BAR ATAS */}
      <div className="fe-top">
        <div>
          <h1 className="fe-title">{isNew ? 'Frame Baru' : 'Ubah Frame'}</h1>
          <div className="fe-sub">PNG direkomendasikan • Maks 15MB</div>
        </div>
        <div className="cc">
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          <button type="button" className="btn" disabled={busy} onClick={handleSave}>Simpan Frame</button>
        </div>
      </div>

      {msg && <div className="note" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* BODY 2 KOLOM: KIRI (TOOLBAR + KANVAS) & KANAN (SIDEBAR INSPECTOR) */}
      <div className="fe-body">
        <div className="fe-main">
          {/* TOOLBAR ATAS KANVAS */}
          <div className="fe-toolbar">
            <div className="fe-tgroup">
              <span className="fe-tlabel">Latar Canvas:</span>
              <button type="button" className={'fe-ibtn' + (bgMode === 'light' ? ' on' : '')} title="Terang" onClick={() => setBgMode('light')}>☀</button>
              <button type="button" className={'fe-ibtn' + (bgMode === 'dark' ? ' on' : '')} title="Gelap" onClick={() => setBgMode('dark')}>☾</button>
              <button type="button" className={'fe-ibtn' + (bgMode === 'grid' ? ' on' : '')} title="Checkerboard Transparan" onClick={() => setBgMode('grid')}>▦</button>

              <span className="fe-tlabel" style={{ marginLeft: 8 }}>Rotasi:</span>
              <button type="button" className={'fe-ibtn' + (rot === -90 ? ' on' : '')} title="Putar Kiri" onClick={() => setRot(-90)}>↺</button>
              <button type="button" className={'fe-ibtn' + (rot === 0 ? ' on' : '')} title="Normal" onClick={() => setRot(0)}>▢</button>
              <button type="button" className={'fe-ibtn' + (rot === 90 ? ' on' : '')} title="Putar Kanan" onClick={() => setRot(90)}>↻</button>

              <div className="fe-seg" style={{ marginLeft: 8 }}>
                <button type="button" className={viewMode === 'edit' ? 'on' : ''} onClick={() => setViewMode('edit')}>Ubah</button>
                <button type="button" className={viewMode === 'preview' ? 'on' : ''} onClick={() => setViewMode('preview')}>Preview</button>
              </div>

              <button type="button" className="fe-ibtn" title="Zoom Out / Reset" onClick={() => setZoom(z => z > 1 ? 1 : 1.25)}>🔍</button>
              <button type="button" className={'fe-ibtn' + (showOverlay ? ' on' : '')} title="Tampilkan/Sembunyikan Warna Slot" onClick={() => setShowOverlay(!showOverlay)}>🎨</button>
              <button type="button" className="fe-ibtn" title="Reset Semua Slot" onClick={() => { if (confirm('Kosongkan semua kotak slot?')) setSl([]) }}>🧹</button>
            </div>

            <div className="fe-tgroup">
              <button type="button" className={'fe-abtn' + (qrBox ? ' on' : '')} onClick={toggleQrCode}>⊞ Tambah QR Code</button>
              <button type="button" className="fe-abtn" disabled={busy} onClick={runAutoDetect}>✨ Deteksi Otomatis</button>
              <button type="button" className="btn" onClick={addNewPhotoNumber}>+ Tambah Foto</button>
            </div>
          </div>

          {/* AREA KANVAS */}
          <div
            className={'fe-stage ' + bgMode}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files[0]) }}
            onMouseDown={() => setSelIdx(null)}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/png,image/gif,image/webp"
              onChange={e => { handleFileUpload(e.target.files[0]); e.target.value = '' }}
            />

            {!asset && !sl.length ? (
              <div className="fe-dropzone" onClick={() => fileInputRef.current?.click()}>
                <div className="fe-drop-icon">🖼️</div>
                <b>Upload frame untuk memulai</b>
                <span>Seret PNG ke sini, atau klik untuk pilih file.</span>
              </div>
            ) : (
              <div className="fe-canvas-holder" style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}>
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${dim.w} ${dim.h}`}
                  className="fe-svg"
                  role="img"
                  aria-label="Kanvas Editor Frame"
                >
                  <defs>
                    {sl.map((s, i) => (
                      <clipPath id={`fe-clip-${i}`} key={i}>
                        <rect x={s.x} y={s.y} width={s.width} height={s.height} />
                      </clipPath>
                    ))}
                  </defs>

                  {/* 1. LAYER FOTO PREVIEW / KOTAK SLOT DI BAWAH FRAME PNG */}
                  {sl.map((s, i) => {
                    const sample = samplePhotos[s.capture]
                    const c = col(s.capture)
                    return (
                      <g key={'under-' + i}>
                        {sample ? (
                          <image
                            href={sample}
                            x={s.x}
                            y={s.y}
                            width={s.width}
                            height={s.height}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`url(#fe-clip-${i})`}
                          />
                        ) : (
                          showOverlay && viewMode === 'edit' && (
                            <rect x={s.x} y={s.y} width={s.width} height={s.height} fill={c} opacity="0.82" />
                          )
                        )}
                      </g>
                    )
                  })}

                  {/* 2. LAYER PNG FRAME UTAMA */}
                  {asset && <image href={asset} width={dim.w} height={dim.h} style={{ pointerEvents: 'none' }} />}

                  {/* 3. LAYER INTERAKTIF KOTAK SLOT (HANDLE, NOMOR, DRAG & RESIZE) */}
                  {viewMode === 'edit' && showOverlay && sl.map((s, i) => {
                    const c = col(s.capture)
                    const isSel = selIdx === i
                    const hasSample = !!samplePhotos[s.capture]
                    return (
                      <g key={'over-' + i} style={{ cursor: 'move' }} onPointerDown={e => startDrag(e, i, 'move')}>
                        <rect
                          x={s.x}
                          y={s.y}
                          width={s.width}
                          height={s.height}
                          fill={hasSample ? 'rgba(0,0,0,0.15)' : c}
                          fillOpacity={hasSample ? 0.25 : 0.72}
                          stroke={isSel ? '#ffffff' : c}
                          strokeWidth={Math.max(4, dim.w / 220)}
                        />
                        <text
                          x={s.x + s.width / 2}
                          y={s.y + s.height / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={Math.min(s.width, s.height) * 0.36}
                          fill="#ffffff"
                          fontWeight="700"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {s.capture + 1}
                        </text>
                        {/* Handle Resize Sudut Kanan Bawah */}
                        <rect
                          x={s.x + s.width - Math.max(24, dim.w / 45)}
                          y={s.y + s.height - Math.max(24, dim.w / 45)}
                          width={Math.max(24, dim.w / 45)}
                          height={Math.max(24, dim.w / 45)}
                          fill="#ffffff"
                          stroke={c}
                          strokeWidth={3}
                          style={{ cursor: 'nwse-resize' }}
                          onPointerDown={e => startDrag(e, i, 'resize')}
                        />
                      </g>
                    )
                  })}

                  {/* 4. KOTAK QR CODE JIKA DIAKTIFKAN */}
                  {qrBox && (
                    <g style={{ cursor: 'move' }} onPointerDown={e => startDrag(e, 'qr', 'move')}>
                      <rect
                        x={qrBox.x}
                        y={qrBox.y}
                        width={qrBox.width}
                        height={qrBox.height}
                        fill="rgba(255,255,255,0.9)"
                        stroke="#0f1720"
                        strokeWidth={Math.max(3, dim.w / 300)}
                      />
                      <text
                        x={qrBox.x + qrBox.width / 2}
                        y={qrBox.y + qrBox.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={qrBox.width * 0.26}
                        fill="#0f1720"
                        fontWeight="700"
                      >
                        QR
                      </text>
                    </g>
                  )}
                </svg>
              </div>
            )}

            {/* BADGE RESOLUSI KIRI BAWAH SEPERTI SS1 */}
            {(asset || sl.length > 0) && (
              <div className="fe-badge">
                {dim.w}x{dim.h} · {sizeId} · {rot === 0 ? 'Normal' : `${rot}°`}
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR KANAN */}
        <div className="fe-side">
          <div className="fe-card">
            <div className="fld">
              <label style={{ fontWeight: 600, color: 'var(--ink)' }}>Nama</label>
              <input
                placeholder="Masukkan nama frame"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="fld">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Ukuran</label>
                <span style={{ fontSize: 11, color: 'var(--pri)' }}>📏 Panduan ukuran</span>
              </div>
              <select value={sizeId} onChange={e => handleSizeChange(e.target.value)}>
                {SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <small style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--mute)' }}>
                Rekomendasi: {curSizeObj.rec}
              </small>
            </div>

            {sizeId === 'CUSTOM' && (
              <div className="cc" style={{ marginBottom: 10 }}>
                <div className="fld" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Lebar (px)</label>
                  <input type="number" value={dim.w} onChange={e => setDim({ ...dim, w: Number(e.target.value) || 1200 })} />
                </div>
                <div className="fld" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Tinggi (px)</label>
                  <input type="number" value={dim.h} onChange={e => setDim({ ...dim, h: Number(e.target.value) || 1800 })} />
                </div>
              </div>
            )}

            <div className="fe-hintbox">
              <b>Catatan:</b> Biarkan rotasi Normal saat mengatur slot. Ganti ke rotasi target setelah selesai.
            </div>

            {/* BAGIAN SLOT FOTO */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 13 }}>Slot Foto</b>
                <span style={{ fontSize: 12, color: 'var(--mute)' }}>{sl.length} / {caps}</span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: '4px 0 8px' }}>
                Klik tile untuk menambah kotak. Drag kotak di canvas untuk mengatur posisi.
              </p>
              <div className="fe-tiles">
                {uniqueCaptures.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="fe-tile"
                    style={{ background: col(c) }}
                    title={`Tambah kotak untuk Foto #${c + 1}`}
                    onClick={() => addSlotForCapture(c)}
                  >
                    {c + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className="fe-tile add"
                  title="Tambah Nomor Foto Baru"
                  onClick={addNewPhotoNumber}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="fe-upbtn"
                onClick={() => fileInputRef.current?.click()}
              >
                ⇧ {asset ? 'Ganti PNG Frame' : 'Upload Frame'}
              </button>
            </div>
          </div>

          {/* BAGIAN FOTO PREVIEW (MUNCUL BILA ADA SLOT) */}
          {uniqueCaptures.length > 0 && (
            <div className="fe-card">
              <b style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>🖼️ Foto Preview</b>
              <div className="fe-prev-list">
                {uniqueCaptures.map(c => (
                  <div className="fe-prev-item" key={c}>
                    <span className="fe-pbadge" style={{ background: col(c) }}>{c + 1}</span>
                    {samplePhotos[c] ? (
                      <img src={samplePhotos[c]} alt="" className="fe-pthumb" />
                    ) : (
                      <div className="fe-pthumb empty">🖼️</div>
                    )}
                    <label className="fe-plink">
                      Upload foto
                      <input type="file" hidden accept="image/*" onChange={e => uploadSamplePhoto(c, e.target.files[0])} />
                    </label>
                    {samplePhotos[c] && (
                      <button
                        type="button"
                        className="ic del"
                        style={{ marginLeft: 'auto', fontSize: 11 }}
                        onClick={() => setSamplePhotos(p => { const n = { ...p }; delete n[c]; return n })}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--mute)', margin: '8px 0 0' }}>
                Di-crop tengah persis seperti di booth. Foto yang diupload ikut tersimpan di preview frame saat sedang hidup/aktif.
              </p>
            </div>
          )}

          {/* BAGIAN URUTAN LAYER (MUNCUL BILA ADA SLOT) */}
          {sl.length > 0 && (
            <div className="fe-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>☰ Urutan Layer</b>
                <span style={{ fontSize: 11, color: 'var(--mute)' }}>{sl.length} kotak</span>
              </div>
              <div className="fe-layers">
                {sl.map((s, i) => (
                  <div
                    key={i}
                    className={'fe-layer' + (selIdx === i ? ' on' : '')}
                    onClick={() => setSelIdx(i)}
                  >
                    <span className="fe-pbadge" style={{ background: col(s.capture) }}>{s.capture + 1}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>L {sl.length - i}</span>
                    <span style={{ fontSize: 11, color: 'var(--mute)', marginLeft: 4 }}>
                      ({s.width}×{s.height})
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                      <button type="button" className="fe-lbtn" title="Naikkan" onClick={e => { e.stopPropagation(); moveLayer(i, -1) }}>⌃</button>
                      <button type="button" className="fe-lbtn" title="Turunkan" onClick={e => { e.stopPropagation(); moveLayer(i, 1) }}>⌄</button>
                      <button type="button" className="fe-lbtn del" title="Hapus Kotak" onClick={e => { e.stopPropagation(); removeLayer(i) }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}