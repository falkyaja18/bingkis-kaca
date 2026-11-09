// Photobooth Web Master (Node.js + Express + WebSocket)
// - REST admin (dashboard) & REST kiosk, WebSocket RDM (/ws/kiosk), telemetri heartbeat, failsave-ingest, halaman QR publik
// - Penyimpanan: data/db.json + uploads/ (ganti ke PostgreSQL/S3 lewat server/schema.sql, lihat TUTORIAL)
const express = require('express'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws'), multer = require('multer');
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin', ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const DATA = path.join(__dirname, 'data'), DB = path.join(DATA, 'db.json'), UP = path.join(__dirname, 'uploads');
[DATA, path.join(UP, 'frames'), path.join(UP, 'sessions'), path.join(UP, 'assets')].forEach(d => fs.mkdirSync(d, { recursive: true }));

const uid = () => crypto.randomBytes(5).toString('hex');
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const def = () => ({
  branches: [],
  kiosks: [{ id: uid(), name: 'Kiosk 1', lang: 'ID', code: 'KIOSK-0001', branch: '', activated: false, lastSync: '', token: '' }],
  galleries: [], frames: [], vouchers: [], trx: [], sessions: [],
  soft: { accent: '#6c4cf5', bg: '#ffffff', ig: '', tt: '', footer: 'Terima kasih sudah berfoto!', logo: '' },
  pay: { provider: 'QRIS', merchant: '', apikey: '', secret: '', mode: 'sandbox', price: 35000 }
});
let S; try { S = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) { S = def(); }
S.branches = S.branches || [];
const save = () => { fs.writeFileSync(DB + '.tmp', JSON.stringify(S)); fs.renameSync(DB + '.tmp', DB); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataBuf = d => Buffer.from(String(d).split(',')[1] || '', 'base64');
const clean = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '');

// Slot foto otomatis (strip vertikal). Sama dengan dashboard/src/utils.js
const slots = f => {
  // layout kustom (hasil editor slot / deteksi PNG): tiap slot menunjuk nomor foto (capture). Beberapa slot boleh memakai foto yang sama.
  if (Array.isArray(f.customSlots) && f.customSlots.length)
    return f.customSlots.map((s, i) => ({ slot_index: i + 1, x: s.x, y: s.y, width: s.width, height: s.height, rotation: 0, capture: s.capture ?? i }));
  const n = f.caps, pad = Math.round(f.w * .0625), gap = 30, top = Math.round(f.h * .067), h = Math.floor((f.h - top * 2 - gap * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => ({ slot_index: i + 1, x: pad, y: top + i * (h + gap), width: f.w - pad * 2, height: h, rotation: 0, capture: i }));
};

const app = express();
app.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,authorization,x-kiosk-token,x-kiosk-id', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
  if (req.method === 'OPTIONS') return res.sendStatus(204); next();
});
app.use(express.json({ limit: '60mb' }));
app.use('/uploads', express.static(UP));
app.use('/kiosk', express.static(path.join(__dirname, '..', 'kiosk', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'dashboard', 'dist')));

/* ================= TELEMETRI & RDM (pengganti Redis: disimpan di memori proses) ================= */
const live = new Map();          // kioskId -> { ws, hb, lastSeen, sync }
const pendingCmd = new Map();    // cmdId -> { resolve, timer }
const alerts = [];               // alert terbaru di depan (maks 50)
const persistAt = new Map();
const ONLINE_MS = 45000;

