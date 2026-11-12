import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { useHealth, ago } from '../health.js'
import { uid, rp, fd, slots } from '../utils.js'

const TABS = [
  ['info', 'Info'],
  ['display', 'Tampilan'],
  ['general', 'Umum'],
  ['frames', 'Frame'],
  ['payment', 'Pembayaran'],
  ['timer', 'Timer'],
  ['camera', 'Kamera & Tampilan'],
  ['filters', 'Filter Kustom'],
  ['categories', 'Kategori Frame'],
  ['queue', 'Antrian'],
  ['ads', 'Iklan Idle']
]
const TAB_SEARCH = {
  display: 'welcome tutorial background warna teks gambar idle',
  general: 'nama pin payment key cabang lisensi kadaluarsa',
  frames: 'foto pilih tersedia dipilih',
  payment: 'voucher paywall event harga cetak print',
  timer: 'countdown photobooth qr detik',
  camera: 'mode mirror hasil orientasi landscape portrait',
  filters: 'custom filter efek copy',
  categories: 'kategori frame kelompok',
  queue: 'antrian antrean queue',
  ads: 'iklan idle video gambar durasi'
}

const COMMANDS = [
  ['rdm:kiosk:test_print', 'Test Print'],
  ['rdm:kiosk:last_print', 'Last Print'],
  ['rdm:kiosk:camera_test', 'Camera Test'],
  ['rdm:kiosk:reload', 'Reload Kiosk'],
  ['rdm:kiosk:force_sync', 'Force Sync'],
  ['rdm:kiosk:minimize', 'Minimize Kiosk']
]

const DEFAULT_DISPLAY = {
  layout: 'custom',
  customWelcome: true,
  backgroundColor: '#000000',
  textColor: '#ffffff',
  uiAccent: '#ffffff',
  welcomeText: '',
  footerText: '',
  logoImage: '',
  welcomeImage: '',
  tutorialImage: '',
  idleImage: '',
  qrLogo: '',
  galleryThemeEnabled: false,
  galleryAccent: '#6c4cf5',
  galleryBackground: '#ffffff',
  instagram: '',
  tiktok: ''
}
const DEFAULT_GENERAL = { pin: '0000', paymentKey: '' }
const DEFAULT_PAYMENT = {
  voucherOnly: false,
  disablePaywall: false,
  price: 35000,
  copies: '4R (x1)',
  extraPrint: false,
  extraPrintMax: 5
}
const DEFAULT_TIMER = { countdown: 4, booth: 500, qr: 80 }
const DEFAULT_CAMERA = {
  mode: 'Canon',
  driver: 'webcam',
  previewMirror: true,
  resultMirror: true,
  cameraOrientation: 'landscape',
  displayOrientation: 'landscape'
}

function kioskSettings(kiosk, frames, defaultPrice) {
  const saved = kiosk.settings || {}
  return {
    display: { ...DEFAULT_DISPLAY, ...saved.display },
    general: { ...DEFAULT_GENERAL, ...saved.general, pin: saved.general?.pin ?? kiosk.pin ?? '0000' },
    frames: {
      selectedIds: saved.frames?.selectedIds || frames.filter(frame => frame.active).map(frame => frame.id)
    },
    payment: { ...DEFAULT_PAYMENT, ...saved.payment, price: saved.payment?.price ?? defaultPrice },
    timer: { ...DEFAULT_TIMER, ...saved.timer },
    camera: { ...DEFAULT_CAMERA, ...saved.camera },
    filters: saved.filters || [],
    categories: saved.categories || [],
    queue: { enabled: false, ...saved.queue },
    ads: { items: [], ...saved.ads }
  }
}

function Field({ label, children, className = '' }) {
  return <label className={`km-field ${className}`}><span>{label}</span>{children}</label>
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="km-toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={event => onChange(event.target.checked)} />
    </label>
  )
}

function ColorSetting({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="km-color-setting">
        <input type="color" value={value || '#000000'} onChange={event => onChange(event.target.value)} />
        <code>{value || '#000000'}</code>
      </div>
    </Field>
  )
}

