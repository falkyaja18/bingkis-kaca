import { useEffect, useState } from 'react'
import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import { Back } from './Home.jsx'

const Chk = ({ label, v, set }) => <label className="chk"><input type="checkbox" checked={v} onChange={e => set(e.target.checked)} /> {label}</label>

export function AppSetting() {
  const { cfg, patchCfg, L, go, reload, toast } = useK()
  const [f, setF] = useState({ server: cfg.server, mode: cfg.mode, camDriver: cfg.camDriver, camBrand: cfg.camBrand, orient: cfg.orient, mirrorPrev: cfg.mirrorPrev, mirrorRes: cfg.mirrorRes, rot180: cfg.rot180, digicamPath: cfg.digicamPath, pin: cfg.pin })
  const [code, setCode] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    const s = f.server.trim().replace(/\/$/, ''), patch = { ...f, server: s }
    if (code.trim()) {
      try {
        const r = await fetch(s + '/api/v1/kiosk/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) })
        const j = await r.json(); if (!r.ok) throw j
        patch.token = j.token
      } catch (e) { return toast(e.error || L('Activation failed', 'Aktivasi gagal')) }
    }
    const n = patchCfg(patch)
    await reload(false, n); go('home')
  }
  return (
    <>
      <h3>App Setting</h3>
      <label>Server URL</label><input value={f.server} onChange={e => set('server', e.target.value)} placeholder="http://192.168.1.10:3000" />
      <label>{L('Activation code (leave empty if already active)', 'Kode aktivasi (kosongkan jika sudah aktif)')}</label>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="KIOSK-0001" />
      <label>Mode</label>
      <select value={f.mode} onChange={e => set('mode', e.target.value)}><option value="normal">Normal Mode</option><option value="event">Event Mode (offline)</option></select>
      <label>{L('Camera driver', 'Driver kamera')}</label>
      <select value={f.camDriver} onChange={e => set('camDriver', e.target.value)}>
        <option value="webcam">Webcam / HDMI capture card (browser)</option><option value="digicam">DSLR via digiCamControl (Windows)</option><option value="gphoto2">DSLR via gphoto2 (Mac/Linux)</option>
      </select>
      {f.camDriver === 'digicam' && <><label>CameraControlCmd.exe</label><input value={f.digicamPath} onChange={e => set('digicamPath', e.target.value)} placeholder="C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe" /></>}
      <label>{L('Camera brand', 'Merek kamera')}</label>
      <select value={f.camBrand} onChange={e => set('camBrand', e.target.value)}><option>Canon</option><option>Sony</option><option>Nikon</option></select>
      <label>{L('Orientation', 'Orientasi')}</label>
      <select value={f.orient} onChange={e => set('orient', e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
      <label>{L('Operator PIN (empty = no PIN)', 'PIN operator (kosong = tanpa PIN)')}</label>
      <input type="password" inputMode="numeric" value={f.pin} onChange={e => set('pin', e.target.value)} />
      <Chk label={L('Mirror preview', 'Preview mirror')} v={f.mirrorPrev} set={v => set('mirrorPrev', v)} />
      <Chk label={L('Mirror result', 'Hasil mirror')} v={f.mirrorRes} set={v => set('mirrorRes', v)} />
      <Chk label={L('Rotate 180°', 'Putar 180°')} v={f.rot180} set={v => set('rot180', v)} />
      <button className="b" onClick={save}>{L('Save', 'Simpan')}</button>
      <Back />
    </>
  )
}

export function PrinterSetting() {
  const { cfg, patchCfg, L, go, toast } = useK()
  const [f, setF] = useState({ copies: cfg.copies, paper: cfg.paper, printer: cfg.printer, paperCap: cfg.paperCap })
  const [st, setSt] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  useEffect(() => { N.status().then(setSt) }, [])
  return (
    <>
      <h3>Printer Setting</h3>
      <label>{L('Printer', 'Printer')}</label>
      <select value={f.printer} onChange={e => set('printer', e.target.value)}>
        <option value="">{L('Default printer', 'Printer default')}</option>{(st ? st.printers : []).map(p => <option key={p}>{p}</option>)}
      </select>
      <label>{L('Copies per session', 'Jumlah cetak per sesi')}</label>
      <input type="number" min="1" max="10" value={f.copies} onChange={e => set('copies', e.target.value)} />
      <label>{L('Paper', 'Kertas')}</label>
      <select value={f.paper} onChange={e => set('paper', e.target.value)}><option>4x6</option><option>6x8</option><option>5x7</option></select>
      <label>{L('Paper capacity', 'Kapasitas kertas')}</label>
      <input type="number" min="1" value={f.paperCap} onChange={e => set('paperCap', e.target.value)} />
      {st && <p style={{ fontSize: 13 }}>{L('Paper left', 'Sisa kertas')}: <b>{st.paperRemaining}</b> / {st.paperCap} · {L('Status', 'Status')}: <b>{st.printerStatus}</b></p>}
      <button className="b alt" onClick={async () => { await N.printer.setPaper(Number(f.paperCap) || 700); setSt(await N.status()); toast(L('Paper counter reset', 'Penghitung kertas direset')) }}>{L('Paper refilled (reset counter)', 'Kertas diisi ulang (reset hitungan)')}</button>
      <button className="b" onClick={() => { patchCfg({ copies: Math.max(1, Number(f.copies) || 1), paper: f.paper, printer: f.printer, paperCap: Number(f.paperCap) || 700 }); toast('OK'); go('home') }}>{L('Save', 'Simpan')}</button>
      <Back />
    </>
  )
}
