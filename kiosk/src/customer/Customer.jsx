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
  const kioskSettings = (sync && sync.kiosk_settings) || {}
  const display = kioskSettings.display || {}, payment = kioskSettings.payment || {}, timer = kioskSettings.timer || {}
  const kioskAssets = (sync && sync.kiosk_assets_local) || {}
  const customDisplay = display.layout !== 'default'
  const frames = sync ? sync.frames.filter(f => f.type === 'PHOTO') : []
  const categories = kioskSettings.categories || []
  const gal = sync && sync.kiosk_info.active_public_gallery

  const resolveUrl = raw => {
    if (!raw) return ''
    if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('file:') || raw.startsWith('blob:')) return raw
    return (cfg.server || '').replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw)
  }

  const resolveFrameUrl = f => {
    if (!f) return ''
    return fl[f.id] || resolveUrl(f.asset_url || f.asset || '')
  }

  const idleUrl = (customDisplay && kioskAssets.kiosk_idle) || tl.idle || resolveUrl(et.idle_video_url || '')
  const bgUrl = customDisplay ? '' : tl.bg || resolveUrl(et.background_url || '')
  const logoUrl = tl.logo || resolveUrl(et.logo_url || '')
  const welcomeUrl = customDisplay ? kioskAssets.kiosk_welcome || '' : ''

  const home = idleUrl || welcomeUrl || (customDisplay && display.welcomeText) ? 'idle' : 'pick'
  const [step, setStep] = useState(home), [fi, setFi] = useState(0), [categoryId, setCategoryId] = useState(''), [frame, setFrame] = useState(null), [trx, setTrx] = useState(null)
  const [voucher, setVoucher] = useState(''), [shots, setShots] = useState(null), [done, setDone] = useState(null), [vc, setVc] = useState('')
  const code = useRef(newCode()), last = useRef(Date.now())

  const reset = () => { code.current = newCode(); setFrame(null); setTrx(null); setVoucher(''); setShots(null); setDone(null); setVc(''); setStep(home) }
  useEffect(() => { // tidak ada sentuhan 2 menit -> kembali ke awal
    const t = setInterval(() => { if (step !== home && step !== 'busy' && Date.now() - last.current > 120000) reset() }, 5000)
    return () => clearInterval(t)
  }, [step, home])
  useEffect(() => { if (step === 'done') { const t = setTimeout(reset, Math.max(1, Number(timer.qr) || 80) * 1000); return () => clearTimeout(t) } }, [step, timer.qr])

  const choose = f => {
    setFrame(f)
    if (cfg.mode === 'event' || payment.disablePaywall) return setStep('cam')
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
    try {
      const r = await kapi(cfg, '/vouchers/validate', { method: 'POST', body: JSON.stringify({ code: vc }) }), j = await r.json()
      if (!r.ok) throw j
      if (!j.valid) return toast(L('Invalid voucher', 'Voucher tidak valid'))
      toast('Total: ' + rp(j.final_amount)); pay({ voucherCode: vc }, vc)
    } catch (error) {
      toast(error.error || error.message || 'Voucher tidak dapat diperiksa.')
    }
  }
  const print = async ({ raws, extras, live, photoFilter }) => {
    setStep('busy')
    try {
      const res = await N.session.finalize({ code: code.current, frame, raws, extras, live, photoFilter, galleryId: gal ? gal.id : null, trx: trx && { ...trx, voucherCode: voucher } })
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
  const bg = bgUrl ? { backgroundImage: `url("${bgUrl}")` } : {}
  const isVideoIdle = idleUrl && (idleUrl.startsWith('data:video') || /\.(mp4|webm)(\?.*)?$/i.test(idleUrl))
  const visibleFrames = categoryId
    ? frames.filter(f => (categories.find(category => category.id === categoryId)?.frameIds || []).includes(f.id))
    : frames
  const selectedFrame = visibleFrames[Math.min(fi, visibleFrames.length - 1)] || null
  const startText = (customDisplay && display.welcomeText) || et.start_text || L('Touch to start', 'Sentuh layar untuk memulai')
  const footerText = (customDisplay && display.footerText) || et.footer_text
  const pageStyle = {
    ...bg,
    backgroundColor: (customDisplay && display.backgroundColor) || '#1b1d22',
    color: (customDisplay && display.textColor) || '#ffffff',
    '--accent': et.accent || '#6c4cf5',
    '--customer-text': (customDisplay && display.textColor) || '#ffffff'
  }

  return (
    <div className={`stage${display.displayOrientation === 'portrait' ? ' display-portrait' : ''}`} style={pageStyle} onPointerDown={() => { last.current = Date.now() }}>
      {step === 'idle' && idleUrl && (
        isVideoIdle
          ? <video className="bgv" src={idleUrl} autoPlay loop muted playsInline />
          : <img className="bgv" src={idleUrl} alt="Waiting Zone" />
      )}
      {logoUrl && <img className="lg-tl" src={logoUrl} alt="" />}
      {step === 'idle' && welcomeUrl && <img className="km-welcome-image" src={welcomeUrl} alt="" />}
      {footerText && <div className="ft-b">{footerText}</div>}

      {step === 'idle' && <button className="tap" onClick={() => setStep('pick')}>{startText}</button>}

      {step === 'pick' && (
        <div className="center"><div className="cardw">
          {categories.length > 0 && <div className="km-customer-categories">
            <button type="button" className={!categoryId ? 'on' : ''} onClick={() => { setCategoryId(''); setFi(0) }}>{L('All', 'Semua')}</button>
            {categories.map(category => <button key={category.id} type="button" className={categoryId === category.id ? 'on' : ''} onClick={() => { setCategoryId(category.id); setFi(0) }}>{category.name}</button>)}
          </div>}
          <div className="pickrow">
            {visibleFrames.length > 1 && <button className="nav" aria-label="Sebelumnya" onClick={() => setFi((fi + visibleFrames.length - 1) % visibleFrames.length)}>‹</button>}
            {selectedFrame && <Strip frame={selectedFrame} frameUrl={resolveFrameUrl(selectedFrame)} uid="pick" className="pickstrip" />}
            {visibleFrames.length > 1 && <button className="nav" aria-label="Berikutnya" onClick={() => setFi((fi + 1) % visibleFrames.length)}>›</button>}
          </div>
          {selectedFrame
            ? <>
              <div className="ftitle">{selectedFrame.title}</div>
              {visibleFrames.length > 1 && <div className="dots">{visibleFrames.map((f, i) => <i key={f.id} className={i === fi ? 'on' : ''} />)}</div>}
              <button className="btnw pri" onClick={() => choose(selectedFrame)}>{L('Choose', 'Pilih')}</button>
            </>
            : <p>{L('No frames in this category', 'Belum ada frame di kategori ini')}</p>}
        </div></div>
      )}

      {step === 'pay' && (
        <div className="center"><div className="cardw" style={{ width: 360 }}>
          <div className="ftitle">{L('Payment', 'Pembayaran')}</div>
          <div className="pbig">{rp(sync.price)}</div>
          {!payment.voucherOnly && <button className="btnw pri" onClick={() => pay({})}>{L('Pay with QRIS (simulation)', 'Bayar QRIS (simulasi)')}</button>}
          <input value={vc} onChange={e => setVc(e.target.value)} placeholder="Voucher" aria-label="Voucher" />
          <button className="btnw" onClick={useVoucher}>{L('Use voucher', 'Pakai voucher')}</button>
          <button className="btnw" onClick={() => setStep('pick')}>{L('Back', 'Kembali')}</button>
        </div></div>
      )}

      {step === 'cam' && <Capture frame={frame} frameUrl={resolveFrameUrl(frame)} code={code.current} startText={startText} onCancel={reset} onDone={s => { setShots(s); setStep('select') }} />}
      {step === 'select' && <Select frame={frame} frameUrl={resolveFrameUrl(frame)} shots={shots} onPrint={print} onCancel={reset} />}
      {step === 'busy' && <div className="center"><div className="cardw"><div className="ftitle">{L('Printing...', 'Mencetak...')}</div></div></div>}

      {step === 'done' && (
        <div className="center"><div className="cardw" style={{ width: 340 }}>
          <img src={done.qr} alt="QR" style={{ width: '100%' }} />
          <p style={{ fontSize: 13 }}>{L('Scan to download your photos', 'Scan untuk mengunduh foto kamu')}<br /><small>{cfg.mode === 'event' ? L('Event Mode: the QR works after upload.', 'Mode Event: QR aktif setelah file terunggah.') : L('The QR works once the upload finishes.', 'QR aktif setelah unggah selesai.')}</small></p>
          <button className="btnw pri" onClick={reset}>{L('Start again', 'Mulai lagi')}</button>
          {payment.extraPrint && <button className="btnw" onClick={async () => { try { await N.sessions.reprint(code.current); toast(L('Sent to printer', 'Dikirim ke printer')) } catch (e) { toast(String(e.message || e)) } }}>{L('Extra print', 'Extra print')}</button>}
        </div></div>
      )}
    </div>
  )
}