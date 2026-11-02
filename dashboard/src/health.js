import { useState, useEffect } from 'react'
import { api } from './api.js'

// Polling telemetri kiosk (heartbeat dari server). Default tiap 15 detik.
export function useHealth(ms = 15000) {
  const [d, setD] = useState({ health: [], alerts: [] })
  useEffect(() => {
    let on = true
    const f = () => api('/overview').then(x => on && setD(x)).catch(() => {})
    f(); const t = setInterval(f, ms)
    return () => { on = false; clearInterval(t) }
  }, [ms])
  return d
}

export function ago(iso) {
  if (!iso) return '-'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'baru saja'
  if (s < 3600) return Math.floor(s / 60) + ' menit yang lalu'
  if (s < 86400) return Math.floor(s / 3600) + ' jam yang lalu'
  return Math.floor(s / 86400) + ' hari yang lalu'
}