function touch(kid, hb) {
  const l = live.get(kid) || {}; if (hb) l.hb = hb; l.lastSeen = Date.now(); live.set(kid, l);
  const k = S.kiosks.find(x => x.id === kid);
  if (k && Date.now() - (persistAt.get(kid) || 0) > 60000) { // simpan ke disk paling sering 1x/menit
    persistAt.set(kid, Date.now()); k.lastSeen = new Date().toISOString(); if (hb && hb.appVersion) k.appVersion = hb.appVersion; save();
  }
  return l;
}
function health(k) {
  const l = live.get(k.id) || {}, hb = l.hb || {}, on = !!l.lastSeen && Date.now() - l.lastSeen < ONLINE_MS;
  return { id: k.id, name: k.name, activated: k.activated, online: on, wsConnected: !!(l.ws && l.ws.readyState === 1),
    appVersion: hb.appVersion || k.appVersion || '', printerStatus: on ? (hb.printerStatus || 'unknown') : 'offline',
    paperRemaining: hb.paperRemaining ?? null, cameraConnected: on ? !!hb.cameraConnected : false, pendingFailsave: hb.pendingFailsaveCount ?? 0,
    cpu: hb.cpuPercent ?? null, ramFreeMb: hb.ramFreeMb ?? null, diskFreeGb: hb.diskFreeGb ?? null, uptimeSec: hb.uptimeSec ?? null,
    syncProgress: l.sync || null, lastSeen: l.lastSeen ? new Date(l.lastSeen).toISOString() : (k.lastSeen || '') };
}
function sendCmd(kid, event, payload, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const l = live.get(kid);
    if (!l || !l.ws || l.ws.readyState !== 1) return reject({ code: 409, error: 'Kiosk offline (WebSocket tidak terhubung)' });
    const cmdId = uid(), timer = setTimeout(() => { pendingCmd.delete(cmdId); reject({ code: 504, error: 'Kiosk tidak membalas (timeout)' }); }, timeout);
    pendingCmd.set(cmdId, { resolve, timer });
    l.ws.send(JSON.stringify({ cmdId, event, payload: payload || {} }));
  });
}
const pushConfig = () => live.forEach((l, id) => {
  const k = S.kiosks.find(x => x.id === id);
  if (k && l.ws && l.ws.readyState === 1)
    l.ws.send(JSON.stringify({ event: 'rdm:kiosk:update_config', payload: { refresh: true } }));
});

/* ================= ADMIN ================= */
const tokens = new Set();
app.post('/api/v1/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) { const t = crypto.randomBytes(24).toString('hex'); tokens.add(t); return res.json({ token: t, username }); }
  res.status(401).json({ error: 'invalid' });
});
const adm = (req, res, next) => tokens.has((req.get('authorization') || '').slice(7)) ? next() : res.status(401).json({ error: 'unauthorized' });
const pub = s => { const c = JSON.parse(JSON.stringify(s)); c.kiosks.forEach(k => delete k.token); return c; };
app.get('/api/v1/admin/state', adm, (req, res) => res.json(pub(S)));
app.get('/api/v1/admin/overview', adm, (req, res) => res.json({ now: Date.now(), health: S.kiosks.map(health), alerts: alerts.slice(0, 20) }));

