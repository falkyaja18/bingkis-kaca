import { useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import { kapi } from '../lib/api.js'
import Strip from './Strip.jsx'
import Capture from './Capture.jsx'
import Select from './Select.jsx'

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID')

// Alur pelanggan: [layar tunggu] -> PILIH frame -> (bayar/voucher) -> kamera -> tinjau & PRINT -> QR (MULAI LAGI / EXTRA PRINT)
export default function Customer() {
  const { cfg, sync, L, toast } = useK()
  const et = (sync && sync.event_theme) || {}, tl = (sync && sync.theme_local) || {}, fl = (sync && sync.frame_local) || {}
  const frames = sync ? sync.frames.filter(f => f.type === 'PHOTO') : []
  const gal = sync && sync.kiosk_info.active_public_gallery
  const home = tl.idle ? 'idle' : 'pick'
  const [step, setStep] = useState(home), [fi, setFi] = useState(0), [frame, setFrame] = useState(null), [trx, setTrx] = useState(null)
  const [voucher, setVoucher] = useState(''), [shots, setShots] = useState(null), [done, setDone] = useState(null), [vc, setVc] = useState('')
  const code = useRef(newCode()), last = useRef(Date.now())

  const reset = () => { code.current = newCode(); setFrame(null); setTrx(null); setVoucher(''); setShots(null); setDone(null); setVc(''); setStep(home) }
  useEffect(() => { // tidak ada sentuhan 2 menit -> kembali ke awal
    const t = setInterval(() => { if (step !== home && step !== 'busy' && Date.now() - last.current > 120000) reset() }, 5000)
    return () => clearInterval(t)
  }, [step, home])
  useEffect(() => { if (step === 'done') { const t = setTimeout(reset, 60000); return () => clearTimeout(t) } }, [step])

  const choose = f => {
    setFrame(f)
    if (cfg.mode === 'event') return setStep('cam')                      // Event Mode: tanpa pembayaran
    if (!navigator.onLine) { toast(L('Offline: use Event Mode in App Setting', 'Offline: pakai Event Mode di App Setting')); return }
    setStep('pay')
  }
  const pay = async (body, vcode) => {
    try {
      const r = await kapi(cfg, '/transactions', { method: 'POST', body: JSON.stringify({ galleryId: gal ? gal.id : null, ...body }) })
      const j = await r.json(); if (!r.ok) throw j
      setTrx(j.transaction); setVoucher(vcode || ''); setStep('cam')
    } catch (e) { toast(e.error || 'Error') }
  }
  const useVoucher = async () => {
    const r = await kapi(cfg, '/vouchers/validate', { method: 'POST', body: JSON.stringify({ code: vc }) }), j = await r.json()
    if (!j.valid) return toast(L('Invalid voucher', 'Voucher tidak valid'))
    toast('Total: ' + rp(j.final_amount)); pay({ voucherCode: vc }, vc)
  }
  const print = async ({ raws, extras, live }) => {
    setStep('busy')
    try {
      const res = await N.session.finalize({ code: code.current, frame, raws, extras, live, galleryId: gal ? gal.id : null, trx: trx && { ...trx, voucherCode: voucher } })
      const q = qrcode(0, 'M'); q.addData(cfg.server + '/s/' + code.current); q.make()
      setDone({ composite: res.composite, qr: q.createDataURL(8) }); setStep('done')
    } catch (e) { toast(String(e.message || e)); reset() }
  }

  if (!sync || !frames.length) return (
    <div className="stage"><div className="center"><div className="cardw">
      <h3>{!sync ? L('Kiosk not ready', 'Kiosk belum siap') : L('No active frame', 'Belum ada frame aktif')}</h3>
      <p>{L('Open the admin panel (top-right button) and run Reload Kiosk.', 'Buka panel admin (tombol kanan atas) lalu jalankan Reload Kiosk.')}</p>
    </div></div></div>
  )
  const cur = frames[Math.min(fi, frames.length - 1)]
  const bg = tl.bg ? { backgroundImage: `url("${tl.bg}")` } : {}
  return (
    <div className="stage" style={{ ...bg, '--accent': et.accent || '#6c4cf5' }} onPointerDown={() => { last.current = Date.now() }}>
      {step === 'idle' && tl.idle && <video className="bgv" src={tl.idle} autoPlay loop muted playsInline />}
      {tl.logo && <img className="lg-tl" src={tl.logo} alt="" />}
      {et.footer_text && <div className="ft-b">{et.footer_text}</div>}

      {step === 'idle' && <button className="tap" onClick={() => setStep('pick')}>{L('Touch to start', 'Sentuh layar untuk memulai')}</button>}

      {step === 'pick' && (
        <div className="center"><div className="cardw">
          <div className="pickrow">
            {frames.length > 1 && <button className="nav" aria-label="Sebelumnya" onClick={() => setFi((fi + frames.length - 1) % frames.length)}>‹</button>}
            <Strip frame={cur} frameUrl={fl[cur.id]} uid="pick" className="pickstrip" />
            {frames.length > 1 && <button className="nav" aria-label="Berikutnya" onClick={() => setFi((fi + 1) % frames.length)}>›</button>}
          </div>
          <div className="ftitle">{cur.title}</div>
          {frames.length > 1 && <div className="dots">{frames.map((f, i) => <i key={f.id} className={i === fi ? 'on' : ''} />)}</div>}
          <button className="btnw pri" onClick={() => choose(cur)}>{L('Choose', 'Pilih')}</button>
        </div></div>
      )}

      {step === 'pay' && (
        <div className="center"><div className="cardw" style={{ width: 360 }}>
          <div className="ftitle">{L('Payment', 'Pembayaran')}</div>
          <div className="pbig">{rp(sync.price)}</div>
          <button className="btnw pri" onClick={() => pay({})}>{L('Pay with QRIS (simulation)', 'Bayar QRIS (simulasi)')}</button>
          <input value={vc} onChange={e => setVc(e.target.value)} placeholder="Voucher" aria-label="Voucher" />
          <button className="btnw" onClick={useVoucher}>{L('Use voucher', 'Pakai voucher')}</button>
          <button className="btnw" onClick={() => setStep('pick')}>{L('Back', 'Kembali')}</button>
        </div></div>
      )}

      {step === 'cam' && <Capture frame={frame} frameUrl={fl[frame.id]} code={code.current} startText={et.start_text || L('TOUCH TO START!', 'SENTUH UNTUK MEMULAI!')} onCancel={reset} onDone={s => { setShots(s); setStep('select') }} />}
      {step === 'select' && <Select frame={frame} frameUrl={fl[frame.id]} shots={shots} onPrint={print} onCancel={reset} />}
      {step === 'busy' && <div className="center"><div className="cardw"><div className="ftitle">{L('Printing...', 'Mencetak...')}</div></div></div>}

      {step === 'done' && (
        <div className="center"><div className="cardw" style={{ width: 340 }}>
          <img src={done.qr} alt="QR" style={{ width: '100%' }} />
          <p style={{ fontSize: 13 }}>{L('Scan to download your photos', 'Scan untuk mengunduh foto kamu')}<br /><small>{cfg.mode === 'event' ? L('Event Mode: the QR works after upload.', 'Mode Event: QR aktif setelah file terunggah.') : L('The QR works once the upload finishes.', 'QR aktif setelah unggah selesai.')}</small></p>
          <button className="btnw pri" onClick={reset}>{L('Start again', 'Mulai lagi')}</button>
          <button className="btnw" onClick={async () => { try { await N.sessions.reprint(code.current); toast(L('Sent to printer', 'Dikirim ke printer')) } catch (e) { toast(String(e.message || e)) } }}>{L('Extra print', 'Extra print')}</button>
        </div></div>
      )}
    </div>
  )
}
