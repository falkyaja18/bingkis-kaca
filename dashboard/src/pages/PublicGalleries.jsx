import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store.jsx'
import { api } from '../api.js'
import { Badge } from '../Crud.jsx'
import Pager from '../Pager.jsx'
import { addDays, fd, iso, uid } from '../utils.js'

const PER_PAGE = 10
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MON_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
const TIMEZONES = [
  { offset: '+07:00', label: 'GMT+7', desc: 'GMT+7 - Jakarta, Bangkok, Phnom Penh' },
  { offset: '+08:00', label: 'GMT+8', desc: 'GMT+8 - Makassar, Bali, Singapura' },
  { offset: '+09:00', label: 'GMT+9', desc: 'GMT+9 - Jayapura, Tokyo, Seoul' }
]

const splitDateTime = (val, fallbackDate, fallbackTime) => {
  const s = String(val || '')
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(s)
  return { date: m ? m[1] : fallbackDate, time: (m && m[2]) || fallbackTime }
}

const detectTzOffset = s => {
  const m = /([+-]\d{2}:\d{2})$/.exec(String(s || ''))
  return m && TIMEZONES.some(t => t.offset === m[1]) ? m[1] : '+07:00'
}

const localGmtLabel = () => {
  const mins = -new Date().getTimezoneOffset()
  const sign = mins >= 0 ? '+' : '-'
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

const formatLongDate = dateStr => {
  if (!dateStr) return { day: '-', text: '-' }
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d)) return { day: '-', text: dateStr }
  return {
    day: DAYS_ID[d.getDay()],
    text: `${String(d.getDate()).padStart(2, '0')} ${MON_ID[d.getMonth()]} ${d.getFullYear()}`
  }
}

