import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Eraser, Grid2x2, Grid3x3, Image as ImageIcon, Info, Moon,
  Palette, Paperclip, Pipette, Plus, QrCode, RotateCcw, RotateCw, Ruler,
  Square, Sun, Trash2, Upload, WandSparkles, ZoomIn
} from 'lucide-react'
import { Modal } from './Crud.jsx'
import { detectFromUrl } from './slotDetect.js'
import { slots as autoSlots } from './utils.js'

export const FRAME_SIZES = [
  { key: '2R', label: '2R (4x6 CUT)', w: 1200, h: 1800, div: '1.00', desc: 'Strip 2 kolom 4x6 potong tengah (1200 x 1800 px)' },
  { key: '4R', label: '4R (4x6)', w: 1200, h: 1800, div: '1.00', desc: 'Cetak penuh 4x6 inci 300 DPI (1200 x 1800 px)' },
  { key: 'A4', label: 'A4', w: 2480, h: 3508, div: '1.00', desc: 'Kertas A4 300 DPI (2480 x 3508 px)' },
  { key: 'SQ', label: 'Square (1:1)', w: 1080, h: 1080, div: '1.00', desc: 'Persegi 1:1 untuk Frame GIF / Square (1080 x 1080 px)' },
  { key: 'CUSTOM', label: 'Custom', w: 1200, h: 1800, div: '1.00', desc: 'Atur lebar dan tinggi kanvas secara manual' }
]

export const inferFrameSize = f => {
  if (f.size) return f.size
  if (f.w === 2480 && f.h === 3508) return 'A4'
  if (f.w === f.h) return 'SQ'
  return '2R'
}

const SLOT_PALETTES = [
  { name: 'Ungu', colors: ['#6c4cf5', '#2563eb', '#16a34a', '#f97316', '#db2777', '#0891b2'] },
  { name: 'Cerah', colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'] },
  { name: 'Monokrom', colors: ['#0f172a', '#334155', '#475569', '#64748b', '#1e293b', '#0284c7'] }
]

const CANVAS_SWATCHES = ['#ffffff', '#0f172a', '#e2e8f0', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7']

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const parseHex = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

const loadImage = src => new Promise((ok, no) => {
  const img = new Image()
  img.onload = () => ok(img)
  img.onerror = no
  img.src = src
})

/** Removes matching background color within tolerance (0..100) into alpha=0 PNG data URL. */
async function removeBackgroundDataUrl(src, hexColor, tolerance) {
  const img = await loadImage(src)
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const [tr, tg, tb] = parseHex(hexColor)
  const maxDistSq = Math.pow((tolerance / 100) * 442, 2)
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb
    if (dr * dr + dg * dg + db * db <= maxDistSq) d[i + 3] = 0
  }
  ctx.putImageData(imgData, 0, 0)
  return c.toDataURL('image/png')
}

/** Transforms a slot rectangle when the canvas is rotated by -90, 0, or 90 degrees. */
function rotateBox(box, w, h, deg) {
  if (deg === 90) return { ...box, x: h - (box.y + box.height), y: box.x, width: box.height, height: box.width }
  if (deg === -90) return { ...box, x: box.y, y: w - (box.x + box.width), width: box.height, height: box.width }
  return box
}

/** Renders the final PNG stretched to target dimensions and optionally rotated by -90/0/90. */
async function bakeFramePng(src, targetW, targetH, rotationDeg) {
  const img = await loadImage(src)
  const rot90 = Math.abs(rotationDeg) === 90
  const c = document.createElement('canvas')
  c.width = rot90 ? targetH : targetW
  c.height = rot90 ? targetW : targetH
  const ctx = c.getContext('2d')
  ctx.save()
  if (rotationDeg === 90) {
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2)
  } else if (rotationDeg === -90) {
    ctx.translate(0, c.height)
    ctx.rotate(-Math.PI / 2)
  }
  ctx.drawImage(img, 0, 0, targetW, targetH)
  ctx.restore()
  return c.toDataURL('image/png')
}