function UploadField({ label, value, accept, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const upload = async file => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('File tidak dapat dibaca.'))
        reader.readAsDataURL(file)
      })
      const result = await api('/assets', { method: 'POST', body: JSON.stringify({ data }) })
      if (result.error || !result.url) throw new Error(result.error || 'Server tidak mengembalikan URL file.')
      onChange(result.url)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Field label={label}>
      {value && (
        <div className="km-asset">
          {/^data:video|\.((mp4)|(webm))(\?|$)/i.test(value) ? <video src={value} muted controls /> : <img src={value} alt="" />}
          <button type="button" className="ic del" onClick={() => onChange('')}>Hapus</button>
        </div>
      )}
      <input type="file" accept={accept} disabled={busy} onChange={event => { upload(event.target.files[0]); event.target.value = '' }} />
      {busy && <small>Mengunggah…</small>}
      {error && <small className="err">{error}</small>}
    </Field>
  )
}

function DisplaySettings({ settings, setSection }) {
  const [preview, setPreview] = useState('welcome')
  const value = key => settings.display[key]
  const set = (key, next) => setSection('display', key, next)
  const customWelcome = value('layout') === 'custom' && value('customWelcome')
  const previewAsset = preview === 'welcome' ? value('welcomeImage') : value('tutorialImage')
  const previewVideo = /\.((mp4)|(webm))(\?|$)/i.test(previewAsset || '')
  const previewLogo = preview === 'softfile' && value('qrLogo') ? value('qrLogo') : value('logoImage')
  const previewStyle = {
    backgroundColor: preview === 'softfile' && value('galleryThemeEnabled')
      ? value('galleryBackground') || '#ffffff'
      : customWelcome ? value('backgroundColor') || '#000000' : '#1b1d22',
    color: preview === 'welcome' && customWelcome ? value('textColor') || '#ffffff' : '#ffffff',
    backgroundImage: previewAsset && !previewVideo ? `url("${previewAsset}")` : undefined,
    '--accent': value('uiAccent') || '#ffffff'
  }

  return (
    <div className="km-display-grid">
      <div className="km-display-form">
        <div className="km-display-row">
          <Field label="Layout Welcome">
            <select value={value('layout')} onChange={event => set('layout', event.target.value)}>
              <option value="custom">Custom (gambar full-bg)</option>
              <option value="default">Default</option>
            </select>
          </Field>
          <Toggle label="Layout Welcome custom (preview kamera)" checked={value('customWelcome')} onChange={next => set('customWelcome', next)} />
        </div>
        <div className="km-display-colors">
          <ColorSetting label="Warna background" value={value('backgroundColor')} onChange={next => set('backgroundColor', next)} />
          <ColorSetting label="Warna teks" value={value('textColor')} onChange={next => set('textColor', next)} />
          <ColorSetting label="Warna garis & aksen UI kiosk" value={value('uiAccent')} onChange={next => set('uiAccent', next)} />
        </div>
        <div className="km-display-row">
          <Field label="Teks welcome"><input value={value('welcomeText')} onChange={event => set('welcomeText', event.target.value)} /></Field>
          <Field label="Teks bawah"><input value={value('footerText')} onChange={event => set('footerText', event.target.value)} /></Field>
        </div>
        <div className="km-display-assets">
          <UploadField label="Logo kiosk" accept="image/*" value={value('logoImage')} onChange={next => set('logoImage', next)} />
          <UploadField label="Background welcome" accept="image/*,video/mp4,video/webm" value={value('welcomeImage')} onChange={next => set('welcomeImage', next)} />
          <UploadField label="Background tutorial" accept="image/*" value={value('tutorialImage')} onChange={next => set('tutorialImage', next)} />
          <UploadField label="Background idle" accept="image/*,video/mp4,video/webm" value={value('idleImage')} onChange={next => set('idleImage', next)} />
        </div>
        <div className="km-display-subsection">
          <div className="km-display-subhead"><b>Logo QR Digital</b><small>Override logo untuk halaman foto digital kiosk ini.</small></div>
          <UploadField label="Upload logo QR (khusus kiosk ini)" accept="image/*" value={value('qrLogo')} onChange={next => set('qrLogo', next)} />
        </div>
        <div className="km-display-subsection">
          <div className="km-display-subhead">
            <div><b>Tema Halaman Galeri Digital</b><small>Override tema halaman digital khusus kiosk ini.</small></div>
            <input aria-label="Aktifkan override tema galeri digital" type="checkbox" checked={value('galleryThemeEnabled')} onChange={event => set('galleryThemeEnabled', event.target.checked)} />
          </div>
          <div className="km-display-row">
            <ColorSetting label="Warna aksen" value={value('galleryAccent')} onChange={next => set('galleryAccent', next)} />
            <ColorSetting label="Warna latar" value={value('galleryBackground')} onChange={next => set('galleryBackground', next)} />
            <Field label="Instagram"><input value={value('instagram')} onChange={event => set('instagram', event.target.value)} placeholder="@akun" /></Field>
            <Field label="TikTok"><input value={value('tiktok')} onChange={event => set('tiktok', event.target.value)} placeholder="@akun" /></Field>
          </div>
        </div>
        <div className="note km-span-all">Background tutorial digunakan pada halaman pilih frame, sesi foto, dan pilih gaya.</div>
      </div>
      <aside className="km-live-preview">
        <div className="km-live-head">
          <b>Live Preview</b>
          <div role="tablist" aria-label="Mode preview kiosk">
            {['welcome', 'frame', 'softfile'].map((mode, index) => (
              <button key={mode} type="button" role="tab" aria-selected={preview === mode} className={preview === mode ? 'on' : ''} onClick={() => setPreview(mode)}>
                {['Welcome', 'Pilih Frame', 'Soft File'][index]}
              </button>
            ))}
          </div>
        </div>
        <div className={`km-preview-screen km-preview-${preview}`} style={previewStyle}>
          {previewVideo && <video className="km-preview-media" src={previewAsset} muted autoPlay loop playsInline />}
          {previewLogo && <img className="km-preview-logo" src={previewLogo} alt="Logo kiosk" />}
          {preview === 'welcome' ? (
            <div className="km-preview-copy">
              <small>Photobooth</small>
              <strong>{customWelcome && value('welcomeText') || 'Sentuh untuk memulai'}</strong>
              <span>{customWelcome && value('footerText') || 'Simpan momen spesialmu'}</span>
              <button type="button">MULAI</button>
            </div>
          ) : preview === 'frame' ? (
            <div className="km-preview-copy"><strong>Pilih Frame</strong><div className="km-preview-frame"><i /><i /><i /></div><button type="button">LANJUT</button></div>
          ) : (
            <div className="km-preview-copy"><strong>Hasil Foto</strong><span>Scan QR untuk mengunduh soft file</span><button type="button">MULAI LAGI</button></div>
          )}
        </div>
        <small className="km-preview-caption">Pratinjau langsung dari pengaturan kiosk.</small>
      </aside>
    </div>
  )
}

