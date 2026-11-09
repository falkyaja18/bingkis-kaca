import { useEffect, useRef, useState } from 'react'
import { useK } from '../ctx.js'
import Strip from './Strip.jsx'

// Layar tinjau & cetak: strip final, pilih foto lain untuk slot (sentuh foto di kanan lalu sentuh slot), RESET, PRINT, tab LIVE/FOTO/GIF
export default function Select({ frame, frameUrl, shots, onPrint, onCancel }) {
  const { L } = useK()
  const n = frame.slots_config.total_captures
  const cand = useRef([...shots.finals.map((data, i) => ({ id: 'f' + i, data, url: shots.urls[i] })), ...shots.extras.map((e, i) => ({ id: 'x' + i, data: e.data, url: e.url }))]).current
  const initial = cand.slice(0, n).map(c => c.id)
  const [assign, setAssign] = useState(initial), [pick, setPick] = useState(null), [tab, setTab] = useState('foto'), [t, setT] = useState(0)
  const byId = id => cand.find(c => c.id === id)
  const photos = assign.map(id => byId(id).url)

  useEffect(() => { // animasi tab GIF (0,5 dtk/foto) dan LIVE (10 fps)
    if (tab === 'foto') return
    const i = setInterval(() => setT(x => x + 1), tab === 'gif' ? 500 : 100)
    return () => clearInterval(i)
  }, [tab])

  const place = slot => { if (!pick) return; setAssign(a => a.map((x, i) => i === slot.capture ? pick : x)); setPick(null) }
  const print = () => {
    const used = new Set(assign)
    onPrint({ raws: assign.map(id => byId(id).data), extras: cand.filter(c => !used.has(c.id)).map(c => c.data), live: shots.live, photoFilter: shots.photoFilter })
  }
  return (
    <div className="selwrap">
      <div className="selmain">
        {tab === 'foto' && <Strip frame={frame} frameUrl={frameUrl} photos={photos} onSlot={pick ? place : null} uid="sel" />}
        {tab === 'gif' && <img className="gifp" src={photos[t % photos.length]} alt="GIF" />}
        {tab === 'live' && (shots.live.length ? <img className="livep" src={shots.live[t % shots.live.length]} alt="Live" /> : <div className="cardw">{L('No live preview (camera driver).', 'Tidak ada live preview (driver kamera).')}</div>)}
        <div className="tabs" role="tablist">
          {[['live', 'LIVE'], ['foto', 'FOTO'], ['gif', 'GIF']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <div className="selside">
        <div className="hint">
          {pick ? L('Now touch a slot on the strip', 'Sekarang sentuh slot di strip') : L('Touch a photo to swap it into a slot', 'Sentuh foto untuk menukar ke slot')}
          {shots.photoFilter && <small className="km-filter-applied">{L('Filter applied: ', 'Filter aktif: ')}{shots.photoFilter}</small>}
        </div>
        <div className="cands">{cand.map(c => <button key={c.id} className={'cand' + (pick === c.id ? ' on' : '')} onClick={() => { setTab('foto'); setPick(pick === c.id ? null : c.id) }} aria-label="Foto"><img src={c.url} alt="" /></button>)}</div>
        <button className="btnw pri" onClick={print}>Print</button>
        <button className="btnw" onClick={() => { setAssign(initial); setPick(null) }}>Reset</button>
      </div>
      <button className="cancel" onClick={onCancel}>✕ {L('CANCEL', 'BATAL')}</button>
    </div>
  )
}
