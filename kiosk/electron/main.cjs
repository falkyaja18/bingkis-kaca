// MAIN PROCESS: satu-satunya pengendali OS (file, ffmpeg, printer, kamera, WebSocket RDM, sync failsave)
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron')
const path = require('path'), fs = require('fs'), fsp = fs.promises, os = require('os')
const { pathToFileURL } = require('url')
const makePaths = require('./paths.cjs'), { FailsaveEngine } = require('./failsave.cjs'), ff = require('./ffmpeg.cjs'), hw = require('./hardware.cjs'), { Rdm } = require('./rdm.cjs')

const DEV = !!process.env.ELECTRON_RENDERER_URL
const VERSION = 'v' + app.getVersion()
protocol.registerSchemesAsPrivileged([{ scheme: 'photolab-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
if (!app.requestSingleInstanceLock()) app.quit()

let win, P, cfg, state, engine, rdm
const cfgFile = () => path.join(app.getPath('userData'), 'config.json'), stateFile = () => path.join(app.getPath('userData'), 'state.json')
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const writeJson = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 2)); fs.renameSync(f + '.tmp', f) }
const FF = () => ff.ffmpegPath(process.resourcesPath)
const log = (...a) => console.log('[kiosk]', ...a)

/* ---------- indeks sesi (print/index.json), terbaru di depan ---------- */
const idxFile = () => path.join(P.print, 'index.json')
const readIdx = () => readJson(idxFile(), [])
const writeIdx = a => writeJson(idxFile(), a)

/* ---------- cetak ---------- */
const PAGE = { '4x6': [101600, 152400], '6x8': [152400, 203200], '5x7': [127000, 177800] }
async function printFile(file, copies = 1) {
  const count = Number(copies)
  if (!Number.isInteger(count) || count < 1) throw new Error('jumlah cetak tidak valid')
  const printers = await win.webContents.getPrintersAsync()
  if (!printers.length) throw new Error('printer tidak terdeteksi')
  if (cfg.printer && !printers.some(printer => printer.name === cfg.printer))
    throw new Error(`printer "${cfg.printer}" tidak tersedia`)
  const html = path.join(P.temp, 'print_job.html')
  await fsp.writeFile(html, `<!doctype html><style>@page{margin:0}body{margin:0}img{width:100%;display:block}</style><img src="${pathToFileURL(file).href}">`)
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await w.loadFile(html)
    const [pw, ph] = PAGE[cfg.paper] || PAGE['4x6']
    await new Promise((ok, no) => w.webContents.print({ silent: true, printBackground: true, deviceName: cfg.printer || '', copies: count, margins: { marginType: 'none' }, pageSize: { width: pw, height: ph } }, (success, why) => success ? ok() : no(new Error(why || 'print gagal'))))
    state.paperRemaining = Math.max(0, (state.paperRemaining ?? state.paperCap) - count); writeJson(stateFile(), state)
  } finally { w.destroy() }
}

