import { useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import Strip from './Strip.jsx'
import Capture from './Capture.jsx'
import Select from './Select.jsx'

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
const isVideo = url => !!url && (/^data:video\//i.test(url) || /\.(mp4|webm)(\?.*)?$/i.test(url))
const readableColor = color => {
  const hex = /^#[0-9a-f]{6}$/i.test(color || '') ? color.slice(1) : '6c4cf5'
  const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16))
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? '#111111' : '#ffffff'
}

export default function Customer() {
  const { cfg, sync, L, toast } = useK()
  const et = sync?.event_theme || {}, tl = sync?.theme_local || {}, fl = sync?.frame_local || {}
  const kioskSettings = sync?.kiosk_settings || {}
  const display = kioskSettings.display || {}, payment = kioskSettings.payment || {}, timer = kioskSettings.timer || {}
  const kioskAssets = sync?.kiosk_assets_local || {}
  const customDisplay = display.layout !== 'default'
  const customWelcome = customDisplay && display.customWelcome !== false
  const frames = sync ? sync.frames.filter(f => f.type === 'PHOTO') : []
  const categories = kioskSettings.categories || []
  const gal = sync?.kiosk_info.active_public_gallery

  const resolveUrl = raw => {
    if (!raw) return ''
    if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('file:') || raw.startsWith('blob:') || raw.startsWith('photolab-file:')) return raw
    return (cfg.server || '').replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw)
  }
  const resolveFrameUrl = frame => frame ? fl[frame.id] || resolveUrl(frame.asset_url || '') : ''
  const eventIdle = tl.idle || resolveUrl(et.idle_video_url || '')
  const welcomeMedia = customWelcome
    ? kioskAssets.kiosk_welcome || kioskAssets.kiosk_idle || eventIdle
    : eventIdle
  const tutorialMedia = customDisplay
    ? kioskAssets.kiosk_tutorial || ''
    : tl.bg || resolveUrl(et.background_url || '')
  const logoUrl = kioskAssets.kiosk_logo || tl.logo || resolveUrl(et.logo_url || '')
  const home = welcomeMedia || (customWelcome && display.welcomeText) ? 'idle' : 'pick'
  const [step, setStep] = useState(home), [fi, setFi] = useState(0), [categoryId, setCategoryId] = useState('')
  const [frame, setFrame] = useState(null), [shots, setShots] = useState(null), [done, setDone] = useState(null)
  const [extraCount, setExtraCount] = useState(1), [extraBusy, setExtraBusy] = useState(false), [extraError, setExtraError] = useState('')
  const [extraPrintDone, setExtraPrintDone] = useState(false)
  const code = useRef(newCode()), last = useRef(Date.now())
  const visibleFrames = categoryId
    ? frames.filter(f => (categories.find(category => category.id === categoryId)?.frameIds || []).includes(f.id))
    : frames
  const selectedFrame = visibleFrames[Math.min(fi, visibleFrames.length - 1)] || null
  const startText = (customWelcome && display.welcomeText) || et.start_text || L('Touch to start', 'Sentuh layar untuk memulai')
  const footerText = (customDisplay && display.footerText) || et.footer_text
  const configuredExtraMax = Number(payment.extraPrintMax ?? cfg.extraPrintMax)
  const extraMax = Number.isFinite(configuredExtraMax) && configuredExtraMax >= 1 ? Math.floor(configuredExtraMax) : 5
  const isWelcomeVideo = isVideo(welcomeMedia), isTutorialVideo = isVideo(tutorialMedia)
  const uiAccent = display.uiAccent || et.accent || '#6c4cf5'
  const pageStyle = {
    backgroundColor: (customDisplay && display.backgroundColor) || '#1b1d22',
    backgroundImage: tutorialMedia && !isTutorialVideo ? `url("${tutorialMedia}")` : undefined,
    color: (customDisplay && display.textColor) || '#ffffff',
    '--accent': uiAccent,
    '--accent-ink': readableColor(uiAccent),
    '--customer-text': (customDisplay && display.textColor) || '#ffffff'
  }

  const reset = () => {
    code.current = newCode()
    setFrame(null); setShots(null); setDone(null); setExtraCount(1); setExtraBusy(false); setExtraError('')
    setExtraPrintDone(false); setFi(0); setCategoryId(''); setStep(home)
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (step !== home && step !== 'busy' && Date.now() - last.current > 120000) reset()
    }, 5000)
    return () => clearInterval(interval)
  }, [step, home])
  useEffect(() => {
    if (step !== 'done') return
    const timeout = setTimeout(reset, Math.max(1, Number(timer.qr) || 80) * 1000)
    return () => clearTimeout(timeout)
  }, [step, timer.qr])

  const choose = selected => { setFrame(selected); setStep('cam') }
  const print = async ({ raws, extras, live, photoFilter }) => {
    setStep('busy')
    try {
      const result = await N.session.finalize({ code: code.current, frame, raws, extras, live, photoFilter, galleryId: gal ? gal.id : null })
      const qr = qrcode(0, 'M')
      qr.addData(cfg.server + '/s/' + code.current)
      qr.make()
      setDone({ composite: result.composite, qr: qr.createDataURL(8) })
      setExtraPrintDone(false)
      setStep('done')
    } catch (error) {
      toast(String(error.message || error))
      setStep('select')
    }
  }
  const reprint = async () => {
    setExtraBusy(true)
    setExtraError('')
    try {
      await N.sessions.reprint(code.current, extraCount)
      setExtraPrintDone(true)
      setStep('done')
    } catch (error) {
      setExtraError(String(error.message || error))
    } finally {
      setExtraBusy(false)
    }
  }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (error) {
      toast(L('Fullscreen is unavailable', 'Mode layar penuh tidak tersedia'))
    }
  }

  if (!sync || !frames.length) return (
    <div className="stage"><div className="center"><div className="cardw">
      <h3>{!sync ? L('Kiosk not ready', 'Kiosk belum siap') : L('No active frame', 'Belum ada frame aktif')}</h3>
      <p>{L('Open the admin panel (top-right button) and run Reload Kiosk.', 'Buka panel admin (tombol kanan atas) lalu jalankan Reload Kiosk.')}</p>
    </div></div></div>
  )

  return (
    <div className={`stage${display.displayOrientation === 'portrait' ? ' display-portrait' : ''}`} style={pageStyle} onPointerDown={() => { last.current = Date.now() }}>
      {step === 'idle' && welcomeMedia && (isWelcomeVideo
        ? <video className="bgv" src={welcomeMedia} autoPlay loop muted playsInline />
        : <img className="bgv" src={welcomeMedia} alt="" />)}
      {step !== 'idle' && isTutorialVideo && <video className="bgv" src={tutorialMedia} autoPlay loop muted playsInline />}
      {step === 'idle' && logoUrl && <img className="lg-tl" src={logoUrl} alt="" />}
      {step !== 'idle' && step !== 'busy' && logoUrl && <div className="customer-brand"><img src={logoUrl} alt="" /></div>}
      <button type="button" className="fullscreen-toggle" aria-label="Layar penuh" onClick={toggleFullscreen}>⛶</button>
      {step !== 'idle' && step !== 'busy' && <div className={`customer-frame-lines customer-lines-${step}`} aria-hidden="true" />}
      {footerText && step !== 'busy' && <div className="ft-b">{footerText}</div>}

      {step === 'idle' && (
        <button className="tap" onClick={() => setStep('pick')}>{startText}</button>
      )}

      {step === 'pick' && (
        <div className="pick-layout">
          <section className="pick-sidebar">
            <h1 className="customer-heading">{L('CHOOSE YOUR FRAME', 'PILIH FRAME ANDA')}</h1>
            <div className="km-customer-categories">
              <button type="button" className={!categoryId ? 'on' : ''} onClick={() => { setCategoryId(''); setFi(0) }}>{L('All Frames', 'Semua Frame')}</button>
              {categories.map(category => <button key={category.id} type="button" className={categoryId === category.id ? 'on' : ''} onClick={() => { setCategoryId(category.id); setFi(0) }}>{category.name}</button>)}
            </div>
            <div className="customer-frame-list">
              {visibleFrames.map((item, index) => (
                <button key={item.id} type="button" className={'customer-frame-option' + (item.id === selectedFrame?.id ? ' on' : '')} onClick={() => setFi(index)}>
                  <Strip frame={item} frameUrl={resolveFrameUrl(item)} uid={`thumb-${item.id}`} />
                  <span>{item.title}</span>
                </button>
              ))}
              {!visibleFrames.length && <p>{L('No frames in this category', 'Belum ada frame di kategori ini')}</p>}
            </div>
          </section>
          <section className="pick-preview">
            <div className="pick-preview-label">{selectedFrame?.title || L('Select a frame', 'Pilih frame')}</div>
            {selectedFrame && <Strip frame={selectedFrame} frameUrl={resolveFrameUrl(selectedFrame)} uid="pick-large" />}
            {visibleFrames.length > 1 && <div className="dots">{visibleFrames.map((item, index) => <i key={item.id} className={index === fi ? 'on' : ''} />)}</div>}
            <button type="button" className="btnw pri" disabled={!selectedFrame} onClick={() => selectedFrame && choose(selectedFrame)}>{L('CHOOSE', 'PILIH')}</button>
          </section>
        </div>
      )}

      {step === 'cam' && (
        <div className="customer-step"><Capture frame={frame} frameUrl={resolveFrameUrl(frame)} code={code.current} startText={L('TOUCH TO START', 'SENTUH UNTUK MEMULAI')} onCancel={reset} onDone={result => { setShots(result); setStep('select') }} /></div>
      )}
      {step === 'select' && (
        <div className="customer-step"><Select frame={frame} frameUrl={resolveFrameUrl(frame)} shots={shots} onPrint={print} onCancel={reset} /></div>
      )}
      {step === 'busy' && <div className="center"><div className="cardw"><div className="ftitle">{L('Printing...', 'Mencetak...')}</div></div></div>}

      {step === 'extra' && done && (
        <div className="customer-result">
          <div className="customer-result-photo"><img src={done.composite} alt={L('Final photo', 'Hasil foto')} /></div>
          <section className="customer-extra-panel">
            <h1 className="customer-heading">{L('EXTRA PRINT', 'CETAK TAMBAHAN')}</h1>
            <p>{L('Choose how many copies to print.', 'Pilih jumlah salinan yang ingin dicetak.')}</p>
            <label className="extra-count">{L('Copies', 'Jumlah cetak')}
              <input type="number" min="1" max={extraMax} step="1" value={extraCount} onChange={event => setExtraCount(Math.max(1, Math.min(extraMax, Math.floor(Number(event.target.value) || 1))))} />
              <small>{L(`Maximum ${extraMax}`, `Maksimal ${extraMax} cetak`)}</small>
            </label>
            {extraError && <p className="extra-error" role="alert">{extraError}</p>}
            <button type="button" className="btnw pri" disabled={extraBusy} onClick={reprint}>{extraBusy ? L('PRINTING...', 'MENCETAK...') : L('PRINT', 'PRINT')}</button>
            <button type="button" className="btnw" disabled={extraBusy} onClick={() => setStep('done')}>{L('BACK', 'KEMBALI')}</button>
          </section>
        </div>
      )}

      {step === 'done' && done && (
        <div className="customer-result">
          <div className="customer-result-photo"><img src={done.composite} alt={L('Final photo', 'Hasil foto')} /></div>
          <section className="customer-result-qr">
            <h1 className="customer-heading">{L('YOUR SOFT FILE LINK', 'LINK SOFT FILE ANDA')}</h1>
            <img src={done.qr} alt={L('QR code to download your photos', 'QR untuk mengunduh foto')} />
            <p>{L('Scan to download your photos', 'Scan untuk mengunduh hasil sesi foto')}</p>
            {cfg.mode === 'event' && <small>{L('The QR is available after the kiosk syncs.', 'QR aktif setelah kiosk tersinkronisasi.')}</small>}
            {!extraPrintDone && payment.extraPrint && <button type="button" className="btnw" onClick={() => { setExtraError(''); setStep('extra') }}>{L('EXTRA PRINT', 'CETAK TAMBAHAN')}</button>}
            <button type="button" className="btnw pri" onClick={reset}>{L('START AGAIN', 'MULAI LAGI')}</button>
          </section>
        </div>
      )}
    </div>
  )
}
