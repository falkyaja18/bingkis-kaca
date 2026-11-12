import { useEffect, useRef, useState } from 'react'
import { useK } from '../ctx.js'
import Strip from './Strip.jsx'

const effectStyle = effect => effect === 'sepia' ? 'sepia(1)' : effect === 'icy' ? 'hue-rotate(155deg) saturate(.8)' : effect === 'grayscale' ? 'grayscale(1)' : 'none'

export default function Select({ frame, frameUrl, shots, onPrint, onCancel }) {
  const { sync, L } = useK()
  const n = frame.slots_config.total_captures
  const filters = sync?.kiosk_settings?.filters || []
  const cand = useRef([...shots.finals.map((data, i) => ({ id: 'f' + i, data, url: shots.urls[i] })), ...shots.extras.map((e, i) => ({ id: 'x' + i, data: e.data, url: e.url }))]).current
  const initial = cand.slice(0, n).map(c => c.id)
  const [assign, setAssign] = useState(initial), [pick, setPick] = useState(null), [tab, setTab] = useState('foto'), [t, setT] = useState(0), [filterId, setFilterId] = useState('')
  const byId = id => cand.find(c => c.id === id)
  const photos = assign.map(id => byId(id).url)
  const selectedFilter = filters.find(filter => filter.id === filterId)
  const photoFilter = effectStyle(selectedFilter?.effect)

  useEffect(() => {
    if (tab === 'foto') return
    const i = setInterval(() => setT(x => x + 1), tab === 'gif' ? 500 : 100)
    return () => clearInterval(i)
  }, [tab])

  const place = slot => { if (!pick) return; setAssign(a => a.map((x, i) => i === slot.capture ? pick : x)); setPick(null) }
  const print = () => {
    const used = new Set(assign)
    onPrint({ raws: assign.map(id => byId(id).data), extras: cand.filter(c => !used.has(c.id)).map(c => c.data), live: shots.live, photoFilter: selectedFilter?.effect || '' })
  }
  return (
    <div className="selwrap">
      <div className="selmain">
        <h1 className="customer-heading">{L('CHOOSE YOUR STYLE', 'PILIH GAYA')}</h1>
        {tab === 'foto' && <Strip frame={frame} frameUrl={frameUrl} photos={photos} photoFilter={photoFilter} onSlot={pick ? place : null} uid="sel" />}
        {tab === 'gif' && <img className="gifp" src={photos[t % photos.length]} alt="GIF" style={{ filter: photoFilter }} />}
        {tab === 'live' && (shots.live.length ? <img className="livep" src={shots.live[t % shots.live.length]} alt="Live" style={{ filter: photoFilter }} /> : <div className="cardw">{L('No live preview (camera driver).', 'Tidak ada live preview (driver kamera).')}</div>)}
        <div className="tabs" role="tablist">
          {[['live', 'LIVE'], ['foto', 'FOTO'], ['gif', 'GIF']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <div className="selside">
        <div className="hint">
          {pick ? L('Now touch a slot on the strip', 'Sentuh posisi foto pada strip') : L('Choose one style for every photo', 'Pilih satu gaya untuk semua foto')}
          {selectedFilter && <small className="km-filter-applied">{L('Selected: ', 'Gaya dipilih: ')}{selectedFilter.name}</small>}
        </div>
        <div className="km-style-list" aria-label={L('Photo styles', 'Gaya foto')}>
          <button type="button" className={'km-style-option' + (!filterId ? ' on' : '')} onClick={() => setFilterId('')}>
            <span className="km-style-swatch original" /><b>{L('Original', 'Asli')}</b>
          </button>
          {filters.map(filter => (
            <button type="button" key={filter.id} className={'km-style-option' + (filterId === filter.id ? ' on' : '')} onClick={() => setFilterId(filter.id)}>
              <span className="km-style-swatch" style={{ filter: effectStyle(filter.effect) }} /><b>{filter.name}</b>
            </button>
          ))}
          {!filters.length && <small className="km-style-empty">{L('No custom styles configured.', 'Belum ada gaya kustom dari Web Master.')}</small>}
        </div>
        <div className="hint">{pick ? L('Touch a slot to place the selected photo.', 'Sentuh slot untuk mengganti fotonya.') : L('Optional: touch a photo then a strip slot to replace it.', 'Opsional: sentuh foto lalu slot strip untuk menggantinya.')}</div>
        <div className="cands">{cand.map(c => <button key={c.id} className={'cand' + (pick === c.id ? ' on' : '')} onClick={() => { setTab('foto'); setPick(pick === c.id ? null : c.id) }} aria-label="Foto"><img src={c.url} alt="" style={{ filter: photoFilter }} /></button>)}</div>
        <button className="btnw pri" onClick={print}>{L('PRINT', 'PRINT')}</button>
        <button className="btnw" onClick={() => { setAssign(initial); setPick(null) }}>{L('RESET', 'RESET')}</button>
      </div>
      <button className="cancel" onClick={onCancel}>✕ {L('CANCEL', 'BATAL')}</button>
    </div>
  )
}