/* ---------- sesi ---------- */
async function finalizeSession(p) {
  const code = String(p.code).replace(/[^A-Za-z0-9_-]/g, ''), tmp = path.join(P.temp, 'session_' + code)
  await fsp.mkdir(tmp, { recursive: true })
  const raws = [], pathRaws = new Set()
  for (let i = 0; i < p.raws.length; i++) {
    const f = path.join(tmp, `raw_${String(i + 1).padStart(2, '0')}.jpg`), r = p.raws[i]
    if (r.dataUrl) await fsp.writeFile(f, Buffer.from(r.dataUrl.split(',')[1], 'base64')); else { await fsp.copyFile(r.path, f); pathRaws.add(f) } // raw dari DSLR perlu mirror/rotasi
    raws.push(f)
  }
  const extras = []
  for (let i = 0; i < (p.extras || []).length; i++) { // retake / foto yang tidak dipilih ikut disimpan
    const e = p.extras[i], f = path.join(tmp, `extra_${i + 1}.jpg`)
    if (e.dataUrl) await fsp.writeFile(f, Buffer.from(e.dataUrl.split(',')[1], 'base64')); else await fsp.copyFile(e.path, f)
    extras.push(f)
  }
  let live = null // Live Photo: frame preview beberapa detik sebelum jepretan -> MP4
  if ((p.live || []).length) {
    const ld = path.join(tmp, 'live'); await fsp.mkdir(ld, { recursive: true })
    await Promise.all(p.live.map((d, i) => fsp.writeFile(path.join(ld, `f_${String(i + 1).padStart(4, '0')}.jpg`), Buffer.from(d.split(',')[1], 'base64'))))
    const liveOut = path.join(P.print, `tx_${code}_live.mp4`)
    try { await ff.makeLive(FF(), { pattern: path.join(ld, 'f_%04d.jpg'), out: liveOut }); live = liveOut } catch (e) { log('live gagal', e.message) }
  }
  const sc = p.frame.slots_config, frameFile = ['png', 'gif'].map(e => path.join(P.frames, p.frame.id + '.' + e)).find(f => fs.existsSync(f))
  const printOut = path.join(P.print, `tx_${code}_print.jpg`), gifOut = path.join(P.print, `tx_${code}_strip.gif`)
  const opt = { mirror: cfg.mirrorRes, rot180: cfg.rot180, effect: p.photoFilter }
  // webcam sudah ditransformasi di renderer; DSLR (path) ditransformasi di ffmpeg. Untuk sederhana: terapkan hanya jika semua raw berasal dari path.
  const apply = { ...(pathRaws.size === raws.length ? opt : {}), effect: p.photoFilter }
  await ff.composite(FF(), { raws, slots: sc.slots, w: sc.canvas_width, h: sc.canvas_height, frame: frameFile && path.extname(frameFile) === '.png' ? frameFile : null, out: printOut, ...apply })
  let gif = null
  try { await ff.makeGif(FF(), { raws, out: gifOut, ...apply }); gif = gifOut } catch (e) { log('gif gagal', e.message) }
  const pd = p.trx ? { amount: p.trx.base - p.trx.disc, paymentMethod: p.trx.method, voucherCode: p.trx.voucherCode, referenceNo: p.trx.inv } : { amount: 0, paymentMethod: 'EVENT', referenceNo: '' }
  const ts = new Date().toISOString()
  // 1) simpan ke failsave dulu (zero data loss), 2) cetak, 3) daemon mengunggah di latar belakang
  await engine.save({ transactionUuid: code, sessionCode: code, kioskId: cfg.kioskId || '', galleryId: p.galleryId || null, trxId: p.trx ? p.trx.id : null, timestamp: ts, paymentDetails: pd, printCount: 1 }, { photo: printOut, gif, live, raws, extras })
  const idx = readIdx().filter(item => item.code !== code); idx.unshift({ code, createdAt: ts, prints: 0, gif: !!gif }); writeIdx(idx)
  await printFile(printOut, cfg.copies || 1)
  const printed = readIdx(), current = printed.find(item => item.code === code)
  if (current) { current.prints = cfg.copies || 1; writeIdx(printed) }
  fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
  trimPrint()
  if (cfg.mode === 'normal' && cfg.token) engine.triggerBatchSync().catch(() => {})
  return { code, composite: 'photolab-file://print/' + path.basename(printOut), gif: gif ? 'photolab-file://print/' + path.basename(gifOut) : '', live: live ? 'photolab-file://print/' + path.basename(live) : '' }
}
function trimPrint() { // retensi bergulir: maks. 500 sesi / 7 hari (FIFO)
  const keep = [], cut = Date.now() - 7 * 864e5
  readIdx().forEach((e, i) => { if (i < 500 && new Date(e.createdAt).getTime() > cut) keep.push(e); else for (const f of [`tx_${e.code}_print.jpg`, `tx_${e.code}_strip.gif`, `tx_${e.code}_live.mp4`]) fs.rmSync(path.join(P.print, f), { force: true }) })
  writeIdx(keep)
}
async function scavenge() { // sesi yatim di temp/ > 30 menit
  for (const n of await fsp.readdir(P.temp).catch(() => [])) { const f = path.join(P.temp, n); const st = await fsp.stat(f).catch(() => null); if (st && n.startsWith('session_') && Date.now() - st.mtimeMs > 30 * 60e3) fsp.rm(f, { recursive: true, force: true }) }
}
async function listSessions() {
  const pend = new Map((await engine.list()).map(m => [m.sessionCode, m]))
  return readIdx().map(e => { const m = pend.get(e.code); return { code: e.code, createdAt: e.createdAt, prints: e.prints, composite: 'photolab-file://print/tx_' + e.code + '_print.jpg', sync: m ? (m.lastError ? 'FAILED' : 'PENDING') : 'SYNCED', retryCount: m ? m.retryCount : 0, lastError: m ? m.lastError : '' } })
}

