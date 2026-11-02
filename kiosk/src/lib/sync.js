import { kapi } from './api.js'
import { saveSync } from './cfg.js'
import { N } from './native.js'

// Reload Kiosk: tarik frame, event aktif, harga, tema. Main Process mengunduh gambar frame dan aset tema (background, video, logo)
// hanya bila berubah; hasilnya disimpan sebagai URL lokal (photolab-file://) agar kiosk tetap jalan offline.
export async function doSync(cfg) {
  const r = await kapi(cfg, '/sync'), j = await r.json()
  if (!r.ok) throw j
  j.frame_local = await N.frames.cache(j.frames)
  const t = j.event_theme
  j.theme_local = t ? await N.assets.cache([{ key: 'bg', url: t.background_url }, { key: 'idle', url: t.idle_video_url }, { key: 'logo', url: t.logo_url }]) : {}
  saveSync(j)
  return j
}