function RemoteControl({ kiosk, online, onClose }) {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState('')
  const run = async (event, label) => {
    setBusy(event)
    setResult('')
    try {
      const response = await api(`/kiosks/${kiosk.id}/command`, {
        method: 'POST',
        body: JSON.stringify({ event, payload: {} })
      })
      if (response.error || response.ok === false) throw new Error(response.error || 'Kiosk menolak perintah.')
      setResult(`${label}: berhasil`)
    } catch (error) {
      setResult(`${label}: ${error.message}`)
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="km-control">
      <div className="km-control-head"><b>Kontrol Kiosk</b><button type="button" className="ic" onClick={onClose}>Tutup</button></div>
      {!online && <div className="note">Kiosk sedang offline. Perintah hanya dapat dikirim saat kiosk terhubung.</div>}
      <div className="km-control-actions">
        {COMMANDS.map(([event, label]) => (
          <button key={event} type="button" className="btn ghost" disabled={!online || !!busy} onClick={() => run(event, label)}>
            {busy === event ? 'Mengirim…' : label}
          </button>
        ))}
      </div>
      {result && <p className="km-feedback" role="status">{result}</p>}
    </div>
  )
}

function KioskList({ onSelect }) {
  const { S, update } = useStore()
  const { health } = useHealth()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const rows = useMemo(() => S.kiosks.filter(kiosk => (kiosk.name || '').toLowerCase().includes(query.toLowerCase())), [S.kiosks, query])
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const healthFor = id => health.find(item => item.id === id) || {}
  const frameCount = kiosk => {
    const selectedIds = kiosk.settings?.frames?.selectedIds
    if (!Array.isArray(selectedIds)) return S.frames.filter(frame => frame.active).length
    const activeIds = new Set(S.frames.filter(frame => frame.active).map(frame => frame.id))
    return selectedIds.filter(id => activeIds.has(id)).length
  }
  const addKiosk = async () => {
    const kiosk = {
      id: uid(), name: '', branch: '', lang: 'ID', code: 'KS-' + uid().toUpperCase().slice(0, 4),
      activated: false, lastSync: '', active: true, settings: {}
    }
    try {
      await update({ kiosks: [kiosk, ...S.kiosks] })
      onSelect(kiosk.id)
    } catch (error) {
      window.alert(`Gagal menambahkan kiosk: ${error.message}`)
    }
  }
  return (
    <div className="panel km-list">
      <div className="hd">
        <h1>Daftar Kiosk</h1>
        <div className="cc">
          <input className="search" placeholder="Nama Kiosk" aria-label="Cari kiosk" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} />
          <button type="button" className="btn" onClick={addKiosk}>+ Tambah Kiosk</button>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Nama Kiosk</th><th>Jumlah Frame</th><th>Lisensi</th><th>Harga Per Cetak</th><th>Tanggal Kadaluarsa</th><th>Aksi</th></tr></thead>
          <tbody>
            {pageRows.map(kiosk => {
              const status = healthFor(kiosk.id)
              const price = kiosk.settings?.payment?.price ?? S.pay?.price ?? 0
              return (
                <tr key={kiosk.id}>
                  <td><button type="button" className="km-name-link" onClick={() => onSelect(kiosk.id)}>{kiosk.name || 'Kiosk tanpa nama'}</button>
                    <small className={'km-online ' + (status.online ? 'on' : '')}>{status.online ? 'Online' : 'Offline'}</small>
                  </td>
                  <td>{frameCount(kiosk)} Frame</td>
                  <td><code>{kiosk.license || kiosk.code || '-'}</code></td>
                  <td>{rp(price)}</td>
                  <td>{kiosk.licenseExpiry ? <span className="km-expiry">{fd(kiosk.licenseExpiry)}<small>Kedaluwarsa</small></span> : '-'}</td>
                  <td><button type="button" className="ic" aria-label={`Ubah ${kiosk.name}`} onClick={() => onSelect(kiosk.id)}>✎</button></td>
                </tr>
              )
            })}
            {!pageRows.length && <tr><td colSpan="6" className="empty">Belum ada kiosk. Klik Tambah Kiosk untuk membuat yang pertama.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="km-pagination">
        <span>{rows.length ? `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, rows.length)} dari ${rows.length} data` : '0 data'}</span>
        <button type="button" disabled={page === 1} onClick={() => setPage(current => current - 1)}>‹ Sebelumnya</button>
        <b>{page}</b>
        <button type="button" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>Berikutnya ›</button>
      </div>
    </div>
  )
}

function FrameSettings({ S, settings, setSection }) {
  const [query, setQuery] = useState('')
  const selected = settings.frames.selectedIds
  const filtered = S.frames.filter(frame => frame.active && (frame.title || '').toLowerCase().includes(query.toLowerCase()))
  const toggle = id => setSection('frames', 'selectedIds', selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id])
  return (
    <div className="km-section">
      <div className="km-section-heading"><div><b>Frame (foto)</b><small>Pilih frame yang tersedia pada kiosk ini.</small></div><span>{selected.length} dipilih</span></div>
      <Field label="Cari nama frame"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari frame…" /></Field>
      <div className="km-frame-grid">
        {filtered.map(frame => {
          const picked = selected.includes(frame.id)
          return (
            <button type="button" key={frame.id} className={'km-frame-card' + (picked ? ' selected' : '')} onClick={() => toggle(frame.id)} aria-pressed={picked}>
              <span className="km-frame-check">{picked ? '✓' : ''}</span>
              <svg viewBox={`0 0 ${frame.w || 1200} ${frame.h || 1800}`} role="img" aria-label={`Preview ${frame.title}`}>
                {frame.asset && <image href={frame.asset} width={frame.w || 1200} height={frame.h || 1800} />}
                {!frame.asset && slots(frame).map((slot, index) => <rect key={index} x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill="#6c4cf5" opacity=".8" />)}
              </svg>
              <b>{frame.title}</b><small>{frame.w || 1200} × {frame.h || 1800}</small>
            </button>
          )
        })}
        {!filtered.length && <div className="empty">Tidak ada frame yang cocok dengan pencarian.</div>}
      </div>
    </div>
  )
}

