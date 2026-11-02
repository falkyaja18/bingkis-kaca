import { useState, useEffect } from 'react'
import { LayoutDashboard, Aperture, Image, Images, ChartColumn, Banknote, Layers, Film, QrCode, Ticket, KeyRound, Building2, Moon, Sun, ChevronDown, Menu, Camera } from 'lucide-react'
import { hasToken, login, logout, getUser } from './api.js'
import { StoreProvider, useStore } from './store.jsx'
import { Kiosks, PublicGalleries, Vouchers, Frames, Branches } from './pages/Master.jsx'
import Overview from './pages/Overview.jsx'
import { Gallery, Stats, Transactions } from './pages/Reports.jsx'
import { SoftFile, PayKey } from './pages/Settings.jsx'
import fotoLogo from './assets/logo.png'

const MENU = [
  ['overview', 'Overview', LayoutDashboard, () => <Overview />], ['kiosk', 'Kiosk', Aperture, () => <Kiosks />], ['gallery', 'Gallery', Image, () => <Gallery />],
  ['public', 'Public Gallery', Images, () => <PublicGalleries />], ['stats', 'Statistics', ChartColumn, () => <Stats />], ['trx', 'Transaction', Banknote, () => <Transactions />],
  ['framephoto', 'Frame Photo', Layers, () => <Frames type="PHOTO" />], ['framegif', 'Frame GIF', Film, () => <Frames type="GIF" />],
  ['softfile', 'Soft File UI', QrCode, () => <SoftFile />], ['voucher', 'Voucher', Ticket, () => <Vouchers />], ['paykey', 'Payment Key', KeyRound, () => <PayKey />],
  ['branch', 'Branch Manager', Building2, () => <Branches />]
]

function Login({ onDone }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('')
  const submit = async e => { e.preventDefault(); try { await login(u, p); onDone() } catch (x) { setErr(x.message) } }
  return (
    <div className="ov" style={{ background: 'var(--bg)' }}>
      <form className="dlg" onSubmit={submit}>
        <h1 style={{ marginBottom: 14 }}>Masuk</h1>
        <div className="fld"><label>Username</label><input value={u} onChange={e => setU(e.target.value)} required autoComplete="username" /></div>
        <div className="fld"><label>Password</label><input type="password" value={p} onChange={e => setP(e.target.value)} required autoComplete="current-password" /></div>
        <p className="err">{err}</p>
        <button className="btn">Masuk</button>
      </form>
    </div>
  )
}

function Shell({ page, onLogout }) {
  const { reload } = useStore()
  const [open, setOpen] = useState(false), [menu, setMenu] = useState(false)
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark')
  useEffect(() => { reload().catch(() => {}); setOpen(false) }, [page, reload]) // data selalu segar saat pindah menu
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  const cur = MENU.find(m => m[0] === page) || MENU[0]
  return (
    <>
      <header>
       <div style={{ display: 'flex', alignItems: 'center' }}>
          <button id="burger" aria-label="Menu" onClick={() => setOpen(!open)}><Menu /></button>
          <div className="brand">
  <i><img src={fotoLogo} alt="Logo" style={{ width: 120, height: 90, objectFit: 'contain' }} /></i>
</div>
        </div>
        <div className="hr">
          <button className="circ" aria-label="Ganti tema" onClick={() => setDark(!dark)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <div className="user">
            <button className="u" onClick={() => setMenu(!menu)} aria-expanded={menu}>Hai, {getUser()} <ChevronDown size={16} /></button>
            {menu && <div className="menu"><button onClick={onLogout}>Keluar</button></div>}
          </div>
        </div>
      </header>
      <div className="shell">
        <nav className={open ? 'open' : ''}>
          {MENU.map(([k, label, Icon]) => <a key={k} href={'#' + k} className={k === cur[0] ? 'on' : ''}><Icon size={20} />{label}</a>)}
          <div className="foot">© 2026 Photobooth</div>
        </nav>
        <main>{cur[3]()}</main>
      </div>
    </>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(hasToken())
  const [page, setPage] = useState(location.hash.slice(1) || 'overview')
  useEffect(() => {
    const h = () => setPage(location.hash.slice(1) || 'overview'), u = () => setAuthed(false)
    addEventListener('hashchange', h); addEventListener('unauth', u)
    return () => { removeEventListener('hashchange', h); removeEventListener('unauth', u) }
  }, [])
  if (!authed) return <Login onDone={() => setAuthed(true)} />
  return <StoreProvider><Shell page={page} onLogout={() => { logout(); setAuthed(false) }} /></StoreProvider>
}