const OWN = { kiosks: ['activated', 'lastSync', 'token', 'lastSeen', 'appVersion'], frames: ['asset', 'checksum'], vouchers: ['used'] };
const OWN_DEF = { activated: false, used: 0 };
app.put('/api/v1/admin/master', adm, (req, res) => {
  const b = req.body || {};
  ['branches', 'kiosks', 'galleries', 'frames', 'vouchers'].forEach(k => {
    if (!Array.isArray(b[k])) return;
    const old = Object.fromEntries((S[k] || []).map(x => [x.id, x]));
    S[k] = b[k].map(n => {
      n.id = clean(n.id) || uid();
      const o = old[n.id];
      (OWN[k] || []).forEach(f => {
        if (k === 'frames' && (f === 'asset' || f === 'checksum') && n[f]) return; // Pertahankan asset/checksum jika dikirim dari SlotEditor/duplikasi
        n[f] = o ? o[f] : (f in OWN_DEF ? OWN_DEF[f] : '');
      });
      return n;
    });
  });
  if (b.soft) S.soft = b.soft;
  if (b.pay) S.pay = b.pay;
  save(); pushConfig(); res.json({ ok: true });
});
app.post('/api/v1/admin/frames/:id/asset', adm, (req, res) => {
  const f = S.frames.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'frame not found' });
  const d = (req.body || {}).data || '', ext = /^data:image\/gif/.test(d) ? 'gif' : 'png', buf = dataBuf(d), dir = path.join(UP, 'frames');
  fs.readdirSync(dir).filter(n => n.startsWith(f.id + '.')).forEach(n => fs.unlinkSync(path.join(dir, n)));
  fs.writeFileSync(path.join(dir, f.id + '.' + ext), buf);
  f.checksum = crypto.createHash('md5').update(buf).digest('hex'); f.asset = `/uploads/frames/${f.id}.${ext}?v=${f.checksum}`;
  save(); res.json({ asset: f.asset, checksum: f.checksum });
});
// Upload aset tema event (gambar background, video idle, logo). Mengembalikan URL bertanda checksum.
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
app.post('/api/v1/admin/assets', adm, (req, res) => {
  const d = (req.body || {}).data || '', ext = MIME[(/^data:([^;]+);/.exec(d) || [])[1]];
  if (!ext) return res.status(400).json({ error: 'tipe file tidak didukung (png/jpg/webp/gif/mp4/webm)' });
  const buf = dataBuf(d), id = uid(), md5 = crypto.createHash('md5').update(buf).digest('hex');
  fs.writeFileSync(path.join(UP, 'assets', `${id}.${ext}`), buf);
  res.json({ url: `/uploads/assets/${id}.${ext}?v=${md5}` });
});
const CMDS = ['rdm:kiosk:test_print', 'rdm:kiosk:last_print', 'rdm:kiosk:reload', 'rdm:kiosk:minimize', 'rdm:kiosk:camera_test', 'rdm:kiosk:update_config', 'rdm:kiosk:force_sync'];
app.post('/api/v1/admin/kiosks/:id/command', adm, async (req, res) => {
  const { event, payload } = req.body || {};
  if (!CMDS.includes(event)) return res.status(400).json({ error: 'event tidak dikenal' });
  try { res.json({ ok: true, result: await sendCmd(req.params.id, event, payload) }); }
  catch (e) { res.status(e.code || 500).json({ ok: false, error: e.error || String(e) }); }
});

/* ================= KIOSK ================= */
const K = '/api/v1/kiosk';
app.get(K + '/healthcheck', (req, res) => res.json({ ok: true, time: Date.now() }));
app.post(K + '/activate', (req, res) => {
  const k = S.kiosks.find(x => x.code === String((req.body || {}).code || '').trim());
  if (!k) return res.status(404).json({ error: 'Kode aktivasi tidak ditemukan' });
  k.activated = true; k.token = k.token || crypto.randomBytes(16).toString('hex'); save();
  res.json({ token: k.token, kiosk_id: k.id, name: k.name });
});
const kioskByToken = t => S.kiosks.find(x => x.token && x.token === t);
const kau = (req, res, next) => {
  const t = req.get('x-kiosk-token') || (req.get('authorization') || '').replace(/^Bearer /, '');
  const k = kioskByToken(t); if (!k) return res.status(401).json({ error: 'Kiosk belum diaktivasi' }); req.k = k; next();
};
app.post(K + '/heartbeat', kau, (req, res) => { touch(req.k.id, req.body || {}); res.json({ ok: true }); }); // cadangan bila WebSocket tidak tersedia
app.get(K + '/sync', kau, (req, res) => {
  const k = req.k, now = Date.now(); k.lastSync = new Date().toISOString(); touch(k.id); save();
  const g = S.galleries.find(g => g.kiosk === k.id && g.active && (!g.start || new Date(g.start) <= now) && (!g.end || now <= new Date(g.end))) || null;
  const settings = k.settings || {}, selectedFrames = settings.frames && Array.isArray(settings.frames.selectedIds)
    ? new Set(settings.frames.selectedIds) : null;
  const payment = settings.payment || {}, price = Number.isFinite(Number(payment.price)) ? Number(payment.price) : S.pay.price;
  res.json({
    status: 'success', price, kiosk_settings: settings,
    kiosk_info: { id: k.id, name: k.name, language: k.lang, active_public_gallery: g && { id: g.id, event_name: g.name, public_url: '/e/' + g.slug, active_until: g.until } },
    frames: S.frames.filter(f => f.active && (!selectedFrames || selectedFrames.has(f.id))).map(f => ({ id: f.id, title: f.title, type: f.type, asset_url: f.asset || '', checksum_md5: f.checksum || '',
      slots_config: { canvas_width: f.w, canvas_height: f.h, total_captures: f.caps, slots: slots(f) } })),
    softfile_ui: S.soft,
    event_theme: g && { background_url: g.bg || '', idle_video_url: g.idle || '', logo_url: g.logo || '', accent: g.accent || '', start_text: g.startText || '', footer_text: g.footerText || '' }
  });
});
const vfind = c => { const v = S.vouchers.find(v => v.code === String(c || '').toUpperCase().trim());
  return v && v.active && v.used < v.max && (!v.until || new Date(v.until) > Date.now()) ? v : null; };
