// Adapter perangkat keras. Catatan: driver kamera DSLR (digiCamControl / gphoto2) dan status printer Windows
// TIDAK bisa diuji di lingkungan pengembangan tanpa perangkat; verifikasi di mesin kiosk sebenarnya.
const { execFile } = require('child_process'), fs = require('fs'), os = require('os')

const exec = (cmd, args, timeout = 30000) => new Promise((ok, no) => execFile(cmd, args, { timeout, windowsHide: true }, (e, so, se) => e ? no(new Error((se || e.message).toString().slice(0, 300))) : ok(String(so))))

// Ambil 1 foto resolusi penuh dari DSLR ke outPath. driver: 'digicam' | 'gphoto2'
async function captureCli(driver, cfg, outPath) {
  if (driver === 'gphoto2') await exec('gphoto2', ['--capture-image-and-download', '--filename', outPath, '--force-overwrite'])
  else if (driver === 'digicam') await exec(cfg.digicamPath || 'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe', ['/filename', outPath, '/capture'])
  else throw new Error('driver kamera tidak didukung: ' + driver)
  if (!fs.existsSync(outPath)) throw new Error('kamera tidak menghasilkan file')
  return outPath
}
async function detectCamera(driver, cfg) {
  try {
    if (driver === 'gphoto2') return (await exec('gphoto2', ['--auto-detect'], 8000)).trim().split('\n').length > 2
    if (driver === 'digicam') return fs.existsSync(cfg.digicamPath || 'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe')
  } catch { /* tidak terdeteksi */ }
  return false
}

// Status printer lewat Windows Spooler (Win32_Printer). Sisa kertas DNP TIDAK tersedia di sini -> pakai penghitung lokal.
const ERR = { 3: 'PAPER_LOW', 4: 'PRINTER_OUT_OF_PAPER', 6: 'RIBBON_END', 7: 'COVER_OPEN', 8: 'PAPER_JAM', 9: 'offline', 10: 'SERVICE_REQUESTED' }
async function printerStatus(name) {
  if (process.platform !== 'win32') return 'online'
  try {
    const out = await exec('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,DetectedErrorState | ConvertTo-Json -Compress'], 10000)
    let list = JSON.parse(out); if (!Array.isArray(list)) list = [list]
    const p = list.find(x => name ? x.Name === name : x.Default) || list[0]
    if (!p) return 'offline'
    return p.WorkOffline ? 'offline' : (ERR[p.DetectedErrorState] || 'online')
  } catch { return 'unknown' }
}

// CPU% sejak pemanggilan sebelumnya
let last = null
function cpuPercent() {
  const t = os.cpus().reduce((a, c) => { for (const k in c.times) a.total += c.times[k]; a.idle += c.times.idle; return a }, { idle: 0, total: 0 })
  const r = last ? Math.round(100 * (1 - (t.idle - last.idle) / Math.max(1, t.total - last.total))) : 0
  last = t; return r
}
async function diskFreeGb(dir) { try { const s = await fs.promises.statfs(dir); return Math.round(s.bavail * s.bsize / 1e9 * 10) / 10 } catch { return null } }

module.exports = { captureCli, detectCamera, printerStatus, cpuPercent, diskFreeGb }
