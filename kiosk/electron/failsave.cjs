// Failsave: brankas offline-first. Setiap sesi ditulis ATOMIK ke failsave/<uuid>/ (manifest.json + file + SHA-256),
// lalu daemon mengunggah ke Web Master dan menghapus folder hanya setelah server mengirim acknowledged.
const fs = require('fs'), fsp = fs.promises, path = require('path'), crypto = require('crypto')

const sha256 = f => new Promise((ok, no) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', c => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', no) })
const exists = f => fsp.access(f).then(() => true, () => false)

class FailsaveEngine {
  constructor({ dir, getCfg, onProgress, log = console.log }) {
    this.dir = dir; this.getCfg = getCfg; this.onProgress = onProgress || (() => {}); this.log = log
    this.syncing = false; this.timer = null; fs.mkdirSync(dir, { recursive: true })
  }

  async save(manifest, { photo, gif, live, raws = [], extras = [] }) {
    const t = path.join(this.dir, manifest.transactionUuid)
    await fsp.mkdir(t, { recursive: true })
    const files = {}
    await fsp.copyFile(photo, path.join(t, 'photo_highres.jpg'))
    files.photoHighRes = { fileName: 'photo_highres.jpg', sha256: await sha256(path.join(t, 'photo_highres.jpg')) }
    if (gif && await exists(gif)) {
      await fsp.copyFile(gif, path.join(t, 'photo_strip.gif'))
      files.photoStripGif = { fileName: 'photo_strip.gif', sha256: await sha256(path.join(t, 'photo_strip.gif')) }
    }
    if (live && await exists(live)) {
      await fsp.copyFile(live, path.join(t, 'live.mp4'))
      files.liveVideo = { fileName: 'live.mp4', sha256: await sha256(path.join(t, 'live.mp4')) }
    }
    files.extras = []
    for (let i = 0; i < extras.length; i++) {
      const name = `extra_${String(i + 1).padStart(2, '0')}.jpg`
      await fsp.copyFile(extras[i], path.join(t, name))
      files.extras.push({ fileName: name, sha256: await sha256(path.join(t, name)) })
    }
    files.raws = []
    for (let i = 0; i < raws.length; i++) {
      const name = `raw_${String(i + 1).padStart(2, '0')}.jpg`
      await fsp.copyFile(raws[i], path.join(t, name))
      files.raws.push({ fileName: name, sha256: await sha256(path.join(t, name)) })
    }
    // manifest ditulis ke file sementara lalu di-rename (atomik): aman bila listrik padam
    const tmp = path.join(t, 'manifest.tmp')
    await fsp.writeFile(tmp, JSON.stringify({ ...manifest, retryCount: 0, files }, null, 2))
    await fsp.rename(tmp, path.join(t, 'manifest.json'))
  }

  async list() {
    const out = []
    for (const n of await fsp.readdir(this.dir).catch(() => [])) {
      const mf = path.join(this.dir, n, 'manifest.json')
      if (await exists(mf)) { try { out.push(JSON.parse(await fsp.readFile(mf, 'utf8'))) } catch { /* manifest rusak: dilewati */ } }
    }
    return out
  }
  async pendingCount() { return (await this.list()).length }

  async online() {
    const c = this.getCfg(); if (!c.server) return false
    try { return (await fetch(c.server + '/api/v1/kiosk/healthcheck', { signal: AbortSignal.timeout(4000) })).ok } catch { return false }
  }

  // Unggah antrean. only = sessionCode tertentu (tombol Retry). Mengembalikan {total, uploaded}.
  async triggerBatchSync(only) {
    if (this.syncing) return { total: 0, uploaded: 0, busy: true }
    this.syncing = true
    let items = [], uploaded = 0, failed = 0
    try {
      items = (await this.list()).filter(m => !only || m.sessionCode === only)
      const c = this.getCfg()
      for (let i = 0; i < items.length; i++) {
        const m = items[i], dir = path.join(this.dir, m.transactionUuid), mfPath = path.join(dir, 'manifest.json')
        const fail = async (msg, stop) => { m.retryCount = (m.retryCount || 0) + 1; m.lastError = msg; await fsp.writeFile(mfPath, JSON.stringify(m, null, 2)); failed++; return stop }
        // verifikasi integritas semua file sebelum dikirim
        const want = [m.files.photoHighRes, m.files.photoStripGif, m.files.liveVideo, ...(m.files.raws || []), ...(m.files.extras || [])].filter(Boolean)
        let bad = null
        for (const f of want) { const p = path.join(dir, f.fileName); if (!(await exists(p)) || await sha256(p) !== f.sha256) { bad = f.fileName; break } }
        if (bad) { await fail('FILE_CHECKSUM_CORRUPTED: ' + bad, false); continue }
        const fd = new FormData()
        fd.append('manifest', JSON.stringify(m))
        const blob = f => new Blob([fs.readFileSync(path.join(dir, f.fileName))])
        fd.append('photo', blob(m.files.photoHighRes), m.files.photoHighRes.fileName)
        if (m.files.photoStripGif) fd.append('gif', blob(m.files.photoStripGif), m.files.photoStripGif.fileName)
        if (m.files.liveVideo) fd.append('live', blob(m.files.liveVideo), m.files.liveVideo.fileName)
        for (const r of m.files.raws || []) fd.append('raws', blob(r), r.fileName)
        for (const r of m.files.extras || []) fd.append('extras', blob(r), r.fileName)
        try {
          const r = await fetch(c.server + '/api/v1/sync/failsave-ingest', { method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'X-Kiosk-ID': m.kioskId || '' }, body: fd, signal: AbortSignal.timeout(120000) })
          const j = await r.json().catch(() => ({}))
          if (r.ok && j.acknowledged) { await fsp.rm(dir, { recursive: true, force: true }); uploaded++ }
          else if (await fail(`HTTP ${r.status} ${j.error || ''}`, r.status === 401)) break
        } catch (e) { await fail(e.message || 'NETWORK_FAILURE', true); break } // jaringan putus: hentikan batch
        this.onProgress({ totalPending: items.length, processed: i + 1, successCount: uploaded, failureCount: failed, currentTxId: m.transactionUuid })
      }
    } finally { this.syncing = false }
    return { total: items.length, uploaded }
  }

  startDaemon(ms = 30000) {
    this.stopDaemon()
    this.timer = setInterval(async () => {
      const c = this.getCfg()
      if (c.mode !== 'normal' || !c.token || this.syncing) return          // Event Mode: unggah ditunda
      if (await this.pendingCount() && await this.online()) this.triggerBatchSync().catch(e => this.log('sync', e))
    }, ms)
  }
  stopDaemon() { if (this.timer) clearInterval(this.timer); this.timer = null }
}
module.exports = { FailsaveEngine, sha256 }
