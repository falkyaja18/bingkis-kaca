import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import logoImg from '../assets/logo.png'

export const Back = () => { const { go, L } = useK(); return <button className="b alt" onClick={() => go('home')}>{L('Back', 'Kembali')}</button> }

export default function Home() {
  const { cfg, patchCfg, L, go, reload, toast, closePanel } = useK()
  const run = (fn, ok) => async () => { try { await fn(); ok && toast(ok) } catch (e) { toast(String(e.message || e)) } }
  const buttons = [
    ['Start Session', 'Mulai Sesi', () => closePanel()],
    ['Test Print', 'Test Print', run(() => N.printer.test(), 'Test print')],
    ['Last Print', 'Cetak Terakhir', run(async () => { if (!(await N.sessions.last())) throw new Error(L('No photos yet', 'Belum ada foto')) }, L('Printing last photo', 'Mencetak foto terakhir'))],
    ['Reprint Gallery', 'Cetak Ulang Galeri', () => go('reprint')],
    ['Failure File', 'File Gagal Unggah', () => go('failure')],
    ['Local File', 'File Lokal', () => go('local')],
    ['Camera Test', 'Tes Kamera', () => go('camera')],
    ['App Setting', 'Pengaturan Aplikasi', () => go('app')],
    ['Printer Setting', 'Pengaturan Printer', () => go('printer')],
    ['Reload Kiosk', 'Muat Ulang Kiosk', () => reload(true)],
    ['Minimize Kiosk', 'Minimalkan Kiosk', () => N.window.minimize()],
    ['Close Kiosk', 'Tutup Kiosk', () => N.window.close()]
  ]
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <select style={{ width: 'auto' }} aria-label="Language" value={cfg.lang} onChange={e => patchCfg({ lang: e.target.value })}>
          <option value="EN">English (EN)</option><option value="ID">Indonesian (ID)</option>
        </select>
      </div>
    <div className="logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '-5px', padding: '0px' }}>
  <img src={logoImg} alt="Logo" style={{ width: '230px', height: 'auto', objectFit: 'contain' }} />
</div> 
      <h3>{cfg.token ? L('Kiosk Activated', 'Kiosk Aktif') : L('Kiosk Not Activated', 'Kiosk Belum Aktif')} - {cfg.mode === 'event' ? 'Event Mode' : 'Normal Mode'}</h3>
      {buttons.map((b, i) => <button key={b[0]} className={'b' + (i ? '' : ' hl')} onClick={b[2]}>{L(b[0], b[1])}</button>)}
    </>
  )
}
