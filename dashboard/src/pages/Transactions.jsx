import { useMemo, useState } from 'react'
import { Download, Eye, Info } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Modal } from '../Crud.jsx'
import Pager from '../Pager.jsx'
import { downloadCsv, fd, iso } from '../utils.js'

const PER_PAGE = 5
const fmtRp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const trxNet = t => Math.max(0, Number(t.base || 0) - Number(t.disc || 0))
const trxCode = t => t.inv || t.id || '-'
const trxBiller = t => t.billerId || t.client || '-'

const TrxStatusBadge = ({ status }) => {
  const s = String(status || '').toUpperCase()
  if (s === 'PAID' || s === 'SUCCESS') return <span className="pill ok">Berhasil</span>
  if (s === 'FAILED' || s === 'EXPIRED') return <span className="pill bad">{status}</span>
  return <span className="pill warn">{status || 'Pending'}</span>
}

const SessionStatusBadge = ({ session }) => (
  session
    ? <span className="pill ok">Selesai</span>
    : <span className="pill">Belum ada sesi</span>
)

/** Shared horizontal-scrollable transaction table for today's feed and kiosk detail modal. */
function TrxTable({ rows, page, perPage = PER_PAGE, kioskMap, sessionByTrx, showKiosk = true }) {
  const startIdx = (page - 1) * perPage
  const colSpan = showKiosk ? 11 : 10
  return (
    <div className="tw trx-tw">
      <table className="trx-table">
        <thead>
          <tr>
            <th>No</th>
            <th>ID Transaksi</th>
            <th>ID Biller</th>
            {showKiosk && <th>Kiosk</th>}
            <th>Waktu</th>
            <th>Status Transaksi</th>
            <th>Status Sesi</th>
            <th>Metode</th>
            <th>Nominal</th>
            <th>Diskon</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.id}>
              <td>{startIdx + i + 1}</td>
              <td className="mono">{trxCode(t)}</td>
              <td className="mono">{trxBiller(t)}</td>
              {showKiosk && <td>{kioskMap[t.kiosk] || '-'}</td>}
              <td>{fd(t.at)}</td>
              <td><TrxStatusBadge status={t.status} /></td>
              <td><SessionStatusBadge session={sessionByTrx.get(t.id)} /></td>
              <td>{t.method || '-'}</td>
              <td>{fmtRp(t.base)}</td>
              <td>{fmtRp(t.disc)}</td>
              <td><b>{fmtRp(trxNet(t))}</b></td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={colSpan} className="trx-empty">Tidak ada data yang tersedia</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Modal displaying full transaction history for a single kiosk. */
function KioskTrxModal({ summary, transactions, sessionByTrx, onClose }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return transactions
    return transactions.filter(t =>
      `${trxCode(t)} ${trxBiller(t)} ${t.method || ''} ${t.status || ''}`.toLowerCase().includes(needle)
    )
  }, [transactions, q])

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pg = Math.min(page, pages)
  const shown = filtered.slice((pg - 1) * PER_PAGE, pg * PER_PAGE)

  const exportKioskCsv = () => downloadCsv(
    `transaksi-${summary.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${iso(new Date())}.csv`,
    [
      ['No', 'ID Transaksi', 'ID Biller', 'Kiosk', 'Waktu', 'Status Transaksi', 'Status Sesi', 'Metode', 'Nominal', 'Diskon', 'Total'],
      ...filtered.map((t, i) => [
        i + 1, trxCode(t), trxBiller(t), summary.name, fd(t.at), t.status || '-',
        sessionByTrx.has(t.id) ? 'Selesai' : 'Belum ada sesi', t.method || '-',
        Number(t.base || 0), Number(t.disc || 0), trxNet(t)
      ])
    ]
  )

  return (
    <Modal title={`Detail Transaksi - ${summary.name}`} onClose={onClose} className="dlg-wide">
      <div className="trx-kstats">
        <div className="trx-kstat"><span>Total Transaksi</span><b>{summary.totalCount} transaksi</b></div>
        <div className="trx-kstat"><span>Gross Income</span><b>{fmtRp(summary.totalGross)}</b></div>
        <div className="trx-kstat"><span>Transaksi Hari Ini</span><b>{summary.todayCount} transaksi</b></div>
        <div className="trx-kstat"><span>Gross Income Hari Ini</span><b>{fmtRp(summary.todayGross)}</b></div>
      </div>
      <div className="trx-hd" style={{ marginBottom: 12 }}>
        <input
          className="trx-search wide"
          placeholder="ID Transaksi / ID Biller lengkap"
          aria-label="Cari transaksi kiosk"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
        />
        <button type="button" className="btn exp" onClick={exportKioskCsv}>
          <Download size={16} /> Export
        </button>
      </div>
      <TrxTable
        rows={shown}
        page={pg}
        kioskMap={{ [summary.id]: summary.name }}
        sessionByTrx={sessionByTrx}
        showKiosk={false}
      />
      <Pager total={filtered.length} page={pg} perPage={PER_PAGE} onChange={setPage} />
      <div className="cc" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn ghost" onClick={onClose}>Tutup</button>
      </div>
    </Modal>
  )
}

