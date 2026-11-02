import { useState, useEffect, useRef, useCallback } from 'react'
import { KCtx } from './ctx.js'
import { N } from './lib/native.js'
import { loadCfg, saveCfg, loadSync } from './lib/cfg.js'
import { doSync } from './lib/sync.js'
import Home from './screens/Home.jsx'
import { AppSetting, PrinterSetting } from './screens/Settings.jsx'
import CameraTest from './screens/CameraTest.jsx'
import Sessions from './screens/Sessions.jsx'
import Customer from './customer/Customer.jsx'

export default function App() {
  const [cfg, setCfg] = useState(loadCfg)
  const [sync, setSync] = useState(loadSync)
  const [view, go] = useState('home')
  const [msg, setMsg] = useState(''), [panel, setPanel] = useState('closed'), [ck, setCk] = useState(0), [pin, setPin] = useState('')
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const L = (en, id) => (cfg.lang === 'EN' ? en : id)
  const toast = useCallback(m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }, [])
  const patchCfg = useCallback(p => { const n = { ...cfgRef.current, ...p }; cfgRef.current = n; saveCfg(n); setCfg(n); N && N.config.set(n); return n }, [])

  const reload = useCallback(async (manual, c) => {
    const k = c || cfgRef.current
    if (!k.token) { toast(k.lang === 'EN' ? 'Activate the kiosk first (App Setting)' : 'Aktivasi kiosk dulu (App Setting)'); return }
    try {
      const j = await doSync(k); setSync(j)
      if (j.kiosk_info.id !== k.kioskId) patchCfg({ kioskId: j.kiosk_info.id })
      if (manual) toast(k.lang === 'EN' ? 'Sync complete' : 'Sinkronisasi selesai')
    } catch (e) { toast((k.lang === 'EN' ? 'Sync failed: ' : 'Sync gagal: ') + (e.error || e.message || '')) }
  }, [toast, patchCfg])

  useEffect(() => {
    if (!N) return
    N.config.set(cfgRef.current).then(() => cfgRef.current.token && reload(false))
    // laporan kamera webcam ke Main Process (untuk heartbeat)
    const cam = async () => { try { N.report({ cameraConnected: (await navigator.mediaDevices.enumerateDevices()).some(d => d.kind === 'videoinput') }) } catch { /* abaikan */ } }
    cam(); const t = setInterval(cam, 15000)
    const off1 = N.on('rdm:reload', () => reload(false))                                    // perintah RDM dari dashboard
    const off2 = N.on('rdm:config', p => setSync(s => s && { ...s, softfile_ui: p.softfile_ui || s.softfile_ui, price: p.price ?? s.price }))
    return () => { clearInterval(t); off1(); off2() }
  }, [reload])

  if (!N) return <div className="card"><h3>Photobooth Kiosk</h3><p>Aplikasi ini harus dijalankan di dalam Electron (akses kamera, printer, ffmpeg, dan failsave ada di Main Process).</p><p>Jalankan <code>npm run dev</code> atau <code>npm start</code> di folder kiosk.</p></div>

  const screens = {
    home: <Home />, app: <AppSetting />, printer: <PrinterSetting />, camera: <CameraTest />,
    reprint: <Sessions mode="reprint" />, local: <Sessions mode="local" />, failure: <Sessions mode="failure" />
  }
  const openPanel = () => { setPin(''); setPanel(cfg.pin ? 'pin' : 'open'); go('home') }
  const closePanel = () => { setPanel('closed'); go('home'); setCk(k => k + 1) }   // sesi pelanggan dimuat ulang (kamera berhenti)
  return (
    <KCtx.Provider value={{ cfg, patchCfg, L, sync, reload, go, toast, closePanel }}>
      {panel === 'closed' && <Customer key={ck} />}
      <button className="optrig" aria-label="Admin" title="Admin" onClick={openPanel}>⚙</button>
      {panel === 'pin' && (
        <div className="ovl"><form className="card" style={{ width: 300 }} onSubmit={e => { e.preventDefault(); if (pin === cfg.pin) setPanel('open'); else { toast('PIN salah'); setPin('') } }}>
          <h3>PIN operator</h3>
          <input type="password" inputMode="numeric" autoFocus value={pin} onChange={e => setPin(e.target.value)} aria-label="PIN" />
          <button className="b">OK</button><button type="button" className="b alt" onClick={closePanel}>{L('Back', 'Kembali')}</button>
        </form></div>
      )}
      {panel === 'open' && <div className="ovl"><div className="card">{screens[view]}</div></div>}
      {msg && <div className="toast">{msg}</div>}
    </KCtx.Provider>
  )
}