const disc = (v, p) => v.dtype === 'PERCENTAGE' ? Math.round(p * v.val / 100) : v.dtype === 'FIXED' ? Math.min(v.val, p) : p;
app.post(K + '/vouchers/validate', kau, (req, res) => {
  const v = vfind((req.body || {}).code); if (!v) return res.json({ valid: false });
  const configuredPrice = Number(req.k.settings?.payment?.price), p = Number.isFinite(configuredPrice) ? configuredPrice : S.pay.price;
  const d = disc(v, p); res.json({ valid: true, discount_type: v.dtype, discount_amount: d, final_amount: p - d });
});
// CATATAN: QRIS masih SIMULASI (langsung PAID). Sambungkan payment gateway di endpoint ini.
app.post(K + '/transactions', kau, (req, res) => {
  const b = req.body || {}, payment = req.k.settings?.payment || {}, configuredPrice = Number(payment.price);
  const p = Number.isFinite(configuredPrice) ? configuredPrice : S.pay.price; let v = null, d = 0;
  if (payment.disablePaywall) return res.status(409).json({ error: 'Pembayaran tidak diperlukan untuk kiosk ini' });
  if (payment.voucherOnly && !b.voucherCode) return res.status(400).json({ error: 'Kiosk ini hanya menerima voucher' });
  if (b.voucherCode) { v = vfind(b.voucherCode); if (!v) return res.status(400).json({ error: 'Voucher tidak valid' }); d = disc(v, p); v.used++; }
  const t = { id: uid(), inv: 'INV-' + String(S.trx.length + 1).padStart(4, '0'), kiosk: req.k.id, gallery: b.galleryId || null, voucher: v ? v.id : null,
    method: p - d === 0 ? 'VOUCHER' : 'QRIS', base: p, disc: d, status: 'PAID', at: new Date().toISOString() };
  S.trx.unshift(t); save(); res.json({ transaction: t });
});