function AssetUploader({ label, accept, maxMb, value, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = file => {
    if (!file) return
    if (file.size > maxMb * 1024 * 1024) return setErr(`Maksimal ${maxMb}MB`)
    setBusy(true); setErr('')
    const r = new FileReader()
    r.onload = async () => {
      try {
        const res = await api('/assets', { method: 'POST', body: JSON.stringify({ data: r.result }) })
        if (res && res.error) throw new Error(res.error)
        onChange(res.url)
      } catch (e) {
        setErr(e?.message || 'Gagal mengunggah')
      } finally {
        setBusy(false)
      }
    }
    r.readAsDataURL(file)
  }
  return (
    <div className="fld">
      <label>{label}</label>
      {value && (
        <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          {accept.startsWith('video') ? <video src={value} muted height="56" /> : <img src={value} height="56" alt="" style={{ borderRadius: 6 }} />}
          <button type="button" className="ic del" onClick={() => onChange('')}>Hapus</button>
        </div>
      )}
      <input type="file" accept={accept} onChange={e => { pick(e.target.files[0]); e.target.value = '' }} />
      <small style={{ color: 'var(--mute)' }}>{busy ? 'Mengunggah…' : `Maks ${maxMb}MB`} {err && <span className="err">{err}</span>}</small>
    </div>
  )
}

/** Full-page Create/Edit Public Gallery form matching the Photolab Buat Galeri Publik UI. */
function GalleryForm({ initial, isNew, kiosks, onCancel, onSave }) {
  const today = iso(new Date())
  const monthLater = iso(addDays(new Date(), 29))
  const defaultUntil = iso(addDays(new Date(), 41))

  const startInit = splitDateTime(initial.start, today, '00:00')
  const endInit = splitDateTime(initial.end, monthLater, '23:59')
  const untilInit = splitDateTime(initial.until, defaultUntil, '23:59')
  const initKiosks = Array.isArray(initial.kiosks) && initial.kiosks.length
    ? initial.kiosks
    : (initial.kiosk ? [initial.kiosk] : [])

  const [name, setName] = useState(initial.name || '')
  const [selectedKiosks, setSelectedKiosks] = useState(() => new Set(initKiosks))
  const [startDate, setStartDate] = useState(startInit.date)
  const [startTime, setStartTime] = useState(startInit.time)
  const [endDate, setEndDate] = useState(endInit.date)
  const [endTime, setEndTime] = useState(endInit.time)
  const [untilDate, setUntilDate] = useState(untilInit.date)
  const [tzOffset, setTzOffset] = useState(initial.tz || detectTzOffset(initial.start))
  const [brandOpen, setBrandOpen] = useState(false)

  const [bg, setBg] = useState(initial.bg || '')
  const [idle, setIdle] = useState(initial.idle || '')
  const [logo, setLogo] = useState(initial.logo || '')
  const [accent, setAccent] = useState(initial.accent || '#6c4cf5')
  const [startText, setStartText] = useState(initial.startText || '')
  const [footerText, setFooterText] = useState(initial.footerText || '')
  const [active, setActive] = useState(initial.active !== false)

  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const tzMeta = TIMEZONES.find(t => t.offset === tzOffset) || TIMEZONES[0]
  const startFmt = formatLongDate(startDate)
  const endFmt = formatLongDate(endDate)
  const untilFmt = formatLongDate(untilDate)

  const toggleKiosk = id => setSelectedKiosks(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async e => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return setErr('Judul galeri wajib diisi.')
    if (!selectedKiosks.size) return setErr('Pilih minimal 1 kiosk.')
    const startIso = `${startDate}T${startTime || '00:00'}${tzOffset}`
    const endIso = `${endDate}T${endTime || '23:59'}${tzOffset}`
    const untilIso = `${untilDate}T23:59${tzOffset}`
    if (new Date(endIso) < new Date(startIso)) return setErr('Tanggal & jam Sampai harus setelah Mulai Dari.')

    setErr('')
    setSaving(true)
    try {
      const kioskIds = [...selectedKiosks]
      const slug = initial.slug || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid()
      await onSave({
        ...initial,
        name: cleanName,
        slug,
        kiosk: kioskIds[0] || '',
        kiosks: kioskIds,
        start: startIso,
        end: endIso,
        until: untilIso,
        tz: tzOffset,
        active,
        bg,
        idle,
        logo,
        accent,
        startText,
        footerText
      })
    } catch (e2) {
      setErr(e2?.message || 'Gagal menyimpan galeri publik.')
      setSaving(false)
    }
  }

  return (
    <section className="card pgf-card">
      <h1>{isNew ? 'Buat Galeri Publik' : 'Ubah Galeri Publik'}</h1>
      {err && <div className="fe-err">{err}</div>}

      <form onSubmit={submit}>
        <div className="pgf-fld">
          <label htmlFor="pg-title">Judul</label>
          <input
            id="pg-title"
            placeholder="WEDDING A DAN B"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>

        <div className="pgf-fld">
          <label>Kiosk</label>
          <div className="pgf-kioskbox">
            {kiosks.map(k => (
              <label key={k.id} className="pgf-kopt">
                <input
                  type="checkbox"
                  checked={selectedKiosks.has(k.id)}
                  onChange={() => toggleKiosk(k.id)}
                />
                <span>{k.name}</span>
              </label>
            ))}
            {!kiosks.length && <span style={{ color: 'var(--mute)', fontSize: 13 }}>Belum ada kiosk.</span>}
          </div>
        </div>

        <div className="pgf-dtgrid">
          <div className="pgf-dtcol">
            <label>Mulai Dari</label>
            <div className="pgf-dtpair">
              <input type="date" aria-label="Tanggal Mulai Dari" value={startDate} onChange={e => e.target.value && setStartDate(e.target.value)} required />
              <input type="time" aria-label="Jam Mulai Dari" value={startTime} onChange={e => setStartTime(e.target.value)} required />
            </div>
          </div>

          <div className="pgf-dtcol">
            <label>Sampai</label>
            <div className="pgf-dtpair">
              <input type="date" aria-label="Tanggal Sampai" value={endDate} onChange={e => e.target.value && setEndDate(e.target.value)} required />
              <input type="time" aria-label="Jam Sampai" value={endTime} onChange={e => setEndTime(e.target.value)} required />
            </div>
          </div>

          <div className="pgf-dtcol">
            <label>Link Aktif Sampai</label>
            <input type="date" aria-label="Link Aktif Sampai" value={untilDate} onChange={e => e.target.value && setUntilDate(e.target.value)} required />
          </div>
        </div>

        <div className="pgf-fld" style={{ marginTop: 14 }}>
          <label htmlFor="pg-tz">Timezone jam di bawah</label>
          <select id="pg-tz" value={tzOffset} onChange={e => setTzOffset(e.target.value)}>
            {TIMEZONES.map(t => <option key={t.offset} value={t.offset}>{t.desc}</option>)}
          </select>
          <div className="pgf-help">Pilih sesuai lokasi booth, bukan lokasi perangkat ini. Perangkat saat ini {localGmtLabel()}.</div>
        </div>

        <div className="pgf-preview">
          <div className="pgf-prev-lbl">PREVIEW</div>
          <div className="pgf-prev-sub">Foto yang diambil di rentang ini akan muncul di galeri publik.</div>

          <div className="pgf-prev-grid">
            <div>
              <div className="pgf-prev-cap">MULAI DARI</div>
              <div className="pgf-prev-day">{startFmt.day}</div>
              <div className="pgf-prev-date">{startFmt.text}</div>
              <div className="pgf-prev-time"><b>{startTime || '00:00'}</b> <span>{tzMeta.label}</span></div>
            </div>
            <div>
              <div className="pgf-prev-cap">SAMPAI</div>
              <div className="pgf-prev-day">{endFmt.day}</div>
              <div className="pgf-prev-date">{endFmt.text}</div>
              <div className="pgf-prev-time"><b>{endTime || '23:59'}</b> <span>{tzMeta.label}</span></div>
            </div>
          </div>

          <div className="pgf-prev-sum">
            Galeri mencakup foto yang diambil dari {startFmt.text} {startTime || '00:00'} sampai {endFmt.text} {endTime || '23:59'}.
          </div>
          <div className="pgf-prev-until">Link publik tetap bisa dibuka sampai {untilFmt.text}.</div>
        </div>

        <div className="pgf-acc">
          <button type="button" className="pgf-acc-btn" onClick={() => setBrandOpen(o => !o)} aria-expanded={brandOpen}>
            <span>Branding kustom (opsional)</span>
            {brandOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>

          {brandOpen && (
            <div className="pgf-acc-body">
              <div className="pgf-brandgrid">
                <AssetUploader label="Tema kiosk: gambar background" accept="image/*" maxMb={8} value={bg} onChange={setBg} />
                <AssetUploader label="Tema kiosk: video layar tunggu (MP4/WebM)" accept="video/mp4,video/webm" maxMb={35} value={idle} onChange={setIdle} />
                <AssetUploader label="Tema kiosk: logo (kiri atas)" accept="image/*" maxMb={8} value={logo} onChange={setLogo} />
                <div className="fld">
                  <label>Tema kiosk: warna aksen</label>
                  <div className="cc">
                    <input type="color" value={accent} onChange={e => setAccent(e.target.value)} />
                    <input value={accent} onChange={e => setAccent(e.target.value)} style={{ maxWidth: 130 }} />
                  </div>
                </div>
                <div className="fld">
                  <label>Teks mulai (mis. SENTUH UNTUK MEMULAI!)</label>
                  <input value={startText} onChange={e => setStartText(e.target.value)} />
                </div>
                <div className="fld">
                  <label>Teks bawah (mis. IN COLLABORATION WITH ...)</label>
                  <input value={footerText} onChange={e => setFooterText(e.target.value)} />
                </div>
              </div>
              <label className="fe-active" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                <span>Galeri Aktif</span>
              </label>
            </div>
          )}
        </div>

        <div className="pgf-actions">
          <button type="button" className="pgf-cancel" onClick={onCancel} disabled={saving}>Batal</button>
          <button type="submit" className="btn pgf-submit" disabled={saving}>
            {saving ? 'Menyimpan…' : (isNew ? 'Buat' : 'Simpan')}
          </button>
        </div>
      </form>
    </section>
  )
}

/** Public Gallery list + full-page Buat/Ubah Galeri Publik form. */
export default function PublicGalleries() {
  const { S, update } = useStore()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  const kioskMap = useMemo(() => Object.fromEntries(S.kiosks.map(k => [k.id, k.name])), [S.kiosks])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return S.galleries
    return S.galleries.filter(g => `${g.name} ${g.slug}`.toLowerCase().includes(needle))
  }, [S.galleries, q])

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pg = Math.min(page, pages)
  const shown = filtered.slice((pg - 1) * PER_PAGE, pg * PER_PAGE)

  const copy = slug => {
    const u = `${location.origin}/e/${slug}`
    try { navigator.clipboard.writeText(u) } catch { /* abaikan */ }
    flash('Tersalin: ' + u)
  }

  const openNew = () => setEditing({
    isNew: true,
    rec: {
      id: uid(), name: '', slug: '', kiosk: '', kiosks: [],
      start: '', end: '', until: '', tz: '+07:00', active: true,
      bg: '', idle: '', logo: '', accent: '#6c4cf5', startText: '', footerText: ''
    }
  })

  const saveGallery = async rec => {
    const next = editing.isNew
      ? [rec, ...S.galleries]
      : S.galleries.map(g => g.id === rec.id ? rec : g)
    await update({ galleries: next })
    setEditing(null)
    flash(editing.isNew ? 'Galeri publik dibuat' : 'Galeri publik disimpan')
  }

  const removeGallery = async g => {
    if (!confirm(`Hapus galeri "${g.name}"?`)) return
    await update({ galleries: S.galleries.filter(x => x.id !== g.id) })
    flash('Galeri publik dihapus')
  }

  if (editing) {
    return (
      <GalleryForm
        initial={editing.rec}
        isNew={editing.isNew}
        kiosks={S.kiosks}
        onCancel={() => setEditing(null)}
        onSave={saveGallery}
      />
    )
  }

  const kioskNames = g => {
    const ids = Array.isArray(g.kiosks) && g.kiosks.length ? g.kiosks : (g.kiosk ? [g.kiosk] : [])
    return ids.map(id => kioskMap[id] || '-').join(', ') || '-'
  }

  return (
    <>
      <section className="card trx-card">
        <div className="trx-hd">
          <h3>Galeri Publik</h3>
          <div className="cc">
            <input
              className="trx-search"
              placeholder="Cari galeri…"
              aria-label="Cari galeri"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
            />
            <button type="button" className="btn exp" onClick={openNew}>
              <Plus size={16} /> Tambah Galeri Publik
            </button>
          </div>
        </div>

        <div className="note">
          Foto pelanggan dihapus otomatis setelah tanggal <b>Link Aktif Sampai</b>. Tema kiosk pada Branding kustom dipakai kiosk saat event ini aktif (diunduh saat Reload Kiosk).
        </div>

        <div className="tw trx-tw">
          <table className="fr-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Kiosk</th>
                <th>Rentang Tanggal</th>
                <th>Aktif Sampai</th>
                <th>Status</th>
                <th>URL Publik</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id}>
                  <td><b>{r.name}</b></td>
                  <td><span className="tag">{kioskNames(r)}</span></td>
                  <td>{fd(r.start)} – {fd(r.end)}</td>
                  <td>{fd(r.until)}</td>
                  <td><Badge on={r.active} /></td>
                  <td>
                    <button type="button" className="ic" onClick={() => copy(r.slug)} title="Salin URL publik">
                      <Copy size={14} /> Salin
                    </button>
                  </td>
                  <td>
                    <div className="fr-actions">
                      <button type="button" className="ic" title="Ubah galeri" onClick={() => setEditing({ isNew: false, rec: r })}><Pencil size={16} /></button>
                      <button type="button" className="ic del" title="Hapus galeri" onClick={() => removeGallery(r)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan="7" className="trx-empty">Tidak ada data yang tersedia</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager total={filtered.length} page={pg} perPage={PER_PAGE} onChange={setPage} />
      </section>
      {msg && <div className="toast">{msg}</div>}
    </>
  )
}

