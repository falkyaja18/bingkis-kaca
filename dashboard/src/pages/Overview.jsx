import { useState, useMemo } from 'react'
import { Printer, Camera, TriangleAlert, ArrowUpDown, Search } from 'lucide-react'
import { useStore } from '../store.jsx'
import { useHealth, ago } from '../health.js'
import { AreaChart, Spark, Donut } from '../Charts.jsx'
import { rp } from '../utils.js'
import { pad, iso, short, addDays, period, bucket, sum, COLORS } from '../period.js'

function Health() {
  const { S } = useStore()
  const { health } = useHealth()
  const off = health.filter(h => !h.online).length
  const printer = h => h.printerStatus === 'online' ? ['ok', 'Printer Online'] : h.printerStatus === 'offline' ? ['bad', 'Offline'] : ['warn', String(h.printerStatus).replace(/_/g, ' ')]
  return (
    <div className="card">
      <h3>Kesehatan Kiosk</h3>
      <div className="sub">Heartbeat live - refresh setiap 15 detik · {off ? <b style={{ color: 'var(--danger)' }}>{off} offline</b> : '0 offline'} dari {health.length}</div>
      {health.map(h => { const [pc, pt] = printer(h); return (
        <div className="hrow" key={h.id}>
          <span className={'dot' + (h.online ? ' on' : '')} /> <b>{h.name}</b><span className="sp" />
          {h.appVersion && <span className="pill mono">{h.appVersion}</span>}
          <span className={'pill ' + (h.online ? 'ok' : 'bad')}>{h.online ? 'Online' : 'Offline'}</span>
          <span className={'pill ' + pc}><Printer size={12} />{pt}{h.online && h.paperRemaining != null ? ` · ${h.paperRemaining}` : ''}</span>
          <span className={'pill ' + (h.cameraConnected ? 'ok' : '')}><Camera size={12} />{h.cameraConnected ? 'Kamera terhubung' : 'Tidak terhubung'}</span>
          {h.pendingFailsave > 0 && <span className="pill warn"><TriangleAlert size={12} />{h.pendingFailsave} antrean</span>}
          <span style={{ color: 'var(--mute)' }}>{ago(h.lastSeen)}</span>
        </div>) })}
      {!health.length && <div className="empty">Belum ada kiosk.</div>}
    </div>
  )
}

export default function Overview() {
  const { S } = useStore()
  const { health } = useHealth()
  const [range, setRange] = useState('day')
  const [date, setDate] = useState(iso(new Date()))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ k: 'month', d: -1 })

  const m = useMemo(() => {
    const p = period(range, date), pp = period(range, date, 1)
    const paid = S.trx.filter(t => t.status === 'PAID'), net = t => t.base - t.disc
    const rev = bucket(paid, t => t.at, net, p), prev = sum(bucket(paid, t => t.at, net, pp))
    const ses = bucket(S.sessions, s => s.createdAt, () => 1, p)
    const cet = bucket(S.sessions, s => s.createdAt, s => s.prints || 0, p)
    const vou = bucket(paid.filter(t => t.voucher || t.method === 'VOUCHER'), t => t.at, () => 1, p)
    const pk = ses.indexOf(Math.max(...ses))
    const peak = sum(ses) ? (range === 'day' ? `${pad(pk)}-${pad(pk + 1)}` : short(addDays(p.s, pk))) : '-'
    const dayP = period('day', date), monP = period('month', date)
    const perKiosk = S.kiosks.map((k, i) => {
      const mine = paid.filter(t => t.kiosk === k.id)
      return { id: k.id, name: k.name, color: COLORS[i % COLORS.length], rangeRev: sum(bucket(mine, t => t.at, net, p)),
        today: sum(bucket(mine, t => t.at, net, dayP)), sesToday: sum(bucket(S.sessions.filter(s => s.kiosk === k.id), s => s.createdAt, () => 1, dayP)),
        month: sum(bucket(mine, t => t.at, net, monP)) }
    })
    return { p, rev, total: sum(rev), prev, ses, cet, vou, peak, perKiosk, pk }
  }, [S, range, date])

  const delta = m.prev ? Math.round((m.total - m.prev) / m.prev * 100) : null
  const rows = m.perKiosk.filter(r => r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a[sort.k] - b[sort.k]) * sort.d || a.name.localeCompare(b.name))
  const donut = m.perKiosk.filter(r => r.rangeRev > 0).map(r => ({ label: r.name, value: r.rangeRev, color: r.color }))
  const th = (k, label) => <th className="s" onClick={() => setSort({ k, d: sort.k === k ? -sort.d : -1 })}>{label} <ArrowUpDown size={11} /></th>
  const active = health.filter(h => h.online).length

  return (
    <>
      <div className="pg">
        <div><h1>Beranda</h1><small>{active} booth aktif dari {S.kiosks.length} total booth</small></div>
        <div className="datebox"><div><label htmlFor="dt">Tanggal Dipilih</label><input id="dt" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></div></div>
      </div>
      <Health />
      <div className="sec"><span>Overview</span><div className="seg" role="tablist">{[['day', 'Hari'], ['week', 'Minggu'], ['month', 'Bulan']].map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div></div>
      <div className="card">
        <div className="lab">Pendapatan</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="big">{rp(m.total)}</div>
          <span className={'pill ' + (delta == null ? '' : delta >= 0 ? 'ok' : 'bad')}>{delta == null ? 'Tidak ada data sebelumnya' : `${delta >= 0 ? '+' : ''}${delta}% dari periode sebelumnya`}</span>
        </div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>{short(m.p.s)} – {short(addDays(m.p.e, -1))}</div>
        <AreaChart data={m.rev.map((v, i) => ({ label: m.p.label(i), value: v }))} />
      </div>
      <div className="g4">
        {[['Sesi', sum(m.ses), 'sesi', m.ses, '#6c4cf5'], ['Hari Puncak', m.peak, `${m.ses[m.pk] || 0} sesi`, m.ses, '#22c55e'], ['Cetakan', sum(m.cet), 'total cetakan', m.cet, '#6c4cf5'], ['Voucher', sum(m.vou), 'sesi voucher', m.vou, '#22c55e']].map(([t, v, s, vals, c]) => (
          <div className="card" key={t}><div className="lab">{t}</div><div className="mid">{v}</div><div style={{ fontSize: 11, color: 'var(--mute)' }}>{s}</div><Spark values={vals} color={c} /></div>
        ))}
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
    </>
  )
}