function saveSession(k, o) { // o: {code, galleryId, trxId, composite:Buffer, gif?:Buffer, raws:Buffer[], prints, createdAt}
  const dir = path.join(UP, 'sessions', o.code); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'composite.jpg'), o.composite);
  if (o.gif) fs.writeFileSync(path.join(dir, 'strip.gif'), o.gif);
  if (o.live) fs.writeFileSync(path.join(dir, 'live.mp4'), o.live);
  (o.extras || []).forEach((r, i) => fs.writeFileSync(path.join(dir, `extra${i + 1}.jpg`), r)); // retake / foto yang tidak dipilih
  const raws = (o.raws || []).map((r, i) => { fs.writeFileSync(path.join(dir, `raw${i + 1}.jpg`), r); return `/uploads/sessions/${o.code}/raw${i + 1}.jpg`; });
  const g = S.galleries.find(x => x.id === o.galleryId);
  const exp = g && g.until ? new Date(g.until).toISOString() : new Date(Date.now() + 30 * 864e5).toISOString();
  const rec = { code: o.code, kiosk: k.id, gallery: o.galleryId || null, trx: o.trxId || null, composite: `/uploads/sessions/${o.code}/composite.jpg`,
    gif: o.gif ? `/uploads/sessions/${o.code}/strip.gif` : '', live: o.live ? `/uploads/sessions/${o.code}/live.mp4` : '', raws, prints: o.prints || 0, createdAt: o.createdAt || new Date().toISOString(), expiredAt: exp };
  const i = S.sessions.findIndex(s => s.code === o.code); if (i < 0) S.sessions.unshift(rec); else S.sessions[i] = rec;
  save(); return rec;
}
// Unggah JSON (dipakai versi web/browser dari kiosk)
app.post(K + '/galleries/upload', kau, (req, res) => {
  const b = req.body || {}, code = clean(b.sessionCode);
  if (!code || !b.composite) return res.status(400).json({ error: 'invalid' });
  saveSession(req.k, { code, galleryId: b.galleryId, trxId: b.transactionId, composite: dataBuf(b.composite), raws: (b.raws || []).map(dataBuf), prints: b.printCount, createdAt: b.createdAt });
  res.json({ ok: true, url: '/s/' + code });
});
// Failsave ingest (multipart) dari Electron kiosk: manifest + photo (+ gif, raws). Idempotent per sessionCode.
const upl = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });
app.post('/api/v1/sync/failsave-ingest', kau, upl.fields([{ name: 'photo', maxCount: 1 }, { name: 'gif', maxCount: 1 }, { name: 'raws', maxCount: 12 }, { name: 'live', maxCount: 1 }, { name: 'extras', maxCount: 24 }]), (req, res) => {
  let m; try { m = JSON.parse(req.body.manifest); } catch (e) { return res.status(400).json({ error: 'manifest tidak valid' }); }
  const f = req.files || {}, photo = f.photo && f.photo[0], code = clean(m.sessionCode || m.transactionUuid);
  if (!code || !photo) return res.status(400).json({ error: 'photo/sessionCode wajib' });
  const want = m.files && m.files.photoHighRes && m.files.photoHighRes.sha256;
  if (want && sha256(photo.buffer) !== want) return res.status(422).json({ error: 'checksum foto tidak cocok' });
  let trxId = m.trxId && S.trx.find(t => t.id === m.trxId) ? m.trxId : null;
  const pd = m.paymentDetails || {};
  if (!trxId && pd.amount > 0 && !S.trx.find(t => t.client === m.transactionUuid)) {
    const t = { id: uid(), inv: 'INV-' + String(S.trx.length + 1).padStart(4, '0'), kiosk: req.k.id, gallery: m.galleryId || null, voucher: null, method: pd.paymentMethod || 'QRIS',
      base: pd.amount, disc: 0, status: 'PAID', at: m.timestamp || new Date().toISOString(), client: m.transactionUuid };
    S.trx.unshift(t); trxId = t.id;
  }
  saveSession(req.k, { code, galleryId: m.galleryId, composite: photo.buffer, gif: f.gif && f.gif[0].buffer, live: f.live && f.live[0].buffer, raws: (f.raws || []).map(x => x.buffer), extras: (f.extras || []).map(x => x.buffer), prints: m.printCount, createdAt: m.timestamp });
  res.json({ acknowledged: true, url: '/s/' + code });
});

