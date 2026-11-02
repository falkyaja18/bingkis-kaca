import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api'

export const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)
const MASTER = ['branches', 'kiosks', 'galleries', 'frames', 'vouchers', 'soft', 'pay']

// S = seluruh data dari server. update(patch) menyimpan data master ke server.
export function StoreProvider({ children }) {
  const [S, setS] = useState(null)
  const ref = useRef(null)
  const reload = useCallback(async () => { const d = await api('/state'); ref.current = d; setS(d) }, [])
  const update = useCallback(async patch => {
    const n = { ...ref.current, ...patch }; ref.current = n; setS(n)
    const m = {}; MASTER.forEach(k => { m[k] = n[k] })
    await api('/master', { method: 'PUT', body: JSON.stringify(m) })
  }, [])
  useEffect(() => { reload().catch(() => {}) }, [reload])
  if (!S) return <p style={{ padding: 24 }}>Memuat…</p>
  return <Ctx.Provider value={{ S, update, reload }}>{children}</Ctx.Provider>
}
