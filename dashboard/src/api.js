// Klien API admin. Token disimpan di sessionStorage (hilang saat tab ditutup).
let token = sessionStorage.getItem('tk') || ''

export const hasToken = () => !!token
export const getUser = () => sessionStorage.getItem('un') || 'admin'
export function logout() { token = ''; sessionStorage.removeItem('tk'); sessionStorage.removeItem('un') }

export async function login(username, password) {
  const r = await fetch('/api/v1/admin/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password })
  })
  if (!r.ok) throw new Error('Username atau password salah')
  const j = await r.json()
  token = j.token
  sessionStorage.setItem('tk', token); sessionStorage.setItem('un', j.username || username)
}

export async function api(path, opt = {}) {
  const r = await fetch('/api/v1/admin' + path, { ...opt, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token } })
  if (r.status === 401) { logout(); window.dispatchEvent(new Event('unauth')); throw new Error('401') }
  return r.json()
}
