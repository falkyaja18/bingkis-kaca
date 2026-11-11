import { useEffect, useRef, useState } from 'react'
import { Eye, Info, Trash2 } from 'lucide-react'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { Modal } from '../Crud.jsx'

const readable = h => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim())
  if (!m) return '#111111'
  const n = parseInt(m[1], 16)
  return (((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000) > 150 ? '#111111' : '#ffffff'
}

const safeColorPicker = (val, fallback) => /^#[0-9a-f]{6}$/i.test(String(val || '').trim()) ? val : fallback

function ThemeColorField({ id, label, value, fallback, onChange }) {
  return (
    <div className="sf-fld">
      <label htmlFor={id}>{label}</label>
      <div className="sf-colorrow">
        <input
          type="color"
          className="sf-swatch"
          value={safeColorPicker(value, fallback)}
          onChange={e => onChange(e.target.value.toUpperCase())}
          aria-label={label}
        />
        <input
          id={id}
          className="sf-hex"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={fallback}
        />
      </div>
    </div>
  )
}

/** Soft File UI settings page matching the Photolab Logo Soft File + Tema Halaman Galeri Digital layout. */
export function SoftFile() {
  const { S, update } = useStore()
  const [logoUrl, setLogoUrl] = useState(S.soft.logo || '')
  const [pendingLogo, setPendingLogo] = useState('')
  const [fileName, setFileName] = useState('')
  const [theme, setTheme] = useState({
    accent: S.soft.accent || '#888888',
    bg: S.soft.bg || '#FFFFFF',
    ig: S.soft.ig || '',
    tt: S.soft.tt || ''
  })

  const [logoBusy, setLogoBusy] = useState(false)
  const [themeBusy, setThemeBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    setLogoUrl(S.soft.logo || '')
    setTheme({
      accent: S.soft.accent || '#888888',
      bg: S.soft.bg || '#FFFFFF',
      ig: S.soft.ig || '',
      tt: S.soft.tt || ''
    })
  }, [S.soft])

  const flash = m => { setToast(m); setTimeout(() => setToast(''), 2500) }
  const setField = (k, v) => setTheme(prev => ({ ...prev, [k]: v }))

  const handleLogoFile = file => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setErr('File harus berupa gambar (PNG/JPG/WebP/GIF).')
    if (file.size > 3 * 1024 * 1024) return setErr('Maksimal ukuran Logo Soft File adalah 3MB.')
    setErr('')
    setFileName(file.name)
    const r = new FileReader()
    r.onload = () => setPendingLogo(String(r.result || ''))
    r.readAsDataURL(file)
  }

  const saveLogo = async () => {
    setErr('')
    setLogoBusy(true)
    try {
      let nextLogo = logoUrl
      if (pendingLogo) {
        const res = await api('/assets', { method: 'POST', body: JSON.stringify({ data: pendingLogo }) })
        if (res && res.error) throw new Error(res.error)
        nextLogo = res.url || pendingLogo
      }
      await update({ soft: { ...S.soft, logo: nextLogo } })
      setLogoUrl(nextLogo)
      setPendingLogo('')
      setFileName('')
      flash('Logo Soft File berhasil disimpan')
    } catch (e) {
      setErr(e?.message || 'Gagal menyimpan Logo Soft File.')
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = () => {
    setPendingLogo('')
    setLogoUrl('')
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const saveTheme = async e => {
    e.preventDefault()
    setErr('')
    setThemeBusy(true)
    try {
      const accent = safeColorPicker(theme.accent, S.soft.accent || '#6c4cf5')
      const bg = safeColorPicker(theme.bg, S.soft.bg || '#FFFFFF')
      await update({
        soft: {
          ...S.soft,
          accent,
          bg,
          ig: theme.ig.trim(),
          tt: theme.tt.trim()
        }
      })
      flash('Tema galeri digital berhasil disimpan')
    } catch (e2) {
      setErr(e2?.message || 'Gagal menyimpan tema.')
    } finally {
      setThemeBusy(false)
    }
  }

  const shownLogo = pendingLogo || logoUrl
  const previewBg = safeColorPicker(theme.bg, '#FFFFFF')
  const previewAccent = safeColorPicker(theme.accent, '#6c4cf5')

  return (
    <>
      <section className="card sf-card">
        <h1>Logo Soft File</h1>

        <div className="trx-note sf-note" role="note">
          <div className="trx-note-hd"><Info size={16} /><span>Catatan</span></div>
          <ul>
            <li>Maksimal ukuran Logo Soft File adalah 3MB</li>
          </ul>
        </div>

        {err && <div className="fe-err">{err}</div>}

        <div className="sf-fld">
          <label className="sf-bold">Header Image QR Code</label>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={e => { handleLogoFile(e.target.files[0]); e.target.value = '' }}
          />
          <div className="sf-filebar" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}>
            <span className="btn sf-choose">Choose File</span>
            <span className="sf-filename">{fileName || (logoUrl ? 'Logo aktif tersimpan' : 'No file chosen')}</span>
          </div>

          {shownLogo && (
            <div className="sf-logoprev">
              <img src={shownLogo} alt="Header Image QR Code" />
              <button type="button" className="ic del" onClick={removeLogo} title="Hapus logo">
                <Trash2 size={15} /> Hapus
              </button>
            </div>
          )}
        </div>

        <button type="button" className="btn sf-btn" onClick={saveLogo} disabled={logoBusy}>
          {logoBusy ? 'Menyimpan…' : 'Kustomisasi Logo Soft File'}
        </button>

        <hr className="sf-div" />

        <form onSubmit={saveTheme}>
          <h2>Tema Halaman Galeri Digital</h2>
          <p className="sf-sub">Warna ini dipakai sebagai default semua kiosk yang tidak set override sendiri.</p>

          <ThemeColorField id="sf-accent" label="Warna Aksen" value={theme.accent} fallback="#888888" onChange={v => setField('accent', v)} />
          <ThemeColorField id="sf-bg" label="Warna Latar" value={theme.bg} fallback="#FFFFFF" onChange={v => setField('bg', v)} />

          <div className="sf-fld">
            <label htmlFor="sf-ig">Instagram</label>
            <input
              id="sf-ig"
              placeholder="@username"
              value={theme.ig}
              onChange={e => setField('ig', e.target.value)}
            />
            <div className="sf-help">Kosongkan jika link Instagram tidak ingin ditampilkan di galeri.</div>
          </div>

          <div className="sf-fld">
            <label htmlFor="sf-tt">TikTok</label>
            <input
              id="sf-tt"
              placeholder="@username"
              value={theme.tt}
              onChange={e => setField('tt', e.target.value)}
            />
            <div className="sf-help">Kosongkan jika link TikTok tidak ingin ditampilkan di galeri.</div>
          </div>

          <div className="cc" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button type="submit" className="btn sf-btn" disabled={themeBusy}>
              {themeBusy ? 'Menyimpan…' : 'Simpan Tema'}
            </button>
            <button type="button" className="btn ghost exp" onClick={() => setPreviewOpen(true)}>
              <Eye size={15} /> Preview Galeri
            </button>
          </div>
        </form>
      </section>

      {previewOpen && (
        <Modal title="Preview Halaman Galeri Digital" onClose={() => setPreviewOpen(false)}>
          <div className="phone" style={{ background: previewBg, color: readable(previewBg) }}>
            {shownLogo ? <img src={shownLogo} alt="Logo" style={{ maxHeight: 52, maxWidth: '100%' }} /> : <b>Logo Soft File</b>}
            <div className="pic" />
            <div className="dl" style={{ background: previewAccent, color: readable(previewAccent) }}>Unduh foto</div>
            <div style={{ fontSize: 13 }}>{S.soft.footer || 'Terima kasih sudah berfoto!'}</div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              {[theme.ig && 'Instagram ' + theme.ig, theme.tt && 'TikTok ' + theme.tt].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setPreviewOpen(false)}>Tutup</button>
          </div>
        </Modal>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

export function PayKey() {
  const { S, update } = useStore()
  const [p, setP] = useState(S.pay)
  const [msg, setMsg] = useState('')
  const set = (k, v) => setP({ ...p, [k]: v })
  const save = async () => { await update({ pay: { ...p, price: Number(p.price) || 0 } }); setMsg('Tersimpan'); setTimeout(() => setMsg(''), 2000) }
  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h1>Payment Key</h1>
      <div className="note">Pembayaran memakai QRIS. Di server, pembayaran masih simulasi sampai payment gateway disambungkan.</div>
      <div className="fld"><label>Provider</label><select value={p.provider} onChange={e => set('provider', e.target.value)}><option>QRIS</option></select></div>
      <div className="fld"><label>Merchant ID</label><input value={p.merchant} onChange={e => set('merchant', e.target.value)} /></div>
      <div className="fld"><label>API key</label><input type="password" autoComplete="off" value={p.apikey} onChange={e => set('apikey', e.target.value)} /></div>
      <div className="fld"><label>Webhook secret</label><input type="password" autoComplete="off" value={p.secret} onChange={e => set('secret', e.target.value)} /></div>
      <div className="fld"><label>Harga per sesi (Rp)</label><input type="number" min="0" value={p.price ?? 35000} onChange={e => set('price', e.target.value)} /></div>
      <div className="fld"><label>Mode</label><select value={p.mode} onChange={e => set('mode', e.target.value)}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
      <button className="btn" onClick={save}>Simpan kunci</button> <span>{msg}</span>
    </div>
  )
}
