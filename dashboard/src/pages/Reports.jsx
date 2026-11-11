import { useMemo, useState } from 'react'
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Download, Calendar, ArrowRight } from 'lucide-react'
import { useStore } from '../store.jsx'
import { useHealth } from '../health.js'
import { AreaChart, Spark, Donut, compact } from '../Charts.jsx'
import { rp, fd, iso, shortDate, addDays, period, bucket, sum, periodLabel, downloadCsv } from '../utils.js'

const kname = (S, id) => (S.kiosks.find(k => k.id === id) || {}).name || '-'

export function Gallery() {
  const { S } = useStore()
  return (
    <div className="panel">
      <h1>Gallery</h1>
      <div className="tw"><table>
        <thead><tr><th>Foto</th><th>Kode</th><th>Kiosk</th><th>Cetak</th><th>Dibuat</th><th>Kedaluwarsa</th></tr></thead>
        <tbody>
          {S.sessions.map(x => (
            <tr key={x.code}>
              <td><a href={`/s/${x.code}`} target="_blank" rel="noreferrer"><img src={x.composite} height="60" alt="" /></a></td>
              <td><code>{x.code}</code></td><td>{kname(S, x.kiosk)}</td><td>{x.prints || 0}</td><td>{fd(x.createdAt)}</td><td>{fd(x.expiredAt)}</td>
            </tr>
          ))}
          {!S.sessions.length && <tr><td colSpan="6" className="empty">Belum ada sesi. Foto muncul setelah kiosk mengunggah.</td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}

const COLORS = ['#6c4cf5', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#64748b']
const PER_PAGE = 5
const pad = n => String(n).padStart(2, '0')

export function Stats() {
  const { S } = useStore()
  const { health } = useHealth()
  const [range, setRange] = useState('month')
  const [date, setDate] = useState(iso(new Date()))
  const [q, setQ] = useState(''), [page, setPage] = useState(1)
  const [sort, setSort] = useState({ k: 'month', d: -1 })
  const [fq, setFq] = useState(''), [meta, setMeta] = useState('Telepon')

  const m = useMemo(() => {
    const p = period(range, date), pp = period(range, date, 1)
    const paid = S.trx.filter(t => t.status === 'PAID'), net = t => t.base - t.disc
    const rev = bucket(paid, t => t.at, net, p), prev = sum(bucket(paid, t => t.at, net, pp))
    const ses = bucket(S.sessions, s => s.createdAt, () => 1, p)
    const cet = bucket(S.sessions, s => s.createdAt, s => s.prints || 0, p)
    const vou = bucket(paid.filter(t => t.voucher || t.method === 'VOUCHER'), t => t.at, () => 1, p)
    const pk = ses.indexOf(Math.max(...ses))
    const peak = sum(ses) ? (range === 'day' ? `${pad(pk)}-${pad(pk + 1)}` : shortDate(addDays(p.s, pk))) : '-'
    const dayP = period('day', date), monP = period('month', date)
    const perKiosk = S.kiosks.map((k, i) => {
      const mine = paid.filter(t => t.kiosk === k.id)
      return { id: k.id, name: k.name, color: COLORS[i % COLORS.length], rangeRev: sum(bucket(mine, t => t.at, net, p)),
        today: sum(bucket(mine, t => t.at, net, dayP)), sesToday: sum(bucket(S.sessions.filter(s => s.kiosk === k.id), s => s.createdAt, () => 1, dayP)),
        month: sum(bucket(mine, t => t.at, net, monP)) }
    })
    // Pemakaian frame dalam periode (frameId dicatat server sejak update ini; data lama tanpa frame tidak dihitung)
    const uses = {}
    S.sessions.forEach(s => { const t = new Date(s.createdAt); if (t >= p.s && t < p.e) { const key = s.frameId || s.frameTitle || ''; if (key) uses[key] = (uses[key] || 0) + 1 } })
    const frames = S.frames.filter(f => f.active !== false)
      .map(f => ({ ...f, uses: uses[f.id] || (f.title ? uses[f.title] : 0) || 0 }))
      .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title))
    return { p, pp, rev, total: sum(rev), prev, ses, cet, vou, peak, perKiosk, pk, frames, totalUses: sum(Object.values(uses)) }
  }, [S, range, date])

  const delta = m.prev ? Math.round((m.total - m.prev) / m.prev * 100) : null
  const rows = m.perKiosk.filter(r => r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a[sort.k] - b[sort.k]) * sort.d || a.name.localeCompare(b.name))
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE)), pg = Math.min(page, pages)
  const shown = rows.slice((pg - 1) * PER_PAGE, pg * PER_PAGE)
  const donut = m.perKiosk.filter(r => r.rangeRev > 0).map(r => ({ label: r.name, value: r.rangeRev, color: r.color }))
  const frames = m.frames.filter(f => f.title.toLowerCase().includes(fq.toLowerCase())).slice(0, 3)
  const th = (k, label) => <th className="s" onClick={() => setSort({ k, d: sort.k === k ? -sort.d : -1 })}>{label} <ArrowUpDown size={11} /></th>
  const active = health.filter(h => h.online).length
  const pl = periodLabel(m.p)

  const exportCsv = () => downloadCsv(`statistik-${iso(new Date())}.csv`, [
    ['Periode', pl], ['Pendapatan', m.total], ['Periode sebelumnya', m.prev],
    ['Sesi', sum(m.ses)], ['Cetakan', sum(m.cet)], ['Voucher', sum(m.vou)], [],
    ['Booth', 'Transaksi Hari Ini', 'Sesi Hari Ini', 'Total Bulan Ini'],
    ...m.perKiosk.map(r => [r.name, r.today, r.sesToday, r.month]), [],
    ['Tanggal', 'Pendapatan'], ...m.rev.map((v, i) => [m.p.label(i), v])
  ])

  return (
    <>
      <div className="pg">
        <div><h1>Statistik Booth</h1><small>{active} booth aktif dari {S.kiosks.length} total booth</small></div>
        <div className="cc">
          <div className="datebox"><Calendar size={18} /><div><label htmlFor="std">Tanggal Dipilih</label><input id="std" type="date" value={date} onChange={e => { if (e.target.value) { setDate(e.target.value); setPage(1) } }} /></div></div>
          <button className="btn exp" onClick={exportCsv}><Download size={16} /> Export</button>
        </div>
      </div>
      <div className="sec"><span>Overview</span><div className="seg" role="tablist">{[['day', 'Hari'], ['week', 'Minggu'], ['month', 'Bulan']].map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => { setRange(k); setPage(1) }}>{l}</button>)}</div></div>
      <div className="card">
        <div className="lab">Pendapatan</div>
        <div className="revrow">
          <div className="big">{rp(m.total)}</div>
          {delta != null && <span className={'pill ' + (delta >= 0 ? 'ok' : 'bad')}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>}
        </div>
        <div className="per">{pl}</div>
        <div className="prev">vs {periodLabel(m.pp)}</div>
        <AreaChart data={m.rev.map((v, i) => ({ label: m.p.label(i), value: v }))} />
      </div>
      <div className="g4">
        {[['Sesi', sum(m.ses), 'sesi', m.ses, '#6c4cf5'], ['Hari Puncak', m.peak, `${m.ses[m.pk] || 0} sesi`, m.ses, '#22c55e'], ['Cetakan', sum(m.cet), 'total cetakan', m.cet, '#6c4cf5'], ['Voucher', sum(m.vou), 'sesi voucher', m.vou, '#22c55e']].map(([t, v, s, vals, c]) => (
          <div className="card" key={t}><div className="lab">{t}</div><div className="per">{pl}</div><div className="mid">{v}</div><div className="tiny">{s}</div><Spark values={vals} color={c} /></div>
        ))}
      </div>
      <div className="g2">
        <div className="card">
          <h3>Daftar Booth</h3><div className="sub">Detail transaksi untuk setiap booth</div>
          <div className="searchrow"><Search size={14} /><input placeholder="Cari nama booth" aria-label="Cari booth" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></div>
          <div className="tw"><table>
            <thead><tr><th>Booth</th>{th('today', 'Transaksi Hari Ini')}{th('sesToday', 'Sesi Hari Ini')}{th('month', 'Total Bulan Ini')}<th /></tr></thead>
            <tbody>{shown.map(r => <tr key={r.id}><td><b>{r.name}</b></td><td>{rp(r.today)}</td><td>{r.sesToday}</td><td>{rp(r.month)}</td><td className="chev"><ChevronRight size={16} /></td></tr>)}
              {!shown.length && <tr><td colSpan="5" className="empty">Tidak ada booth.</td></tr>}</tbody>
          </table></div>
          <div className="pager">
            <span>{rows.length ? `${(pg - 1) * PER_PAGE + 1} - ${Math.min(rows.length, pg * PER_PAGE)} dari ${rows.length} data` : '0 data'}</span>
            <div className="pgs">
              <button disabled={pg <= 1} onClick={() => setPage(pg - 1)}><ChevronLeft size={15} /> Sebelumnya</button>
              <span className="pgn">{pg}</span>
              <button disabled={pg >= pages} onClick={() => setPage(pg + 1)}>Berikutnya <ChevronRight size={15} /></button>
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Top Booth Penghasilan</h3><div className="sub">Porsi pendapatan per booth</div>
          {donut.length ? <Donut items={donut} centerLabel="Total Pendapatan" centerValue={'Rp ' + compact(m.total)} fmt={v => 'Rp ' + compact(v)} /> : <div className="empty" style={{ paddingTop: 50 }}>Belum ada data</div>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd">
          <div><h3>Frame Terpopuler</h3><div className="sub">Frame paling sering dipakai · {pl}</div></div>
          <a className="link" href="#framephoto">Lihat semua frame <ArrowRight size={14} /></a>
        </div>
        <div className="searchrow"><Search size={14} /><input placeholder="Cari nama frame" aria-label="Cari frame" value={fq} onChange={e => setFq(e.target.value)} /></div>
        {frames.length ? (
          <div className="framegrid">{frames.map((f, i) => (
            <div className="framecard" key={f.id}>
              <div className="framethumb">
                <span className="rank">#{i + 1}</span>
                {f.asset ? <img src={f.asset} alt={f.title} /> : <span className="noimg">Tidak ada gambar</span>}
                <span className="pct">{Math.round(f.uses / Math.max(1, m.totalUses) * 100)}%</span>
              </div>
              <div className="fname">{f.title}</div>
              <div className="fuse">{f.uses} kali dipakai</div>
            </div>
          ))}</div>
        ) : <div className="empty">Belum ada frame.</div>}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd">
          <div><h3>Leaderboard Metadada</h3><div className="sub">Urutan teratas per key metadata · email, nomor telepon, nama, rating</div><div className="sub">Filter: {pl}</div></div>
          <div className="cc meta">
            <button className="btn ghost" onClick={() => downloadCsv(`metadata-${iso(new Date())}.csv`, [[meta], ['Tidak ada data di periode ini']])}><Download size={15} /> Export</button>
            <div className="seg metaseg" role="tablist">{[['Email', 'Email'], ['Telepon', 'Telepon'], ['Nama', 'Nama'], ['Rating', 'Rating']].map(([k, l]) => <button key={k} role="tab" aria-selected={meta === k} className={meta === k ? 'on' : ''} onClick={() => setMeta(k)}>{l}</button>)}</div>
          </div>
        </div>
        <div className="empty metaempty">Tidak ada data di periode ini</div>
      </div>
    </>
  )
}

export { default as Transactions } from './Transactions.jsx'