/** Interactive full-page frame editor matching the Photolab Frame Baru / Edit Frame layout. */
export default function FrameEditor({ frame, isNew, type, onCancel, onSave }) {
  const initSize = frame.size || (type === 'GIF' ? 'SQ' : inferFrameSize(frame))
  const initSlots = frame.customSlots && frame.customSlots.length
    ? frame.customSlots.map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height, capture: s.capture ?? 0 }))
    : (isNew ? [] : autoSlots(frame).map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height, capture: s.capture ?? 0 })))

  const [title, setTitle] = useState(frame.title || '')
  const [size, setSize] = useState(initSize)
  const [dim, setDim] = useState({ w: frame.w || 1200, h: frame.h || 1800 })
  const [imgDim, setImgDim] = useState(null)
  const [slotList, setSlotList] = useState(initSlots)
  const [selectedIdx, setSelectedIdx] = useState(initSlots.length ? 0 : null)
  const [qrSlot, setQrSlot] = useState(frame.qrSlot || null)
  const [active, setActive] = useState(frame.active !== false)
  const [rotation, setRotation] = useState(0)

  const [canvasBg, setCanvasBg] = useState('checker')
  const [customBgColor, setCustomBgColor] = useState('#e2e8f0')
  const [mode, setMode] = useState('edit')
  const [zoom, setZoom] = useState(1)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [showGrid, setShowGrid] = useState(false)
  const [openTool, setOpenTool] = useState(null) // 'zoom' | 'color' | 'attach' | null
  const [showSizeGuide, setShowSizeGuide] = useState(false)

  const [rawAsset, setRawAsset] = useState('')
  const [processedAsset, setProcessedAsset] = useState('')
  const [bgRemove, setBgRemove] = useState({ enabled: false, color: '#ffffff', tolerance: 20 })
  const [pickingColor, setPickingColor] = useState(false)

  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const fileRef = useRef(null)
  const canvasBoxRef = useRef(null)
  const toolbarRef = useRef(null)
  const dragRef = useRef(null)

  const sourceAsset = rawAsset || frame.asset || ''
  const displayAsset = (bgRemove.enabled && processedAsset) ? processedAsset : sourceAsset
  const palette = SLOT_PALETTES[paletteIdx].colors
  const sizeMeta = FRAME_SIZES.find(s => s.key === size) || FRAME_SIZES[0]
  const sizeMismatch = !!imgDim && (imgDim.w !== dim.w || imgDim.h !== dim.h)

  const captureGroups = useMemo(() => {
    if (!slotList.length) return []
    const maxCap = Math.max(...slotList.map(s => s.capture))
    return Array.from({ length: maxCap + 1 }, (_, i) => i)
  }, [slotList])

  const uniquePhotoCount = useMemo(() => new Set(slotList.map(s => s.capture)).size, [slotList])

  // Load natural dimensions of existing frame asset when editing
  useEffect(() => {
    if (!sourceAsset) { setImgDim(null); return }
    let dead = false
    loadImage(sourceAsset)
      .then(img => { if (!dead && img.naturalWidth) setImgDim({ w: img.naturalWidth, h: img.naturalHeight }) })
      .catch(() => {})
    return () => { dead = true }
  }, [sourceAsset])

  // Live background removal processing
  useEffect(() => {
    if (!bgRemove.enabled || !sourceAsset) { setProcessedAsset(''); return }
    let dead = false
    const t = setTimeout(() => {
      removeBackgroundDataUrl(sourceAsset, bgRemove.color, bgRemove.tolerance)
        .then(url => { if (!dead) setProcessedAsset(url) })
        .catch(() => {})
    }, 60)
    return () => { dead = true; clearTimeout(t) }
  }, [bgRemove.enabled, bgRemove.color, bgRemove.tolerance, sourceAsset])

  // Close toolbar popovers on outside click
  useEffect(() => {
    const onDocDown = e => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) setOpenTool(null)
    }
    document.addEventListener('pointerdown', onDocDown)
    return () => document.removeEventListener('pointerdown', onDocDown)
  }, [])

  // Keyboard Delete/Backspace for selected slot
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target && e.target.tagName) || ''
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (selectedIdx === 'qr') { setQrSlot(null); setSelectedIdx(null); e.preventDefault() }
      else if (typeof selectedIdx === 'number') {
        setSlotList(prev => prev.filter((_, i) => i !== selectedIdx))
        setSelectedIdx(null)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIdx])

  // Pointer drag & resize handling (rotation-aware)
  useEffect(() => {
    const onMove = e => {
      const d = dragRef.current
      if (!d || !canvasBoxRef.current) return
      const rect = canvasBoxRef.current.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      const sdx = e.clientX - d.startX
      const sdy = e.clientY - d.startY
      const rot90 = Math.abs(rotation) === 90
      const scaleX = dim.w / (rot90 ? rect.height : rect.width)
      const scaleY = dim.h / (rot90 ? rect.width : rect.height)
      let dx = Math.round(sdx * scaleX)
      let dy = Math.round(sdy * scaleY)
      if (rotation === 90) { dx = Math.round(sdy * scaleX); dy = Math.round(-sdx * scaleY) }
      else if (rotation === -90) { dx = Math.round(-sdy * scaleX); dy = Math.round(sdx * scaleY) }

      const applyDrag = box => {
        if (d.kind === 'move') {
          return {
            ...box,
            x: clamp(d.orig.x + dx, 0, Math.max(0, dim.w - box.width)),
            y: clamp(d.orig.y + dy, 0, Math.max(0, dim.h - box.height))
          }
        }
        return {
          ...box,
          width: clamp(d.orig.width + dx, 40, dim.w - d.orig.x),
          height: clamp(d.orig.height + dy, 40, dim.h - d.orig.y)
        }
      }

      if (d.target === 'qr') setQrSlot(prev => prev ? applyDrag(prev) : prev)
      else setSlotList(prev => prev.map((s, idx) => idx === d.index ? applyDrag(s) : s))
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dim.w, dim.h, rotation])

  const handleSizeChange = nextKey => {
    setSize(nextKey)
    const preset = FRAME_SIZES.find(s => s.key === nextKey)
    if (preset && nextKey !== 'CUSTOM') setDim({ w: preset.w, h: preset.h })
  }

  const handleFile = file => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) return setErr('Ukuran file maksimal 15MB.')
    setErr('')
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setRawAsset(dataUrl)
      setProcessedAsset('')
      setOpenTool(null)
      setMsg('Frame dimuat. Klik "Deteksi Otomatis" atau "+ Tambah Foto" untuk mengatur slot.')
    }
    reader.readAsDataURL(file)
  }

  const handleDetect = async () => {
    if (!displayAsset) return
    setErr('')
    try {
      const res = await detectFromUrl(displayAsset)
      if (!res.slots.length) {
        setMsg('Tidak ada area transparan yang cukup besar pada gambar ini. Aktifkan Hapus Background bila latar masih solid.')
        return
      }
      const sx = dim.w / res.w, sy = dim.h / res.h
      const scaledSlots = res.slots.map(s => ({
        x: Math.round(s.x * sx),
        y: Math.round(s.y * sy),
        width: Math.max(20, Math.round(s.width * sx)),
        height: Math.max(20, Math.round(s.height * sy)),
        capture: s.capture
      }))
      setSlotList(scaledSlots)
      setSelectedIdx(0)
      setMsg(`${scaledSlots.length} slot terdeteksi (${res.caps} foto).`)
    } catch {
      setErr('Gagal membaca gambar untuk deteksi otomatis.')
    }
  }

  const addSlotForCapture = captureIdx => {
    const w = Math.round(dim.w * 0.36)
    const h = Math.round(dim.h * 0.24)
    const offset = (slotList.length % 5) * 28
    const next = {
      x: clamp(Math.round((dim.w - w) / 2) + offset, 0, Math.max(0, dim.w - w)),
      y: clamp(Math.round(dim.h * 0.12) + offset, 0, Math.max(0, dim.h - h)),
      width: w,
      height: h,
      capture: captureIdx
    }
    setSlotList(prev => {
      const updated = [...prev, next]
      setSelectedIdx(updated.length - 1)
      return updated
    })
  }

  const nextCaptureIdx = slotList.length ? Math.max(...slotList.map(s => s.capture)) + 1 : 0

  const updateSelectedSlot = (key, raw) => {
    const val = Math.max(0, Math.round(Number(raw) || 0))
    if (selectedIdx === 'qr') {
      setQrSlot(prev => prev ? { ...prev, [key]: key === 'width' || key === 'height' ? Math.max(20, val) : val } : prev)
      return
    }
    if (typeof selectedIdx !== 'number') return
    setSlotList(prev => prev.map((s, i) => i === selectedIdx ? { ...s, [key]: key === 'capture' ? Math.max(0, val - 1) : val } : s))
  }

  const removeSelectedSlot = () => {
    if (selectedIdx === 'qr') { setQrSlot(null); setSelectedIdx(null); return }
    if (typeof selectedIdx !== 'number') return
    setSlotList(prev => prev.filter((_, i) => i !== selectedIdx))
    setSelectedIdx(null)
  }

  const toggleQrSlot = () => {
    if (qrSlot) {
      setQrSlot(null)
      if (selectedIdx === 'qr') setSelectedIdx(null)
      return
    }
    const sz = Math.round(Math.min(dim.w, dim.h) * 0.14)
    setQrSlot({ x: Math.max(20, dim.w - sz - 40), y: Math.max(20, dim.h - sz - 40), width: sz, height: sz })
    setSelectedIdx('qr')
  }

  const sampleColorFromCanvas = async e => {
    if (!pickingColor || !sourceAsset || !canvasBoxRef.current) return
    e.stopPropagation()
    const rect = canvasBoxRef.current.getBoundingClientRect()
    const rx = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const ry = clamp((e.clientY - rect.top) / rect.height, 0, 1)
    try {
      const img = await loadImage(sourceAsset)
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const px = clamp(Math.floor(rx * c.width), 0, c.width - 1)
      const py = clamp(Math.floor(ry * c.height), 0, c.height - 1)
      const [r, g, b] = ctx.getImageData(px, py, 1, 1).data
      setBgRemove(prev => ({ ...prev, enabled: true, color: toHex(r, g, b) }))
    } finally {
      setPickingColor(false)
    }
  }

  const submitSave = async () => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return setErr('Nama frame wajib diisi.')
    setErr('')
    setSaving(true)
    try {
      const targetW = Math.max(100, Math.round(dim.w))
      const targetH = Math.max(100, Math.round(dim.h))
      const rot90 = Math.abs(rotation) === 90
      const outW = rot90 ? targetH : targetW
      const outH = rot90 ? targetW : targetH

      const outSlots = slotList.map(s => rotateBox(s, targetW, targetH, rotation))
      const outQr = qrSlot ? rotateBox(qrSlot, targetW, targetH, rotation) : undefined
      const needsBake = !!displayAsset && (!!rawAsset || bgRemove.enabled || rotation !== 0 || sizeMismatch)
      const assetToUpload = needsBake ? await bakeFramePng(displayAsset, targetW, targetH, rotation) : ''

      const caps = outSlots.length ? Math.max(...outSlots.map(s => s.capture)) + 1 : Math.max(1, frame.caps || 1)
      const nextFrame = {
        ...frame,
        type,
        title: cleanTitle,
        size,
        source: frame.source || 'Ditambah manual',
        w: outW,
        h: outH,
        caps,
        rotation: 0,
        active,
        customSlots: outSlots,
        qrSlot: outQr
      }
      await onSave(nextFrame, assetToUpload)
    } catch (e) {
      setErr(e?.message || 'Gagal menyimpan frame.')
      setSaving(false)
    }
  }

  const selectedSlot = typeof selectedIdx === 'number' ? slotList[selectedIdx] : null
  const rot90 = Math.abs(rotation) === 90
  const baseW = Math.round(350 * zoom * clamp(dim.w / dim.h * 1.35, 0.75, 1.45))
  const baseH = Math.round(baseW * (dim.h / dim.w))
  const stageClass = canvasBg === 'custom' ? 'bg-custom' : `bg-${canvasBg}`
  const stageStyle = canvasBg === 'custom' ? { backgroundColor: customBgColor } : undefined

  return (
    <div className="card fe-shell">
      <div className="fe-top">
        <div>
          <h3>{isNew ? 'Frame Baru' : 'Edit Frame'}</h3>
          <div className="fe-sub">PNG direkomendasikan • Maks 15MB</div>
        </div>
        <div className="cc">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Batal</button>
          <button type="button" className="btn" onClick={submitSave} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan Frame'}
          </button>
        </div>
      </div>

      {err && <div className="fe-err">{err}</div>}

      <div className="fe-grid">
        <div className="fe-left">
          <div className="fe-toolbar" ref={toolbarRef}>
            <div className="fe-tgroup">
              <span className="fe-tlabel">Latar Canvas:</span>
              <div className="fe-seg">
                <button type="button" className={canvasBg === 'light' ? 'on' : ''} title="Latar Terang" onClick={() => setCanvasBg('light')}><Sun size={14} /></button>
                <button type="button" className={canvasBg === 'dark' ? 'on' : ''} title="Latar Gelap" onClick={() => setCanvasBg('dark')}><Moon size={14} /></button>
                <button type="button" className={canvasBg === 'checker' ? 'on' : ''} title="Latar Transparan" onClick={() => setCanvasBg('checker')}><Grid2x2 size={14} /></button>
              </div>
            </div>

            <div className="fe-tgroup">
              <span className="fe-tlabel">Rotasi:</span>
              <div className="fe-seg">
                <button type="button" className={rotation === -90 ? 'on' : ''} title="Putar Kiri 90°" onClick={() => setRotation(r => r === -90 ? 0 : -90)}><RotateCcw size={14} /></button>
                <button type="button" className={rotation === 0 ? 'on' : ''} title="Normal (0°)" onClick={() => setRotation(0)}><Square size={14} /></button>
                <button type="button" className={rotation === 90 ? 'on' : ''} title="Putar Kanan 90°" onClick={() => setRotation(r => r === 90 ? 0 : 90)}><RotateCw size={14} /></button>
              </div>
            </div>

            <div className="fe-seg">
              <button type="button" className={'txt ' + (mode === 'edit' ? 'on' : '')} onClick={() => setMode('edit')}>Ubah</button>
              <button type="button" className={'txt ' + (mode === 'preview' ? 'on' : '')} onClick={() => setMode('preview')}>Preview</button>
            </div>

            <div className="fe-popwrap">
              <div className="fe-seg">
                <button
                  type="button"
                  className={openTool === 'zoom' || zoom !== 1 ? 'on' : ''}
                  title={`Zoom (${Math.round(zoom * 100)}%)`}
                  onClick={() => setOpenTool(t => t === 'zoom' ? null : 'zoom')}
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  className={openTool === 'color' || canvasBg === 'custom' ? 'on' : ''}
                  title="Warna Canvas & Slot"
                  onClick={() => setOpenTool(t => t === 'color' ? null : 'color')}
                >
                  <Palette size={14} />
                </button>
                <button
                  type="button"
                  className={openTool === 'attach' || showGrid ? 'on' : ''}
                  title="Grid Bantu & Lampirkan Frame"
                  onClick={() => setOpenTool(t => t === 'attach' ? null : 'attach')}
                >
                  <Paperclip size={14} />
                </button>
              </div>

              {openTool === 'zoom' && (
                <div className="fe-pop">
                  <div className="fe-pop-title">Zoom Kanvas ({Math.round(zoom * 100)}%)</div>
                  <div className="cc">
                    <button type="button" className="btn ghost fe-sm" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>-</button>
                    <button type="button" className="btn ghost fe-sm" onClick={() => setZoom(1)}>100%</button>
                    <button type="button" className="btn ghost fe-sm" onClick={() => setZoom(z => Math.min(2, +(z + 0.25).toFixed(2)))}>+</button>
                  </div>
                </div>
              )}

              {openTool === 'color' && (
                <div className="fe-pop">
                  <div className="fe-pop-title">Warna Latar Canvas</div>
                  <div className="fe-swatches">
                    {CANVAS_SWATCHES.map(hex => (
                      <button
                        type="button"
                        key={hex}
                        className={'fe-swatch ' + (canvasBg === 'custom' && customBgColor === hex ? 'on' : '')}
                        style={{ background: hex }}
                        title={hex}
                        onClick={() => { setCustomBgColor(hex); setCanvasBg('custom') }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Pilih warna canvas kustom"
                      value={customBgColor}
                      onChange={e => { setCustomBgColor(e.target.value); setCanvasBg('custom') }}
                    />
                  </div>
                  <div className="fe-pop-title" style={{ marginTop: 10 }}>Warna Slot</div>
                  <div className="cc" style={{ flexWrap: 'wrap' }}>
                    {SLOT_PALETTES.map((p, idx) => (
                      <button
                        type="button"
                        key={p.name}
                        className={'btn ghost fe-sm ' + (paletteIdx === idx ? 'on' : '')}
                        onClick={() => setPaletteIdx(idx)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {openTool === 'attach' && (
                <div className="fe-pop">
                  <div className="fe-pop-title">Kanvas & File Frame</div>
                  <div className="fe-pop-col">
                    <button type="button" className="btn ghost fe-sm" onClick={() => { setShowGrid(g => !g); setOpenTool(null) }}>
                      <Grid3x3 size={14} /> {showGrid ? 'Sembunyikan Grid Bantu' : 'Tampilkan Grid Bantu'}
                    </button>
                    <button type="button" className="btn ghost fe-sm" onClick={() => { setOpenTool(null); fileRef.current?.click() }}>
                      <Upload size={14} /> {sourceAsset ? 'Ganti Gambar Frame' : 'Upload Gambar Frame'}
                    </button>
                    {sourceAsset && (
                      <button
                        type="button"
                        className="btn ghost fe-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => { setRawAsset(''); setProcessedAsset(''); setImgDim(null); setOpenTool(null) }}
                      >
                        <Trash2 size={14} /> Hapus Gambar Frame
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="fe-tgroup fe-qr-wrap">
              <span title="Tambahkan kotak area QR Code pada frame" style={{ display: 'inline-flex', color: 'var(--mute)' }}><Info size={14} /></span>
              <button type="button" className={'btn ghost fe-qrbtn ' + (qrSlot ? 'on' : '')} onClick={toggleQrSlot}>
                <QrCode size={14} /> {qrSlot ? 'Hapus QR Code' : 'Tambah QR Code'}
              </button>
            </div>
          </div>

          <div className="fe-toolbar2">
            <button type="button" className="btn ghost fe-detect" disabled={!displayAsset} onClick={handleDetect}>
              <WandSparkles size={15} /> Deteksi Otomatis
            </button>
            <button type="button" className="btn fe-addphoto" onClick={() => addSlotForCapture(nextCaptureIdx)}>
              <Plus size={15} /> Tambah Foto
            </button>
            {sourceAsset && (
              <button type="button" className="btn ghost fe-detect" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Ganti Frame
              </button>
            )}
            {msg && <span className="fe-msg">{msg}</span>}
          </div>

          <div
            className={`fe-stage ${stageClass} ${dragOver ? 'over' : ''} ${pickingColor ? 'picking' : ''}`}
            style={stageStyle}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          >
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
            />

            {!displayAsset && !slotList.length ? (
              <button type="button" className="fe-drop" onClick={() => fileRef.current?.click()}>
                <ImageIcon size={38} strokeWidth={1.6} />
                <b>Upload frame untuk memulai</b>
                <span>Seret PNG ke sini, atau klik untuk pilih file.</span>
              </button>
            ) : (
              <div className="fe-canvas-scroll">
                <div className="fe-rot-box" style={{ width: rot90 ? baseH : baseW, height: rot90 ? baseW : baseH }}>
                  <div
                    ref={canvasBoxRef}
                    className={`fe-canvas ${stageClass}`}
                    style={{
                      width: baseW,
                      height: baseH,
                      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                      ...stageStyle
                    }}
                    onClick={e => {
                      if (pickingColor) return sampleColorFromCanvas(e)
                      if (e.target === e.currentTarget) setSelectedIdx(null)
                    }}
                  >
                    {slotList.map((s, idx) => {
                      const col = palette[s.capture % palette.length]
                      const isSel = mode === 'edit' && selectedIdx === idx
                      return (
                        <div
                          key={idx}
                          className={'fe-slot ' + (isSel ? 'sel ' : '') + (mode === 'preview' ? 'prev' : '')}
                          style={{
                            left: `${(s.x / dim.w) * 100}%`,
                            top: `${(s.y / dim.h) * 100}%`,
                            width: `${(s.width / dim.w) * 100}%`,
                            height: `${(s.height / dim.h) * 100}%`,
                            borderColor: mode === 'preview' ? 'transparent' : col,
                            backgroundColor: mode === 'preview' ? col : `${col}33`
                          }}
                          onPointerDown={e => {
                            if (pickingColor || mode !== 'edit') return
                            e.stopPropagation()
                            setSelectedIdx(idx)
                            dragRef.current = { target: 'slot', index: idx, kind: 'move', startX: e.clientX, startY: e.clientY, orig: s }
                          }}
                        >
                          {mode === 'preview' ? (
                            <span className="fe-prevtag">Foto {s.capture + 1}</span>
                          ) : (
                            <span className="fe-snum" style={{ background: col }}>{s.capture + 1}</span>
                          )}
                          {mode === 'edit' && (
                            <span
                              className="fe-handle"
                              style={{ background: col }}
                              onPointerDown={e => {
                                e.stopPropagation()
                                setSelectedIdx(idx)
                                dragRef.current = { target: 'slot', index: idx, kind: 'resize', startX: e.clientX, startY: e.clientY, orig: s }
                              }}
                            />
                          )}
                        </div>
                      )
                    })}

                    {displayAsset && <img src={displayAsset} alt="Frame" className="fe-frameimg" draggable={false} />}

                    {showGrid && (
                      <div className="fe-gridlines" aria-hidden="true">
                        <span className="v1" /><span className="v2" />
                        <span className="h1" /><span className="h2" />
                      </div>
                    )}

                    {qrSlot && (
                      <div
                        className={'fe-slot fe-qr ' + (selectedIdx === 'qr' ? 'sel' : '')}
                        style={{
                          left: `${(qrSlot.x / dim.w) * 100}%`,
                          top: `${(qrSlot.y / dim.h) * 100}%`,
                          width: `${(qrSlot.width / dim.w) * 100}%`,
                          height: `${(qrSlot.height / dim.h) * 100}%`
                        }}
                        onPointerDown={e => {
                          if (pickingColor || mode !== 'edit') return
                          e.stopPropagation()
                          setSelectedIdx('qr')
                          dragRef.current = { target: 'qr', kind: 'move', startX: e.clientX, startY: e.clientY, orig: qrSlot }
                        }}
                      >
                        <QrCode size={22} />
                        {mode === 'edit' && (
                          <span
                            className="fe-handle"
                            onPointerDown={e => {
                              e.stopPropagation()
                              dragRef.current = { target: 'qr', kind: 'resize', startX: e.clientX, startY: e.clientY, orig: qrSlot }
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="fe-side">
          <div className="fld">
            <label htmlFor="fe-name"><b>Nama</b></label>
            <input id="fe-name" placeholder="Masukkan nama frame" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="fld">
            <div className="fe-shead">
              <label htmlFor="fe-size" style={{ margin: 0 }}><b>Ukuran</b></label>
              <button type="button" className="fe-linkbtn" onClick={() => setShowSizeGuide(true)}>
                <Ruler size={13} /> Panduan ukuran
              </button>
            </div>
            <select id="fe-size" value={size} onChange={e => handleSizeChange(e.target.value)}>
              {FRAME_SIZES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <div className="fe-hint">Rekomendasi: {dim.w}x{dim.h} • Pembagi: {sizeMeta.div}</div>
            {size === 'CUSTOM' && (
              <div className="fe-dimrow">
                <input type="number" min="100" aria-label="Lebar" value={dim.w} onChange={e => setDim(d => ({ ...d, w: Math.max(100, Number(e.target.value) || 100) }))} />
                <span>×</span>
                <input type="number" min="100" aria-label="Tinggi" value={dim.h} onChange={e => setDim(d => ({ ...d, h: Math.max(100, Number(e.target.value) || 100) }))} />
              </div>
            )}
          </div>

          {sizeMismatch && (
            <div className="fe-warn" role="alert">
              <div className="fe-warn-hd"><AlertTriangle size={15} /><span>Ukuran frame tidak sesuai rekomendasi</span></div>
              <p>
                Diupload {imgDim.w}x{imgDim.h}, ukuran yang dipilih {dim.w}x{dim.h}. Saat disimpan frame di-stretch ke ukuran yang dipilih. Tidak ada yang terpotong, tapi proporsinya bergeser.
              </p>
              <button type="button" className="fe-linkbtn" onClick={() => { setSize('CUSTOM'); setDim({ ...imgDim }) }}>
                Sesuaikan ke {imgDim.w}×{imgDim.h}
              </button>
            </div>
          )}

          <div className="fe-note">
            <b>Catatan:</b> Biarkan rotasi Normal saat mengatur slot. Ganti ke rotasi target setelah selesai.
          </div>

          <div className="fld">
            <div className="fe-shead">
              <b>Slot Foto</b>
              <span className="fe-count">{uniquePhotoCount} / {slotList.length}</span>
            </div>
            <div className="fe-hint" style={{ marginBottom: 10 }}>
              Klik tile untuk menambah kotak. Drag kotak di canvas untuk mengatur posisi.
            </div>
            <div className="fe-tiles">
              {captureGroups.map(cap => (
                <button
                  type="button"
                  key={cap}
                  className="fe-tile"
                  style={{ borderColor: palette[cap % palette.length], color: palette[cap % palette.length] }}
                  title={`Tambah kotak untuk Foto ${cap + 1}`}
                  onClick={() => addSlotForCapture(cap)}
                >
                  {cap + 1}
                </button>
              ))}
              <button type="button" className="fe-tile add" title="Tambah foto baru" onClick={() => addSlotForCapture(nextCaptureIdx)}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          {(selectedSlot || (selectedIdx === 'qr' && qrSlot)) && (
            <div className="fe-slotbox">
              <div className="fe-shead" style={{ marginBottom: 8 }}>
                <b>{selectedIdx === 'qr' ? 'Slot QR Code' : `Slot #${selectedIdx + 1} (Foto ${selectedSlot.capture + 1})`}</b>
                <button type="button" className="ic del" onClick={removeSelectedSlot} title="Hapus slot"><Trash2 size={14} /></button>
              </div>
              <div className="fe-xy">
                {[['x', 'X'], ['y', 'Y'], ['width', 'Lebar'], ['height', 'Tinggi']].map(([k, lbl]) => {
                  const activeBox = selectedIdx === 'qr' ? qrSlot : selectedSlot
                  return (
                    <label key={k}>
                      <span>{lbl}</span>
                      <input type="number" value={activeBox[k]} onChange={e => updateSelectedSlot(k, e.target.value)} />
                    </label>
                  )
                })}
                {selectedSlot && (
                  <label>
                    <span>Foto ke-</span>
                    <input type="number" min="1" value={selectedSlot.capture + 1} onChange={e => updateSelectedSlot('capture', e.target.value)} />
                  </label>
                )}
              </div>
            </div>
          )}

          {sourceAsset && (
            <div className="fe-bgrem">
              <div className="fe-shead" style={{ marginBottom: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <Eraser size={15} /> Hapus Background
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={bgRemove.enabled}
                  className={'fe-switch ' + (bgRemove.enabled ? 'on' : '')}
                  onClick={() => setBgRemove(b => ({ ...b, enabled: !b.enabled }))}
                />
              </div>

              <div className="fe-bgrem-row">
                <label className="fe-bgrem-lbl">Warna</label>
                <div className="cc">
                  <input
                    type="color"
                    aria-label="Warna background yang dihapus"
                    value={bgRemove.color}
                    onChange={e => setBgRemove(b => ({ ...b, enabled: true, color: e.target.value }))}
                  />
                  <input
                    value={bgRemove.color}
                    aria-label="Kode hex warna"
                    onChange={e => setBgRemove(b => ({ ...b, color: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={'btn ghost fe-sm ' + (pickingColor ? 'on' : '')}
                    title="Ambil warna dari gambar canvas"
                    onClick={() => setPickingColor(p => !p)}
                  >
                    <Pipette size={14} />
                  </button>
                </div>
                {pickingColor && <div className="fe-hint">Klik langsung pada warna di gambar canvas…</div>}
              </div>

              <div className="fe-bgrem-row" style={{ marginTop: 10 }}>
                <div className="fe-shead" style={{ marginBottom: 4 }}>
                  <label htmlFor="fe-tol" className="fe-bgrem-lbl">Toleransi</label>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{bgRemove.tolerance}</span>
                </div>
                <input
                  id="fe-tol"
                  type="range"
                  min="0"
                  max="100"
                  className="fe-range"
                  value={bgRemove.tolerance}
                  onChange={e => setBgRemove(b => ({ ...b, enabled: true, tolerance: Number(e.target.value) }))}
                />
              </div>
            </div>
          )}

          <label className="fe-active">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            <span>Frame Aktif</span>
          </label>

          {!sourceAsset && (
            <button type="button" className="btn ghost fe-uploadbtn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Upload Frame
            </button>
          )}
        </aside>
      </div>

      {showSizeGuide && (
        <Modal title="Panduan Ukuran Frame" onClose={() => setShowSizeGuide(false)}>
          <div className="tw">
            <table style={{ minWidth: 360 }}>
              <thead><tr><th>Ukuran</th><th>Resolusi</th><th>Keterangan</th></tr></thead>
              <tbody>
                {FRAME_SIZES.filter(s => s.key !== 'CUSTOM').map(s => (
                  <tr key={s.key}><td><b>{s.label}</b></td><td className="mono">{s.w} × {s.h}</td><td>{s.desc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setShowSizeGuide(false)}>Tutup</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