/* ---------- telemetri & RDM ---------- */
let rep = { cameraConnected: false }, lastPrinter = 'unknown', lastAlert = {}
async function heartbeat() {
  const [printerStatus, pending, disk] = [await hw.printerStatus(cfg.printer), await engine.pendingCount(), await hw.diskFreeGb(P.root)]
  const camera = cfg.camDriver && cfg.camDriver !== 'webcam' ? await hw.detectCamera(cfg.camDriver, cfg) : rep.cameraConnected
  lastPrinter = printerStatus
  const p = { kioskId: cfg.kioskId || '', cpuPercent: hw.cpuPercent(), ramFreeMb: Math.round(os.freemem() / 1048576), diskFreeGb: disk, paperRemaining: state.paperRemaining ?? state.paperCap, printerStatus, cameraConnected: camera, pendingFailsaveCount: pending, appVersion: VERSION, uptimeSec: Math.round(process.uptime()) }
  const alert = (code, on) => { if (on && !lastAlert[code]) rdm.send('rdm:kiosk:error_alert', { errorCode: code, severity: 'CRITICAL', timestamp: new Date().toISOString() }); lastAlert[code] = on }
  alert('PRINTER_OUT_OF_PAPER', printerStatus === 'PRINTER_OUT_OF_PAPER'); alert('CAMERA_DISCONNECTED', !camera); alert('DISK_CRITICAL', disk != null && disk < 2)
  if (!rdm.send('rdm:telemetry:heartbeat', p) && cfg.server && cfg.token) fetch(cfg.server + '/api/v1/kiosk/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kiosk-token': cfg.token }, body: JSON.stringify(p) }).catch(() => {})
}
const handlers = {
  'rdm:kiosk:test_print': async () => { const t = Date.now(), f = path.join(P.temp, 'test_pattern.jpg'); await ff.testPattern(FF(), f); await printFile(f, 1); return { success: true, jobDurationMs: Date.now() - t, paperLeft: state.paperRemaining } },
  'rdm:kiosk:last_print': async () => { const e = readIdx()[0]; if (!e) throw new Error('belum ada cetakan'); await printFile(path.join(P.print, `tx_${e.code}_print.jpg`), 1); return { txId: e.code, printedAt: new Date().toISOString() } },
  'rdm:kiosk:reload': async p => { if (p.forceClearCache) win.webContents.reloadIgnoringCache(); else win.webContents.send('rdm:reload'); return { reloaded: true } },
  'rdm:kiosk:minimize': async p => { win.setKiosk(false); win.minimize(); if (p.durationSec) setTimeout(() => { win.restore(); win.setKiosk(true) }, p.durationSec * 1000); return { minimized: true } },
  'rdm:kiosk:camera_test': async () => cameraTest(),
  'rdm:kiosk:update_config': async p => { win.webContents.send('rdm:config', p); return { applied: true } },
  'rdm:kiosk:force_sync': async p => { engine.triggerBatchSync().catch(() => {}); return { started: true, maxBatchSize: p.maxBatchSize || null } }
}
async function cameraTest() {
  const t = Date.now()
  if (!cfg.camDriver || cfg.camDriver === 'webcam') return { driver: 'webcam', cameraConnected: rep.cameraConnected, latencyMs: null, note: 'Webcam diuji di layar Camera Test kiosk' }
  const out = path.join(P.temp, 'test_cam.jpg'); await hw.captureCli(cfg.camDriver, cfg, out)
  return { driver: cfg.camDriver, latencyMs: Date.now() - t, file: 'photolab-file://temp/test_cam.jpg', batteryLevel: null, lensStatus: 'n/a' }
}

