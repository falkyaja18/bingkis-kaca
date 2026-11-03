import { useMemo, useState } from 'react'
import { Search, ArrowUpDown, Download } from 'lucide-react'
import { useStore } from '../store.jsx'
import { useHealth } from '../health.js'
import { AreaChart, Donut, DailyBars } from '../Charts.jsx'
import { rp, fd } from '../utils.js'
import { pad, iso, short, addDays, period, bucket, sum, weekRange, DAYS, COLORS, MON } from '../period.js'

const kname = (S, id) => (S.kiosks.find(k => k.id === id) || {}).name || '-'
const Status = ({ s }) => <span className={'tag ' + (s === 'PAID' ? 'ok' : s === 'FAILED' ? 'bad' : '')}>{s}</span>

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

const Bar = ({ label, pct, value }) => <div className="bar"><span>{label}</span><span><i style={{ width: pct + '%' }} /></span><b>{value}</b></div>

const dlabel = d => `${d.getDate()} ${MON[d.getMonth()]}`
const rangeLabel = p => `${dlabel(p.s)} - ${dlabel(addDays(p.e, -1))}`
const inRange = (t, p) => { const d = new Date(t); return d >= p.s && d < p.e }
const StatCard = ({ title, value, sub }) => (
  <div className="card statcard"><div className="lab">{title}</div><div className="mid">{value}</div><div className="stat-sub">{sub}</div></div>
)

