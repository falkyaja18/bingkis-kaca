// Render komposit & GIF lewat ffmpeg.exe (proses terpisah, tidak memblokir Node/Chromium)
const { spawn } = require('child_process'), fs = require('fs'), path = require('path')

function ffmpegPath(resourcesPath) {
  const c = [process.env.FFMPEG_PATH, resourcesPath && path.join(resourcesPath, 'bin', 'windows', 'ffmpeg.exe'), resourcesPath && path.join(resourcesPath, 'bin', 'ffmpeg')]
  return c.find(p => p && fs.existsSync(p)) || 'ffmpeg'
}
function run(bin, args, onProgress) {
  return new Promise((ok, no) => {
    const p = spawn(bin, args, { windowsHide: true }); let err = ''
    p.stderr.on('data', d => { err = (err + d).slice(-4000); const m = /time=(\d+:\d+:\d+\.\d+)/.exec(String(d)); if (m && onProgress) onProgress(m[1]) })
    p.on('error', e => no(new Error('ffmpeg tidak ditemukan/gagal start: ' + e.message)))
    p.on('close', c => c === 0 ? ok() : no(new Error('ffmpeg exit ' + c + ': ' + err.slice(-400))))
  })
}
const pre = o => [...(o.rot180 ? ['hflip', 'vflip'] : []), ...(o.mirror ? ['hflip'] : [])]   // opsi Putar 180 & Hasil Mirror
const PHOTO_FILTERS = {
  icy: 'hue=h=155:s=0.8',
  sepia: 'colorchannelmixer=rr=.393:rg=.769:rb=.189:gr=.349:gg=.686:gb=.168:br=.272:bg=.534:bb=.131',
  grayscale: 'hue=s=0'
}
const photoFilter = effect => PHOTO_FILTERS[effect] ? [PHOTO_FILTERS[effect]] : []

// Foto di tiap slot (cover-fit) di atas kanvas putih, PNG frame ditumpuk paling atas
function compositeArgs({ raws, slots, w, h, frame, out, mirror, rot180, effect }) {
  const a = ['-y', '-f', 'lavfi', '-i', `color=c=white:s=${w}x${h}`]
  raws.forEach(r => a.push('-i', r)); if (frame) a.push('-i', frame)
  const fc = []
  slots.forEach((s, i) => fc.push(`[${1 + ((s.capture ?? i) % raws.length)}:v]${[...pre({ mirror, rot180 }), ...photoFilter(effect), `scale=${s.width}:${s.height}:force_original_aspect_ratio=increase`, `crop=${s.width}:${s.height}`].join(',')}[p${i}]`))
  let cur = '0:v'
  slots.forEach((s, i) => { fc.push(`[${cur}][p${i}]overlay=${s.x}:${s.y}[o${i}]`); cur = `o${i}` })
  if (frame) { fc.push(`[${1 + raws.length}:v]scale=${w}:${h}[fr]`, `[${cur}][fr]overlay=0:0[final]`); cur = 'final' }
  a.push('-filter_complex', fc.join(';'), '-map', `[${cur}]`, '-frames:v', '1', '-q:v', '2', out)
  return a
}
const composite = (bin, o, onProgress) => run(bin, compositeArgs(o), onProgress)

// GIF animasi dari foto mentah (tiap pose 0,7 detik)
function gifArgs({ raws, out, width = 480, mirror, rot180, effect }) {
  const a = ['-y']; raws.forEach(r => a.push('-loop', '1', '-t', '0.7', '-i', r))
  const fc = raws.map((_, i) => `[${i}:v]${[...pre({ mirror, rot180 }), ...photoFilter(effect), `scale=${width}:-2`, 'setsar=1', 'fps=10'].join(',')}[v${i}]`)
  fc.push(`${raws.map((_, i) => `[v${i}]`).join('')}concat=n=${raws.length}:v=1:a=0,split[a][b]`, '[a]palettegen[p]', '[b][p]paletteuse')
  a.push('-filter_complex', fc.join(';'), '-loop', '0', out)
  return a
}
// Live Photo: rangkaian frame preview beberapa detik sebelum jepretan -> MP4
function liveArgs({ pattern, out, fps = 10 }) {
  return ['-y', '-framerate', String(fps), '-i', pattern, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]
}
const makeLive = (bin, o) => run(bin, liveArgs(o))
const makeGif = (bin, o) => run(bin, gifArgs(o))
const testPattern = (bin, out, w = 1200, h = 1800) => run(bin, ['-y', '-f', 'lavfi', '-i', `smptebars=s=${w}x${h}`, '-frames:v', '1', '-q:v', '2', out])

module.exports = { ffmpegPath, composite, compositeArgs, makeGif, gifArgs, makeLive, liveArgs, testPattern, run }
