import { useEffect, useRef, useState } from 'react'
import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import { previewStyle } from '../screens/CameraTest.jsx'
import Strip from './Strip.jsx'

const sleep = ms => new Promise(r => setTimeout(r, ms))
// gambar video ke canvas dengan opsi Putar 180 / Hasil mirror
function drawT(x, v, w, h, cfg) {
  x.save()
  if (cfg.rot180) { x.translate(w, h); x.rotate(Math.PI) }
  if (cfg.mirrorRes) { x.translate(w, 0); x.scale(-1, 1) }
  x.drawImage(v, 0, 0, w, h); x.restore()
}

// Alur: SENTUH UNTUK MEMULAI -> PERSIAPLAH -> 3-2-1 -> jepret -> RETAKE / NEXT PHOTO (ulang untuk tiap foto)
export default function Capture({ frame, frameUrl, code, startText, onDone, onCancel }) {
  const { cfg, sync, L, toast } = useK()
  const sc = frame.slots_config, n = sc.total_captures, dslr = cfg.camDriver !== 'webcam'
  const timer = sync?.kiosk_settings?.timer || {}
  const vid = useRef(null), stream = useRef(null), ring = useRef([]), ringCv = useRef(null)
  const dead = useRef(false), wait = useRef(null), shotNo = useRef(0), boothTimer = useRef(null)
  const [phase, setPhase] = useState('ready'), [cd, setCd] = useState(3), [idx, setIdx] = useState(0), [photos, setPhotos] = useState([]), [review, setReview] = useState('')
  useEffect(() => {
    dead.current = false
    ;(async () => {
      try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); if (!dead.current && vid.current) vid.current.srcObject = stream.current }
      catch (e) { if (!dslr) { toast(L('Camera error: ', 'Kamera error: ') + e.message); onCancel() } }   // DSLR: preview webcam opsional
    })()
    // buffer 2,5 detik terakhir (10 fps) untuk Live Photo
    const t = setInterval(() => {
      const v = vid.current; if (!v || !v.videoWidth) return
      const c = ringCv.current || (ringCv.current = document.createElement('canvas')); c.width = 480; c.height = Math.round(480 * v.videoHeight / v.videoWidth)
      drawT(c.getContext('2d'), v, c.width, c.height, cfg); ring.current.push(c.toDataURL('image/jpeg', 0.55)); if (ring.current.length > 25) ring.current.shift()
    }, 100)
    return () => { dead.current = true; clearInterval(t); clearTimeout(boothTimer.current); stream.current && stream.current.getTracks().forEach(x => x.stop()); wait.current && wait.current('cancel') }
  }, [])

  const start = async () => {
    const boothSeconds = Number(timer.booth)
    if (boothSeconds > 0) boothTimer.current = setTimeout(() => {
      if (!dead.current) { toast(L('Photobooth session timed out', 'Waktu sesi photobooth habis')); onCancel() }
    }, boothSeconds * 1000)
    const finals = [], urls = [], extras = [], live = []
    const countdown = Math.max(0, Number(timer.countdown ?? 3))
    for (let i = 0; i < n; i++) {
      for (;;) {
        setIdx(i); setPhase('prep'); await sleep(1500)
        for (let k = countdown; k > 0; k--) { if (dead.current) return; setCd(k); setPhase('count'); await sleep(1000) }
        if (dead.current) return
        setPhase('shot')
        const snap = ring.current.slice()
        let data, url
        try {
          if (dslr) { const r = await N.camera.capture(code, ++shotNo.current); data = { path: r.path }; url = r.url }
          else { const v = vid.current, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; drawT(c.getContext('2d'), v, c.width, c.height, cfg); url = c.toDataURL('image/jpeg', 0.92); data = { dataUrl: url } }
        } catch (e) { toast(L('Camera error: ', 'Kamera error: ') + (e.message || e)); return onCancel() }
        setReview(url); setPhase('review')
        const a = await new Promise(r => { wait.current = r })
        if (dead.current || a === 'cancel') return
        if (a === 'retake') { extras.push({ data, url }); continue }   // retake tetap disimpan sebagai foto original
        finals[i] = data; urls[i] = url; live.push(...snap); setPhotos([...urls]); break
      }
    }
    clearTimeout(boothTimer.current)
    if (!dead.current) onDone({ finals, urls, extras, live })
  }

  return (
    <div className="camwrap">
      <div className="camleft">
        <div className="camframe" style={{ aspectRatio: cfg.orient === 'portrait' ? '3 / 4' : '4 / 3' }}>
          <video ref={vid} autoPlay playsInline muted style={previewStyle(cfg)} />
          {phase === 'review' && <img className="rev" src={review} alt="" />}
          {phase === 'ready' && <button className="ovy btn" onClick={start}>{startText}</button>}
          {phase === 'prep' && <div className="ovy">{L('GET READY', 'PERSIAPLAH')}</div>}
          {phase === 'count' && <div className="ovy huge" aria-live="assertive">{cd}</div>}
          {phase === 'shot' && <div className="flash" />}
        </div>
        {phase === 'review' && (
          <div className="revbtns">
            <button className="btnw" onClick={() => wait.current && wait.current('retake')}>Retake photo ↻</button>
            <button className="btnw pri" onClick={() => wait.current && wait.current('next')}>
              {idx + 1 < n ? 'Next photo →' : 'Pilih gaya →'}
            </button>
          </div>
        )}
      </div>
      <div className="camright"><Strip frame={frame} frameUrl={frameUrl} photos={photos} active={idx} uid="cap" /></div>
      <button className="cancel" onClick={onCancel}>✕ {L('CANCEL', 'BATAL')}</button>
    </div>
  )
}
