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
  const display = j.kiosk_settings?.display || {}
  const localAssets = await N.assets.cache([
    { key: 'bg', url: t && t.background_url },
    { key: 'idle', url: t && t.idle_video_url },
    { key: 'logo', url: t && t.logo_url },
    { key: 'kiosk_logo', url: display.logoImage },
    { key: 'kiosk_idle', url: display.idleImage },
    { key: 'kiosk_welcome', url: display.welcomeImage },
    { key: 'kiosk_tutorial', url: display.tutorialImage },
    { key: 'kiosk_qr_logo', url: display.qrLogo }
  ])
  j.theme_local = { bg: localAssets.bg, idle: localAssets.idle, logo: localAssets.logo }
  j.kiosk_assets_local = localAssets
  saveSync(j)
  return j
}