/** Transaction page: per-kiosk income summary (Daftar Kiosk) and today's transactions (Transaksi Hari Ini). */
export default function Transactions() {
  const { S } = useStore()
  const [kioskQ, setKioskQ] = useState('')
  const [kioskPage, setKioskPage] = useState(1)
  const [trxQ, setTrxQ] = useState('')
  const [trxPage, setTrxPage] = useState(1)
  const [selectedKioskId, setSelectedKioskId] = useState(null)

  const todayKey = iso(new Date())

  const { kioskMap, kioskRows, todayRows, sessionByTrx, trxByKiosk } = useMemo(() => {
    const kMap = Object.fromEntries(S.kiosks.map(k => [k.id, k.name]))
    const sMap = new Map()
    S.sessions.forEach(s => { if (s.trx) sMap.set(s.trx, s) })

    const byKiosk = new Map(S.kiosks.map(k => [k.id, []]))
    const today = []
    S.trx.forEach(t => {
      if (byKiosk.has(t.kiosk)) byKiosk.get(t.kiosk).push(t)
      else byKiosk.set(t.kiosk, [t])
      const d = new Date(t.at)
      if (!isNaN(d) && iso(d) === todayKey) today.push(t)
    })

    const summaries = S.kiosks.map(k => {
      const list = byKiosk.get(k.id) || []
      let totalCount = 0, totalGross = 0, todayCount = 0, todayGross = 0
      list.forEach(t => {
        if (t.status !== 'PAID') return
        const amt = trxNet(t)
        totalCount += 1
        totalGross += amt
        const d = new Date(t.at)
        if (!isNaN(d) && iso(d) === todayKey) {
          todayCount += 1
          todayGross += amt
        }
      })
      return { id: k.id, name: k.name, totalCount, totalGross, todayCount, todayGross }
    })

    return { kioskMap: kMap, kioskRows: summaries, todayRows: today, sessionByTrx: sMap, trxByKiosk: byKiosk }
  }, [S.kiosks, S.trx, S.sessions, todayKey])

  const filteredKiosks = useMemo(() => {
    const needle = kioskQ.trim().toLowerCase()
    if (!needle) return kioskRows
    return kioskRows.filter(k => k.name.toLowerCase().includes(needle))
  }, [kioskRows, kioskQ])

  const kPages = Math.max(1, Math.ceil(filteredKiosks.length / PER_PAGE))
  const kPg = Math.min(kioskPage, kPages)
  const shownKiosks = filteredKiosks.slice((kPg - 1) * PER_PAGE, kPg * PER_PAGE)

  const filteredToday = useMemo(() => {
    const needle = trxQ.trim().toLowerCase()
    if (!needle) return todayRows
    return todayRows.filter(t =>
      `${trxCode(t)} ${trxBiller(t)} ${kioskMap[t.kiosk] || ''}`.toLowerCase().includes(needle)
    )
  }, [todayRows, trxQ, kioskMap])

  const tPages = Math.max(1, Math.ceil(filteredToday.length / PER_PAGE))
  const tPg = Math.min(trxPage, tPages)
  const shownToday = filteredToday.slice((tPg - 1) * PER_PAGE, tPg * PER_PAGE)

  const selectedSummary = selectedKioskId ? kioskRows.find(k => k.id === selectedKioskId) : null

  const exportKiosks = () => downloadCsv(`daftar-kiosk-transaksi-${todayKey}.csv`, [
    ['Nama Kiosk', 'Total Transaksi', 'Gross Income', 'Transaksi Hari Ini', 'Gross Income Hari Ini'],
    ...filteredKiosks.map(r => [r.name, `${r.totalCount} transaksi`, r.totalGross, `${r.todayCount} transaksi`, r.todayGross])
  ])

  return (
    <>
      <section className="card trx-card">
        <div className="trx-hd">
          <h3>Daftar Kiosk</h3>
          <div className="cc">
            <input
              className="trx-search"
              placeholder="Nama Kiosk"
              aria-label="Cari Nama Kiosk"
              value={kioskQ}
              onChange={e => { setKioskQ(e.target.value); setKioskPage(1) }}
            />
            <button type="button" className="btn exp" onClick={exportKiosks}>
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        <div className="trx-note" role="note">
          <div className="trx-note-hd"><Info size={16} /><span>Catatan</span></div>
          <ul>
            <li>Income tercatat mulai tanggal 1 November 2026</li>
            <li>Gross Income adalah harga per kiosk atau penggunaan voucher berstatus berhasil</li>
            <li>Untuk Net Income, <b>cek biller yang digunakan</b></li>
          </ul>
        </div>

        <div className="tw">
          <table className="trx-kiosk-table">
            <thead>
              <tr>
                <th>Nama Kiosk</th>
                <th>Total Transaksi</th>
                <th>Gross Income</th>
                <th>Transaksi Hari Ini</th>
                <th>Gross Income Hari Ini</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shownKiosks.map(r => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.totalCount} transaksi</td>
                  <td>{fmtRp(r.totalGross)}</td>
                  <td>{r.todayCount} transaksi</td>
                  <td>{fmtRp(r.todayGross)}</td>
                  <td>
                    <button
                      type="button"
                      className="ic"
                      title={`Lihat transaksi ${r.name}`}
                      aria-label={`Lihat transaksi ${r.name}`}
                      onClick={() => setSelectedKioskId(r.id)}
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))}
              {!shownKiosks.length && (
                <tr><td colSpan="6" className="trx-empty">Tidak ada data yang tersedia</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager total={filteredKiosks.length} page={kPg} perPage={PER_PAGE} onChange={setKioskPage} />
      </section>

      <section className="card trx-card" style={{ marginTop: 18 }}>
        <div className="trx-hd">
          <h3>Transaksi Hari Ini</h3>
          <input
            className="trx-search wide"
            placeholder="ID Transaksi / ID Biller lengkap"
            aria-label="Cari ID Transaksi atau ID Biller"
            value={trxQ}
            onChange={e => { setTrxQ(e.target.value); setTrxPage(1) }}
          />
        </div>

        <TrxTable rows={shownToday} page={tPg} kioskMap={kioskMap} sessionByTrx={sessionByTrx} />

        <Pager total={filteredToday.length} page={tPg} perPage={PER_PAGE} onChange={setTrxPage} />
      </section>

      {selectedSummary && (
        <KioskTrxModal
          summary={selectedSummary}
          transactions={trxByKiosk.get(selectedSummary.id) || []}
          sessionByTrx={sessionByTrx}
          onClose={() => setSelectedKioskId(null)}
        />
      )}
    </>
  )
}