function FilterSettings({ S, kioskId, settings, setSettings }) {
  const [name, setName] = useState('')
  const [sourceId, setSourceId] = useState('')
  const add = () => {
    if (!name.trim()) return
    setSettings(previous => ({ ...previous, filters: [...previous.filters, { id: uid(), name: name.trim(), effect: 'grayscale' }] }))
    setName('')
  }
  const updateFilter = (id, patch) => setSettings(previous => ({
    ...previous, filters: previous.filters.map(filter => filter.id === id ? { ...filter, ...patch } : filter)
  }))
  const remove = id => setSettings(previous => ({ ...previous, filters: previous.filters.filter(filter => filter.id !== id) }))
  const copyFilters = () => {
    const source = S.kiosks.find(kiosk => kiosk.id === sourceId)
    if (source) setSettings(previous => ({
      ...previous,
      filters: (source.settings?.filters || []).map(filter => ({ ...filter, id: uid() }))
    }))
  }
  return (
    <div className="km-section">
      <div className="km-section-heading"><div><b>Filter Kustom</b><small>Atur filter yang dapat dipilih pelanggan dan diterapkan ke hasil foto.</small></div></div>
      <div className="km-filter-toolbar">
        <div className="cc">
          <select value={sourceId} onChange={event => setSourceId(event.target.value)} aria-label="Salin filter dari kiosk">
            <option value="">Pilih kiosk sumber</option>
            {S.kiosks.filter(kiosk => kiosk.id !== kioskId).map(kiosk => <option key={kiosk.id} value={kiosk.id}>{kiosk.name || 'Kiosk tanpa nama'}</option>)}
          </select>
          <button type="button" className="ic" disabled={!sourceId} onClick={copyFilters}>Copy Filter dari…</button>
        </div>
        <div className="cc"><input value={name} onChange={event => setName(event.target.value)} placeholder="Nama filter" /><button type="button" className="btn" onClick={add}>+ Tambah</button></div>
      </div>
      <div className="km-filter-grid">
        {settings.filters.map(filter => (
          <div className="km-filter-card" key={filter.id}>
            <div className="km-filter-preview" style={{ filter: filter.effect === 'sepia' ? 'sepia(1)' : filter.effect === 'icy' ? 'hue-rotate(155deg) saturate(.8)' : 'grayscale(1)' }}>
              <span>{filter.name}</span>
            </div>
            <div className="km-filter-edit">
              <input value={filter.name} aria-label="Nama filter" onChange={event => updateFilter(filter.id, { name: event.target.value })} />
              <select value={filter.effect} aria-label="Efek filter" onChange={event => updateFilter(filter.id, { effect: event.target.value })}>
                <option value="icy">Icy Water</option><option value="sepia">Sepia</option><option value="grayscale">Grayscale</option>
              </select>
              <button type="button" className="ic del" onClick={() => remove(filter.id)}>Hapus</button>
            </div>
          </div>
        ))}
        {!settings.filters.length && <div className="empty km-empty">Belum ada filter kustom.</div>}
      </div>
    </div>
  )
}

