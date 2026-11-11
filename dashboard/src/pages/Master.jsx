import Crud, { Badge } from '../Crud.jsx'
import { useStore } from '../store.jsx'
import { uid, rp, fd } from '../utils.js'

export { default as Kiosks } from './KioskMaster.jsx'
export { default as PublicGalleries } from './PublicGalleries.jsx'
export { default as Frames } from './Frames.jsx'

/* ---------- Branch Manager ---------- */
export function Branches() {
  const { S, update } = useStore()
  return (
    <Crud title="Branch Manager" all={S.branches} rows={S.branches}
      note="Cabang / lokasi usaha. Kiosk dikelompokkan per cabang."
      cols={[{ h: 'Nama', f: r => <b>{r.name}</b> }, { h: 'Alamat', f: r => r.address || '-' }, { h: 'Kontak', f: r => [r.contact_person, r.contact_phone].filter(Boolean).join(' · ') || '-' },
        { h: 'Kiosk', f: r => S.kiosks.filter(k => k.branch === r.id).length }, { h: 'Status', f: r => <Badge on={r.active} /> }]}
      fields={[{ k: 'name', l: 'Nama cabang', r: 1 }, { k: 'address', l: 'Alamat' }, { k: 'contact_person', l: 'Nama kontak' }, { k: 'contact_phone', l: 'Telepon' }, { k: 'active', l: 'Aktif', t: 'check' }]}
      defaults={() => ({ id: uid(), name: '', address: '', contact_person: '', contact_phone: '', active: true })}
      onChange={v => update({ branches: v })} />
  )
}

/* ---------- Voucher ---------- */
export function Vouchers() {
  const { S, update } = useStore()
  return (
    <Crud title="Voucher" all={S.vouchers} rows={S.vouchers}
      cols={[
        { h: 'Kode', f: r => <code>{r.code}</code> }, { h: 'Tipe', f: r => r.dtype },
        { h: 'Nilai', f: r => r.dtype === 'PERCENTAGE' ? r.val + '%' : r.dtype === 'FIXED' ? rp(r.val) : '-' },
        { h: 'Terpakai', f: r => `${r.used ?? 0}/${r.max}` }, { h: 'Berlaku sampai', f: r => fd(r.until) }, { h: 'Status', f: r => <Badge on={r.active} /> }
      ]}
      fields={[
        { k: 'code', l: 'Kode voucher', r: 1 }, { k: 'dtype', l: 'Tipe diskon', t: 'select', o: ['PERCENTAGE', 'FIXED', 'FREE_SESSION'] },
        { k: 'val', l: 'Nilai diskon (% atau Rp)', t: 'number' }, { k: 'max', l: 'Kuota pemakaian', t: 'number', r: 1 },
        { k: 'until', l: 'Berlaku sampai', t: 'datetime-local', r: 1 }, { k: 'active', l: 'Aktif', t: 'check' }
      ]}
      defaults={() => ({ id: uid(), code: '', dtype: 'PERCENTAGE', val: 10, max: 50, used: 0, until: '', active: true })}
      beforeSave={n => ({ ...n, code: n.code.toUpperCase().replace(/\s/g, '') })}
      onChange={v => update({ vouchers: v })} />
  )
}