export function Stats() {
  const { S } = useStore()
  const { health } = useHealth()
  const [range, setRange] = useState('month')
  const [date, setDate] = useState(iso(new Date()))
  const [tab, setTab] = useState('rev')
  const [meta, setMeta] = useState('email')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ k: 'month', d: -1 })

  const m = useMemo(() => {
    const p = period(range, date), pp = period(range, date, 1)
    const paid = S.trx.filter(t => t.status === 'PAID'), net = t => t.base - (t.disc || 0)
    const rev = bucket(paid, t => t.at, net, p)
    const total = sum(rev), prev = sum(bucket(paid, t => t.at, net, pp))
    const ses = bucket(S.sessions, s => s.createdAt, () => 1, p)
    const cet = bucket(S.sessions, s => s.createdAt, s => s.prints || 0, p)
    const vou = bucket(paid.filter(t => t.voucher || t.method === 'VOUCHER'), t => t.at, () => 1, p)
    const totalSes = sum(ses), peakIdx = ses.indexOf(Math.max(...ses))
    const peak = totalSes ? (range === 'month' ? `${pad(p.s.getMonth() + 1)}-${pad(peakIdx + 1)}` : range === 'week' ? short(addDays(p.s, peakIdx)) : `${pad(peakIdx)}-${pad(peakIdx + 1)}`) : '-'
    const dayP = period('day', date), monP = period('month', date)
    const perKiosk = S.kiosks.map((k, i) => {
      const mine = paid.filter(t => t.kiosk === k.id), mySes = S.sessions.filter(s => s.kiosk === k.id)
      return { id: k.id, name: k.name, color: COLORS[i % COLORS.length],
        rangeRev: sum(bucket(mine, t => t.at, net, p)),
        today: sum(bucket(mine, t => t.at, net, dayP)),
        sesToday: sum(bucket(mySes, s => s.createdAt, () => 1, dayP)),
        month: sum(bucket(mine, t => t.at, net, monP)) }
    })
    // Detail harian Senin–Minggu + total mingguan/bulanan
    const wk = weekRange(date)
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const s = addDays(wk.s, i), e = addDays(s, 1)
      const dayPaid = paid.filter(t => { const d = new Date(t.at); return d >= s && d < e })
      const daySes = S.sessions.filter(x => { const d = new Date(x.createdAt); return d >= s && d < e })
      return { label: DAYS[i], rev: sum(dayPaid.map(net)), foto: sum(daySes.map(x => x.prints || 0)),
        voucher: dayPaid.filter(t => t.voucher || t.method === 'VOUCHER').length }
    })
    const week = { rev: sum(weekDays.map(d => d.rev)), foto: sum(weekDays.map(d => d.foto)), voucher: sum(weekDays.map(d => d.voucher)) }
    const month = {
      rev: sum(paid.filter(t => inRange(t.at, monP)).map(net)),
      foto: sum(S.sessions.filter(x => inRange(x.createdAt, monP)).map(x => x.prints || 0)),
      voucher: paid.filter(t => inRange(t.at, monP) && (t.voucher || t.method === 'VOUCHER')).length
    }
    // Frame terpopuler pada periode yang dipilih
    const cnt = {}
    S.sessions.filter(x => x.frame && inRange(x.createdAt, p)).forEach(x => { cnt[x.frame] = (cnt[x.frame] || 0) + 1 })
    const topFrames = Object.entries(cnt).map(([id, n]) => ({ f: S.frames.find(x => x.id === id), n }))
      .filter(x => x.f).sort((a, b) => b.n - a.n).slice(0, 3)
    return { p, pp, rev, total, prev, ses, cet, vou, totalSes, peak, peakN: ses[peakIdx] || 0,
      perKiosk, weekDays, week, month, topFrames, label: rangeLabel(p), prevLabel: rangeLabel(pp) }
  }, [S, range, date])

  const delta = m.prev ? (m.total - m.prev) / m.prev * 100 : null
  const rows = m.perKiosk.filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a[sort.k] - b[sort.k]) * sort.d || a.name.localeCompare(b.name))
  const donut = m.perKiosk.filter(r => r.rangeRev > 0).map(r => ({ label: r.name, value: r.rangeRev, color: r.color }))
  const th = (k, label) => <th className="s" onClick={() => setSort({ k, d: sort.k === k ? -sort.d : -1 })}>{label} <ArrowUpDown size={11} /></th>
  const active = health.filter(h => h.online).length

  const DETAIL = {
    rev: { title: 'Total Transaksi Harian (Senin - Minggu)', week: 'Total Transaksi Mingguan', month: 'Total Transaksi Bulanan', fmt: rp },
    foto: { title: 'Total Foto Harian (Senin - Minggu)', week: 'Total Foto Mingguan', month: 'Total Foto Bulanan', fmt: v => String(v) },
    voucher: { title: 'Total Sesi Voucher Harian (Senin - Minggu)', week: 'Total Sesi Voucher Mingguan', month: 'Total Sesi Voucher Bulanan', fmt: v => String(v) }
  }[tab]

  const metaKey = { email: 'email', phone: 'phone', name: 'name', rating: 'rating' }[meta]
  const metaCount = {}
  S.sessions.filter(s => s[metaKey] != null && s[metaKey] !== '' && inRange(s.createdAt, m.p))
    .forEach(s => { metaCount[s[metaKey]] = (metaCount[s[metaKey]] || 0) + 1 })
  const metaRows = Object.entries(metaCount).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const exportCsv = () => {
    const data = [
      ['Statistik Booth', m.label], ['Total Pendapatan', m.total], ['Sesi', m.totalSes],
      ['Hari Puncak', m.peak, `${m.peakN} sesi`], ['Cetakan', sum(m.cet)], ['Sesi Voucher', sum(m.vou)], [],
      ['Booth', 'Transaksi Hari Ini', 'Sesi Hari Ini', 'Total Bulan Ini'],
      ...m.perKiosk.map(r => [r.name, r.today, r.sesToday, r.month])
    ]
    const csv = data.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `statistik-${date}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="pg">
        <div><h1>Statistik Booth</h1><small>{active} booth aktif dari {S.kiosks.length} total booth</small></div>
        <div className="stat-actions">
          <div className="datebox"><div><label htmlFor="stat-date">Tanggal Dipilih</label><input id="stat-date" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></div></div>
          <button className="btn dark" onClick={exportCsv}><Download size={15} /> Export</button>
        </div>
      </div>
      <div className="sec"><span>Overview</span><div className="seg" role="tablist">{[['day', 'Harian'], ['week', 'Minggu'], ['month', 'Bulan']].map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div></div>
      <div className="card">
        <div className="lab">Pendapatan</div>
        <div className="statline">
          <div className="big">{rp(m.total)}</div>
          <span className={'pill ' + (delta == null ? '' : delta >= 0 ? 'ok' : 'bad')}>
            {delta == null ? 'Tidak ada data sebelumnya' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`}
          </span>
        </div>
        <div className="periodline"><span>{m.label}</span><span className="cmp">vs {m.prevLabel}</span></div>
        <AreaChart data={m.rev.map((v, i) => ({ label: m.p.label(i), value: v }))} />
      </div>
      <div className="g4">
        <StatCard title="Sesi" value={m.totalSes} sub={m.label} />
        <StatCard title="Hari Puncak" value={m.peak} sub={`${m.peakN} sesi`} />
        <StatCard title="Cetakan" value={sum(m.cet)} sub="total cetakan" />
        <StatCard title="Voucher" value={sum(m.vou)} sub="sesi voucher" />
      </div>

      <div className="sec"><span>Detail Mingguan / Bulanan</span><div className="tabs" role="tablist">
        {[['rev', 'Pendapatan'], ['foto', 'Foto'], ['voucher', 'Sesi Voucher']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div></div>
      <div className="card">
        <div className="hd"><h3>{DETAIL.title}</h3><span className="weekly-total">Total Mingguan <b>{DETAIL.fmt(m.week[tab])}</b></span></div>
        <DailyBars data={m.weekDays.map(d => ({ label: d.label, value: d[tab] }))} fmt={v => Number(v).toLocaleString('id-ID')} />
        <div className="gcards">
          <div className="grad purple"><div className="lab">{DETAIL.week}</div><div className="big">{DETAIL.fmt(m.week[tab])}</div><div className="gsub">{rangeLabel(weekRange(date))}</div></div>
          <div className="grad green"><div className="lab">{DETAIL.month}</div><div className="big">{DETAIL.fmt(m.month[tab])}</div><div className="gsub">{rangeLabel(period('month', date))}</div></div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <h3>Daftar Booth</h3><div className="sub">Detail transaksi untuk setiap booth</div>
          <div style={{ position: 'relative', marginBottom: 10 }}><Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--mute)' }} /><input style={{ paddingLeft: 30 }} placeholder="Cari nama booth" aria-label="Cari booth" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="tw"><table>
            <thead><tr><th>Booth</th>{th('today', 'Transaksi Hari Ini')}{th('sesToday', 'Sesi Hari Ini')}{th('month', 'Total Bulan Ini')}</tr></thead>
            <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.name}</b></td><td>{rp(r.today)}</td><td>{r.sesToday}</td><td>{rp(r.month)}</td></tr>)}
              {!rows.length && <tr><td colSpan="4" className="empty">Tidak ada booth.</td></tr>}</tbody>
          </table></div>
        </div>
        <div className="card">
          <h3>Top Booth Penghasilan</h3><div className="sub">Porsi pendapatan per booth</div>
          {donut.length ? <Donut items={donut} /> : <div className="empty" style={{ paddingTop: 50 }}>Belum ada data</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><div><h3>Frame Terpopuler</h3><div className="sub">{m.topFrames.length} frame terpopuler pada periode ini</div></div></div>
        {m.topFrames.length ? <div className="framegrid">
          {m.topFrames.map(({ f, n }) => (
            <div className="fcard" key={f.id}>
              <div className="fthumb">{f.asset ? <img src={f.asset} alt={f.title} /> : <span>Preview belum diunggah</span>}</div>
              <div className="fmeta"><b>{f.title}</b><span>{n} kali dipakai</span></div>
            </div>
          ))}
        </div> : <div className="empty">Belum ada data frame pada periode ini.</div>}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><div><h3>Leaderboard Metadata</h3><div className="sub">Peringkat pelanggan berdasarkan metadata sesi</div></div>
          <div className="seg" role="tablist">{[['email', 'Email'], ['phone', 'Telepon'], ['name', 'Nama'], ['rating', 'Rating']].map(([k, l]) => <button key={k} role="tab" aria-selected={meta === k} className={meta === k ? 'on' : ''} onClick={() => setMeta(k)}>{l}</button>)}
          </div>
        </div>
        {metaRows.length ? <div className="meta-list">{metaRows.map(([v, n], i) => <div className="meta-row" key={v}><span className="rk">{i + 1}</span><b>{v}</b><span className="sp" /><span className="pill">{n}x</span></div>)}</div> : <div className="empty">Tidak ada data di periode ini.</div>}
      </div>
    </>
  )
}

export function Transactions() {
  const { S } = useStore()
  const [q, setQ] = useState('')
  const rows = S.trx.filter(t => (t.inv + kname(S, t.kiosk) + t.method + t.status).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="panel">
      <div className="hd"><h1>Transaction</h1><input className="search" placeholder="Cari invoice, kiosk…" aria-label="Cari" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="tw"><table>
        <thead><tr><th>Invoice</th><th>Kiosk</th><th>Metode</th><th>Harga</th><th>Diskon</th><th>Total</th><th>Status</th><th>Waktu</th></tr></thead>
        <tbody>
          {rows.map(t => <tr key={t.id}><td>{t.inv}</td><td>{kname(S, t.kiosk)}</td><td>{t.method}</td><td>{rp(t.base)}</td><td>{rp(t.disc)}</td><td><b>{rp(t.base - t.disc)}</b></td><td><Status s={t.status} /></td><td>{fd(t.at)}</td></tr>)}
          {!rows.length && <tr><td colSpan="8" className="empty">Tidak ada transaksi.</td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}