function CategorySettings({ S, settings, setSettings }) {
  const [name, setName] = useState('')
  const add = () => {
    if (!name.trim()) return
    setSettings(previous => ({ ...previous, categories: [...previous.categories, { id: uid(), name: name.trim(), frameIds: [] }] }))
    setName('')
  }
  const patch = (id, update) => setSettings(previous => ({
    ...previous, categories: previous.categories.map(category => category.id === id ? { ...category, ...update } : category)
  }))
  const remove = id => setSettings(previous => ({ ...previous, categories: previous.categories.filter(category => category.id !== id) }))
  return (
    <div className="km-section">
      <div className="km-section-heading"><div><b>Kategori Frame</b><small>Kelompokkan frame kiosk ke dalam tab bernama di layar pemilihan frame.</small></div><div className="cc"><input value={name} onChange={event => setName(event.target.value)} placeholder="Nama kategori" /><button type="button" className="btn" onClick={add}>+ Tambah</button></div></div>
      {!settings.categories.length && <div className="km-empty">Belum ada kategori</div>}
      <div className="km-category-list">
        {settings.categories.map(category => (
          <div className="km-category-row" key={category.id}>
            <input value={category.name} aria-label="Nama kategori" onChange={event => patch(category.id, { name: event.target.value })} />
            <select multiple value={category.frameIds} aria-label={`Frame dalam ${category.name}`} onChange={event => patch(category.id, { frameIds: [...event.target.selectedOptions].map(option => option.value) })}>
              {S.frames.map(frame => <option key={frame.id} value={frame.id}>{frame.title}</option>)}
            </select>
            <button type="button" className="ic del" onClick={() => remove(category.id)}>Hapus</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function KioskDetail({ kiosk, onBack }) {
  const { S, update } = useStore()
  const { health } = useHealth()
  const initialSettings = kioskSettings(kiosk, S.frames, S.pay?.price ?? 35000)
  const [draft, setDraft] = useState({ ...kiosk, settings: initialSettings })
  const [tab, setTab] = useState('display')
  const [query, setQuery] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showControl, setShowControl] = useState(false)
  const status = health.find(item => item.id === kiosk.id) || {}
  const visibleTabs = TABS.filter(([key, label]) => !query || `${label} ${TAB_SEARCH[key] || ''}`.toLowerCase().includes(query.toLowerCase()))
  const setRoot = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setDirty(true) }
  const setSection = (section, key, value) => {
    setDraft(previous => ({ ...previous, settings: { ...previous.settings, [section]: { ...previous.settings[section], [key]: value } } }))
    setDirty(true)
  }
  const setSettings = fn => {
    setDraft(previous => ({ ...previous, settings: fn(previous.settings) }))
    setDirty(true)
  }
  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      const kiosks = S.kiosks.map(item => item.id === kiosk.id ? draft : item)
      await update({ kiosks })
      setDirty(false)
      setMessage(status.online
        ? 'Pengaturan tersimpan dan perubahan akan disinkronkan ke kiosk.'
        : 'Pengaturan tersimpan. Kiosk akan menerapkannya saat terhubung dan melakukan sinkronisasi.')
    } catch (error) {
      setMessage(`Gagal menyimpan pengaturan: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }
  const setTabValue = value => setTab(value)
  const settingValue = (section, key) => draft.settings[section][key]

  return (
    <div className="km-detail">
      <button type="button" className="km-back" onClick={onBack}>‹ &nbsp;Daftar Kiosk</button>
      <div className="km-detail-title">
        <h1>{draft.name || 'Kiosk tanpa nama'}</h1>
        <button type="button" className="btn ghost" onClick={() => setShowControl(value => !value)}>Kontrol Jarak Jauh</button>
      </div>
      <div className="km-detail-nav">
        <a className="on" href="#kiosk">◉ &nbsp;Kiosk</a>
        <a href="#gallery">▧ &nbsp;Galeri</a>
        <a href="#trx">▣ &nbsp;Transaksi</a>
        <a href="#stats">⌁ &nbsp;Statistik</a>
        <a href="#voucher">♧ &nbsp;Voucher</a>
        <span>Lisensi: <code>{kiosk.license || kiosk.code || '-'}</code></span>
        <span className={'km-health ' + (status.online ? 'on' : '')}>{status.online ? 'Online' : 'Offline'}</span>
      </div>
      {showControl && <RemoteControl kiosk={kiosk} online={!!status.wsConnected} onClose={() => setShowControl(false)} />}
      <div className="km-search"><span>⌕</span><input placeholder="Cari setting…" value={query} onChange={event => {
        const nextQuery = event.target.value
        const nextTabs = TABS.filter(([key, label]) => !nextQuery || `${label} ${TAB_SEARCH[key] || ''}`.toLowerCase().includes(nextQuery.toLowerCase()))
        setQuery(nextQuery)
        if (nextQuery && nextTabs.length) setTab(nextTabs[0][0])
      }} /></div>
      <div className="km-tabbar">
        {visibleTabs.map(([key, label]) => <button key={key} type="button" className={tab === key ? 'on' : ''} onClick={() => setTabValue(key)}>{label}</button>)}
        {!visibleTabs.length && <span className="km-no-tabs">Tidak ada tab yang cocok.</span>}
      </div>
      <div className={'km-content' + (tab === 'display' ? ' km-display-content' : '')}>
        {tab === 'info' && (
          <div className="km-section km-info-grid">
            <div><small>Status kiosk</small><b className={status.online ? 'km-green' : 'km-red'}>{status.online ? 'Online' : 'Offline'}</b></div>
            <div><small>Tanggal kadaluarsa</small><b>{draft.licenseExpiry ? fd(draft.licenseExpiry) : 'Belum diatur'}</b></div>
            <div><small>Versi aplikasi</small><b>{status.appVersion || kiosk.appVersion || '-'}</b></div>
            <div><small>Lisensi</small><b>{kiosk.license || kiosk.code || '-'}</b></div>
            <div><small>Printer</small><b>{status.printerStatus || '-'}</b></div>
            <div><small>Kamera</small><b>{status.cameraConnected ? 'Terhubung' : 'Tidak terhubung'}</b></div>
            <div><small>Terakhir terlihat</small><b>{ago(status.lastSeen || kiosk.lastSeen)}</b></div>
            <div><small>Sisa kertas</small><b>{status.paperRemaining ?? '-'}</b></div>
            <button type="button" className="btn ghost" onClick={() => setShowControl(true)}>Buka kontrol kiosk</button>
          </div>
        )}
        {tab === 'display' && (
          <DisplaySettings settings={draft.settings} setSection={setSection} />
        )}
        {tab === 'general' && (
          <div className="km-section km-form-grid">
            <Field label="Nama Kiosk"><input value={draft.name} onChange={event => setRoot('name', event.target.value)} /></Field>
            <Field label="PIN"><input inputMode="numeric" value={settingValue('general', 'pin')} onChange={event => setSection('general', 'pin', event.target.value)} /></Field>
            <Field label="Cabang"><select value={draft.branch || ''} onChange={event => setRoot('branch', event.target.value)}><option value="">-</option>{S.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
            <Field label="Tanggal kadaluarsa lisensi"><input type="date" value={draft.licenseExpiry || ''} onChange={event => setRoot('licenseExpiry', event.target.value)} /></Field>
            <div className="note km-span-all">Pembayaran dilakukan di kasir dan tidak diproses oleh kiosk.</div>
          </div>
        )}
        {tab === 'frames' && <FrameSettings S={S} settings={draft.settings} setSection={setSection} />}
        {tab === 'payment' && (
          <div className="km-section km-form-grid">
            <Field label="Harga per cetak (IDR)"><input type="number" min="0" value={settingValue('payment', 'price')} onChange={event => setSection('payment', 'price', Number(event.target.value))} /></Field>
            <Field label="Jumlah cetak ganda"><select value={settingValue('payment', 'copies')} onChange={event => setSection('payment', 'copies', event.target.value)}><option>4R (x1)</option><option>4R (x2)</option><option>4R (x4)</option><option>6R (x1)</option></select></Field>
            <Toggle label="Aktifkan Extra Print" checked={settingValue('payment', 'extraPrint')} onChange={value => setSection('payment', 'extraPrint', value)} />
            {settingValue('payment', 'extraPrint') && <Field label="Maksimum jumlah Extra Print"><input type="number" min="1" step="1" value={settingValue('payment', 'extraPrintMax')} onChange={event => {
              const next = Number(event.target.value)
              setSection('payment', 'extraPrintMax', Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 5)
            }} /></Field>}
            <div className="note km-span-all">Pembayaran dilakukan di kasir; kiosk tidak menampilkan QRIS pembayaran. QR pada hasil akhir digunakan untuk mengunduh soft file.</div>
          </div>
        )}
        {tab === 'timer' && (
          <div className="km-section km-form-grid km-three-col">
            <Field label="Timer Countdown (detik)"><input type="number" min="0" value={settingValue('timer', 'countdown')} onChange={event => setSection('timer', 'countdown', Number(event.target.value))} /></Field>
            <Field label="Timer Photobooth (detik)"><input type="number" min="0" value={settingValue('timer', 'booth')} onChange={event => setSection('timer', 'booth', Number(event.target.value))} /></Field>
            <Field label="Timer QR (detik)"><input type="number" min="0" value={settingValue('timer', 'qr')} onChange={event => setSection('timer', 'qr', Number(event.target.value))} /></Field>
          </div>
        )}
        {tab === 'camera' && (
          <div className="km-section km-form-grid">
            <Field label="Driver Kamera"><select value={settingValue('camera', 'driver')} onChange={event => setSection('camera', 'driver', event.target.value)}><option value="webcam">Webcam / Capture Card</option><option value="digicam">DSLR (digiCamControl)</option><option value="gphoto2">DSLR (gphoto2)</option></select></Field>
            <Field label="Merek Kamera"><select value={settingValue('camera', 'mode')} onChange={event => setSection('camera', 'mode', event.target.value)}><option>Canon</option><option>Sony</option><option>Nikon</option></select></Field>
            <Field label="Preview Kamera"><select value={settingValue('camera', 'previewMirror') ? 'mirror' : 'normal'} onChange={event => setSection('camera', 'previewMirror', event.target.value === 'mirror')}><option value="mirror">Mirror</option><option value="normal">Normal</option></select></Field>
            <Field label="Hasil Kamera"><select value={settingValue('camera', 'resultMirror') ? 'mirror' : 'normal'} onChange={event => setSection('camera', 'resultMirror', event.target.value === 'mirror')}><option value="mirror">Mirror</option><option value="normal">Normal</option></select></Field>
            <Field label="Orientasi Kamera"><select value={settingValue('camera', 'cameraOrientation')} onChange={event => setSection('camera', 'cameraOrientation', event.target.value)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></Field>
            <Field label="Orientasi Tampilan"><select value={settingValue('camera', 'displayOrientation')} onChange={event => setSection('camera', 'displayOrientation', event.target.value)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></Field>
          </div>
        )}
        {tab === 'filters' && <FilterSettings S={S} kioskId={kiosk.id} settings={draft.settings} setSettings={setSettings} />}
        {tab === 'categories' && <CategorySettings S={S} settings={draft.settings} setSettings={setSettings} />}
        {tab === 'queue' && (
          <div className="km-section">
            <div className="km-section-heading"><div><b>Antrian</b><small>Fitur ini dilewati sesuai keputusan pemilik kiosk.</small></div></div>
            <div className="km-empty">Pengaturan antrian belum digunakan.</div>
          </div>
        )}
        {tab === 'ads' && (
          <div className="km-section">
            <div className="km-section-heading"><div><b>Iklan Idle</b><small>Fitur ini dilewati sesuai keputusan pemilik kiosk.</small></div></div>
            <div className="km-empty">Pengaturan iklan idle belum digunakan.</div>
          </div>
        )}
      </div>
      <div className="km-savebar">
        <div><b>Pengaturan</b><small>{message || (dirty ? 'Ada perubahan yang belum disimpan.' : 'Tidak ada perubahan.')}</small></div>
        <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </div>
  )
}

export default function Kiosks() {
  const { S } = useStore()
  const [selectedId, setSelectedId] = useState('')
  const selected = S.kiosks.find(kiosk => kiosk.id === selectedId)
  return selected
    ? <KioskDetail key={selected.id} kiosk={selected} onBack={() => setSelectedId('')} />
    : <KioskList onSelect={setSelectedId} />
}
