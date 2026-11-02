import { useEffect, useRef, useState } from 'react'
import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import { Back } from './Home.jsx'

export const previewStyle = cfg => ({ transform: [cfg.mirrorPrev ? 'scaleX(-1)' : '', cfg.rot180 ? 'rotate(180deg)' : ''].join(' ').trim() || 'none', aspectRatio: cfg.orient === 'portrait' ? '3 / 4' : '4 / 3', objectFit: 'cover' })

export default function CameraTest() {
  const { cfg, L, toast } = useK()
  const vid = useRef(null), stream = useRef(null)
  const [devs, setDevs] = useState([]), [res, setRes] = useState(null), [busy, setBusy] = useState(false)
  const open = async id => {
    stream.current && stream.current.getTracks().forEach(t => t.stop())
    stream.current = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true, audio: false })
    vid.current.srcObject = stream.current
  }
  useEffect(() => {
    open().then(async () => setDevs((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')))
      .catch(e => cfg.camDriver === 'webcam' && toast(L('Camera error: ', 'Kamera error: ') + e.message))
    return () => stream.current && stream.current.getTracks().forEach(t => t.stop())
  }, [])
  const test = async () => { setBusy(true); try { setRes(await N.camera.test()) } catch (e) { toast(String(e.message || e)) } setBusy(false) }
  return (
    <>
      <h3>Camera Test</h3>
      <video ref={vid} autoPlay playsInline muted style={previewStyle(cfg)} />
      <select onChange={e => open(e.target.value)} aria-label="Camera">{devs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}</select>
      {cfg.camDriver !== 'webcam' && <button className="b" disabled={busy} onClick={test}>{busy ? '…' : L(`Test ${cfg.camBrand} capture`, `Tes jepret ${cfg.camBrand}`)}</button>}
      {res && <div style={{ fontSize: 13 }}>{res.file && <img src={res.file + '?t=' + Date.now()} alt="" style={{ width: '100%', borderRadius: 8 }} />}<p>Driver: {res.driver} · {L('latency', 'latensi')}: {res.latencyMs ?? '-'} ms</p></div>}
      <Back />
    </>
  )
}