/* ================= HALAMAN PUBLIK (tema dari Soft File UI) ================= */
const lum = h => { const n = parseInt(String(h).slice(1), 16) || 0; return ((n >> 16) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000; };
const page = (title, body) => { const t = S.soft, ink = lum(t.bg) > 150 ? '#111' : '#fff', ai = lum(t.accent) > 150 ? '#111' : '#fff';
  const soc = [t.ig && `<a href="https://instagram.com/${esc(t.ig.replace('@', ''))}">Instagram ${esc(t.ig)}</a>`, t.tt && `<a href="https://tiktok.com/@${esc(t.tt.replace('@', ''))}">TikTok ${esc(t.tt)}</a>`].filter(Boolean).join(' &nbsp; ');
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:${t.bg};color:${ink};font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:inherit}img{max-width:100%;border-radius:10px}
.btn{display:inline-block;background:${t.accent};color:${ai};padding:12px 28px;border-radius:24px;text-decoration:none;margin:8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-width:900px;margin:0 auto}</style></head>
<body>${t.logo ? `<img src="${t.logo}" alt="" style="max-height:56px">` : ''}<h2>${esc(title)}</h2>${body}<p>${esc(t.footer)}</p><p>${soc}</p></body></html>`; };
app.get('/s/:code', (req, res) => {
  const s = S.sessions.find(x => x.code === req.params.code);
  if (!s || new Date(s.expiredAt) < Date.now()) return res.status(404).send(page('Foto tidak ditemukan', '<p>Foto tidak ada atau sudah kedaluwarsa.</p>'));
  res.send(page('Foto kamu', `<img src="${s.composite}" alt="Hasil foto" style="max-width:420px;width:100%"><br><a class="btn" href="${s.composite}" download="photo-${s.code}.jpg">Unduh foto</a>` +
    (s.live ? `<br><video src="${s.live}" autoplay loop muted playsinline controls style="max-width:300px;border-radius:10px"></video><br><a class="btn" href="${s.live}" download="live-${s.code}.mp4">Unduh Live Photo</a>` : '') +
    (s.gif ? `<br><img src="${s.gif}" alt="GIF" style="max-width:300px"><br><a class="btn" href="${s.gif}" download="photo-${s.code}.gif">Unduh GIF</a>` : '')));
});
app.get('/e/:slug', (req, res) => {
  const g = S.galleries.find(x => x.slug === req.params.slug);
  if (!g || new Date(g.until) < Date.now()) return res.status(404).send(page('Galeri tidak ditemukan', '<p>Galeri tidak ada atau sudah berakhir.</p>'));
  res.send(page(g.name, `<div class="g">${S.sessions.filter(s => s.gallery === g.id).map(s => `<a href="/s/${s.code}"><img src="${s.composite}" alt=""></a>`).join('') || '<p>Belum ada foto.</p>'}</div>`));
});

/* ================= Hapus otomatis foto kedaluwarsa ================= */
function purge() {
  const now = Date.now(), keep = [];
  S.sessions.forEach(s => { if (new Date(s.expiredAt) < now) fs.rmSync(path.join(UP, 'sessions', s.code), { recursive: true, force: true }); else keep.push(s); });
  if (keep.length !== S.sessions.length) { S.sessions = keep; save(); }
}
purge(); setInterval(purge, 6 * 3600e3);

/* ================= HTTP + WebSocket ================= */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/kiosk' });
wss.on('connection', (ws, req) => {
  const u = new URL(req.url, 'http://x'), k = kioskByToken(u.searchParams.get('token'));
  if (!k) return ws.close(4401, 'unauthorized');
  const l = touch(k.id); if (l.ws && l.ws !== ws && l.ws.readyState === 1) l.ws.close(4000, 'replaced'); l.ws = ws; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    touch(k.id);
    if (m.cmdId && pendingCmd.has(m.cmdId)) { const p = pendingCmd.get(m.cmdId); clearTimeout(p.timer); pendingCmd.delete(m.cmdId); return p.resolve(m); }
    if (m.event === 'rdm:telemetry:heartbeat') touch(k.id, m.payload);
    else if (m.event === 'rdm:kiosk:error_alert') { alerts.unshift({ kioskId: k.id, kiosk: k.name, ...m.payload, at: new Date().toISOString() }); alerts.length = Math.min(alerts.length, 50); }
    else if (m.event === 'rdm:sync:batch_progress') (live.get(k.id) || {}).sync = m.payload;
  });
  ws.on('close', () => { const c = live.get(k.id); if (c && c.ws === ws) c.ws = null; });
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 30000);

server.listen(PORT, '0.0.0.0', () => console.log(`Photobooth server jalan di http://localhost:${PORT}  (login: ${ADMIN_USER} / ${ADMIN_PASS})`));