/* ---------- IPC ---------- */
function ipc() {
  ipcMain.handle('config:set', (_e, c) => { const old = cfg; cfg = { ...cfg, ...c }; writeJson(cfgFile(), cfg); if (state.paperCap !== cfg.paperCap && cfg.paperCap) { state.paperCap = cfg.paperCap; writeJson(stateFile(), state) }; if (old.server !== cfg.server || old.token !== cfg.token) rdm.start(); return true })
  ipcMain.handle('status:get', async () => ({ paperRemaining: state.paperRemaining ?? state.paperCap, paperCap: state.paperCap, printerStatus: lastPrinter, pending: await engine.pendingCount(), appVersion: VERSION, rdm: rdm.connected, printers: (await win.webContents.getPrintersAsync()).map(p => p.name), ffmpeg: FF() }))
  ipcMain.on('report', (_e, o) => { rep = { ...rep, ...o } })
  ipcMain.handle('frames:cache', async (_e, frames) => { // -> { frameId: photolab-file://frames/<file> }
    const idx = readJson(path.join(P.frames, 'index.json'), {}), out = {}
    for (const f of frames) {
      if (!f.asset_url) continue
      const file = f.id + '.' + (/\.gif/.test(f.asset_url) ? 'gif' : 'png')
      if (idx[f.id] !== f.checksum_md5 || !fs.existsSync(path.join(P.frames, file))) { // unduh hanya jika checksum berubah
        try { const r = await fetch(cfg.server + f.asset_url); if (!r.ok) continue; await fsp.writeFile(path.join(P.frames, file), Buffer.from(await r.arrayBuffer())); idx[f.id] = f.checksum_md5 } catch { continue }
      }
      out[f.id] = 'photolab-file://frames/' + file
    }
    writeJson(path.join(P.frames, 'index.json'), idx); return out
  })
  ipcMain.handle('assets:cache', async (_e, list) => { // tema event: [{key,url}] -> { key: photolab-file://assets/<file> }
    const out = {}, keep = new Set()
    for (const { key, url } of list) {
      if (!url) continue
      const ext = (/\.(\w+)(\?|$)/.exec(url) || [])[1] || 'bin', hash = (/v=(\w+)/.exec(url) || [])[1] || 'x', file = `${key}_${hash}.${ext}`
      if (!fs.existsSync(path.join(P.assets, file))) { try { const r = await fetch(cfg.server + url); if (!r.ok) continue; await fsp.writeFile(path.join(P.assets, file), Buffer.from(await r.arrayBuffer())) } catch { continue } }
      keep.add(file); out[key] = 'photolab-file://assets/' + file
    }
    for (const n of await fsp.readdir(P.assets).catch(() => [])) if (!keep.has(n) && list.some(l => n.startsWith(l.key + '_'))) fsp.rm(path.join(P.assets, n), { force: true })
    return out
  })
  ipcMain.handle('camera:capture', async (_e, code, i) => { const d = path.join(P.temp, 'cap_' + String(code).replace(/\W/g, '')); await fsp.mkdir(d, { recursive: true }); const f = path.join(d, `shot_${i}.jpg`); await hw.captureCli(cfg.camDriver, cfg, f); return { path: f, url: `photolab-file://temp/${path.basename(d)}/shot_${i}.jpg` } })
  ipcMain.handle('camera:test', () => cameraTest())
  ipcMain.handle('session:finalize', (_e, p) => finalizeSession(p))
  ipcMain.handle('sessions:list', () => listSessions())
  ipcMain.handle('sessions:reprint', async (_e, code, copies) => {
    const safeCode = String(code || '').replace(/[^A-Za-z0-9_-]/g, '')
    const count = Number(copies === undefined ? cfg.copies || 1 : copies), max = Math.max(1, Math.floor(Number(cfg.extraPrintMax) || 5))
    if (!safeCode || safeCode !== code) throw new Error('kode sesi tidak valid')
    if (!Number.isInteger(count) || count < 1) throw new Error('jumlah cetak tidak valid')
    if (copies !== undefined && count > max) throw new Error(`jumlah cetak harus 1 sampai ${max}`)
    const file = path.join(P.print, `tx_${safeCode}_print.jpg`)
    if (!fs.existsSync(file)) throw new Error('file hasil cetak tidak ditemukan')
    await printFile(file, count)
    const a = readIdx(), e = a.find(x => x.code === safeCode)
    if (e) { e.prints = (e.prints || 0) + count; writeIdx(a) }
    return true
  })
  ipcMain.handle('sessions:last', async () => { const e = readIdx()[0]; if (!e) return false; await printFile(path.join(P.print, `tx_${e.code}_print.jpg`), cfg.copies || 1); return true })
  ipcMain.handle('sessions:retry', async (_e, code) => engine.triggerBatchSync(code || undefined))
  ipcMain.handle('sessions:reveal', (_e, code) => shell.showItemInFolder(path.join(P.print, `tx_${code}_print.jpg`)))
  ipcMain.handle('print:test', () => handlers['rdm:kiosk:test_print']())
  ipcMain.handle('printer:setPaper', (_e, n) => { state.paperCap = n; state.paperRemaining = n; writeJson(stateFile(), state); return true })
  ipcMain.handle('window:minimize', () => { win.setKiosk(false); win.minimize() })
  ipcMain.handle('window:close', () => app.quit())
}

