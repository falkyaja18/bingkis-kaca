import { useEffect, useState } from 'react'
import { useK } from '../ctx.js'
import { N } from '../lib/native.js'
import { Back } from './Home.jsx'

// mode: reprint (Reprint Gallery) | local (Local File) | failure (Failure File)
export default function Sessions({ mode }) {
  const { cfg, L, toast } = useK()
  const [list, setList] = useState([])
  const load = async () => { const a = await N.sessions.list(); setList(mode === 'failure' ? a.filter(s => s.sync !== 'SYNCED') : a) }
  useEffect(() => { load() }, [])
  const guard = fn => async () => { try { await fn() } catch (e) { toast(String(e.message || e)) } }

  const retry = async code => {
    if (cfg.mode === 'event') return toast(L('Switch to Normal Mode first', 'Pindah ke Normal Mode dulu'))
    const r = await N.sessions.retry(code); toast(r.busy ? L('Sync already running', 'Sinkronisasi sedang berjalan') : `${r.uploaded}/${r.total} OK`); load()
  }
  const action = s => {
    if (mode === 'reprint') return <button className="b sm" onClick={guard(async () => { await N.sessions.reprint(s.code); toast(L('Sent to printer', 'Dikirim ke printer')); load() })}>{L('Print', 'Cetak')}</button>
    if (mode === 'local') return <button className="b sm" onClick={() => N.sessions.reveal(s.code)}>{L('Open folder', 'Buka folder')}</button>
    return <button className="b sm" onClick={guard(() => retry(s.code))}>Retry</button>
  }
  const title = { reprint: 'Reprint Gallery', local: 'Local File', failure: 'Failure File' }[mode]
  return (
    <>
      <h3>{title}</h3>
      {mode === 'failure' && cfg.mode === 'event' && <p>{L('Event Mode: uploads are paused.', 'Mode Event: unggah ditunda.')}</p>}
      {list.map(s => (
        <div className="row" key={s.code}>
          <img src={s.composite} alt="" />
          <div><b>{s.code}</b><br />{new Date(s.createdAt).toLocaleString('id-ID')}<br /><span className="tag">{s.sync}</span> {L('prints', 'cetak')}: {s.prints || 0}
            {mode === 'failure' && s.lastError && <><br /><small>{s.retryCount}x · {s.lastError}</small></>}</div>
          {action(s)}
        </div>
      ))}
      {!list.length && <p>{mode === 'failure' ? L('Nothing pending.', 'Tidak ada antrean.') : L('No photos yet', 'Belum ada foto')}</p>}
      {mode === 'failure' && list.length > 0 && <button className="b" onClick={guard(() => retry(null))}>Retry all</button>}
      <Back />
    </>
  )
}