function createWindow() {
  win = new BrowserWindow({ fullscreen: !DEV, kiosk: !DEV, width: 1280, height: 720, autoHideMenuBar: true, backgroundColor: '#e9eaec',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  if (DEV) win.loadURL(process.env.ELECTRON_RENDERER_URL); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'fullscreen'].includes(perm))) // izinkan kamera
  win.webContents.on('before-input-event', (e, i) => { if (!DEV && (i.key === 'F11' || i.key === 'F12' || (i.control && ['r', 'w', 'p', 'R'].includes(i.key)))) e.preventDefault() })
  win.webContents.on('render-process-gone', () => setTimeout(() => win.reload(), 1000)) // watchdog: renderer crash -> muat ulang
}

app.whenReady().then(() => {
  P = makePaths(app.getPath('userData'))
  cfg = { server: '', token: '', mode: 'normal', copies: 1, paper: '4x6', ...readJson(cfgFile(), {}) }
  state = readJson(stateFile(), { paperCap: 700, paperRemaining: 700 })
  protocol.handle('photolab-file', req => { // photolab-file://<print|temp|frames>/<nama> -> file di storage
    const u = new URL(req.url), dir = P[u.hostname]
    if (!dir || !['print', 'temp', 'frames', 'assets'].includes(u.hostname)) return new Response('forbidden', { status: 403 })
    const full = path.normalize(path.join(dir, decodeURIComponent(u.pathname)))
    if (!full.startsWith(dir + path.sep)) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(full).href, { headers: req.headers })
  })
  engine = new FailsaveEngine({ dir: P.failsave, getCfg: () => cfg, log, onProgress: p => rdm && rdm.send('rdm:sync:batch_progress', p) })
  rdm = new Rdm({ getCfg: () => cfg, handlers, log })
  ipc(); createWindow(); rdm.start(); engine.startDaemon(30000)
  setInterval(() => heartbeat().catch(e => log('hb', e.message)), 15000); heartbeat().catch(() => {})
  scavenge(); setInterval(scavenge, 10 * 60e3)
  app.on('second-instance', () => { if (win) { win.restore(); win.focus() } })
})
app.on('window-all-closed', () => app.quit())
