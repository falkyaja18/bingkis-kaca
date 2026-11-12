// Konfigurasi UI kiosk di localStorage; setiap perubahan juga didorong ke Main Process (App.jsx)
const DEF = {
  server: 'http://localhost:3000', token: '', kioskId: '', mode: 'normal', lang: 'ID',
  copies: 1, extraPrintMax: 5, paper: '4x6', printer: '', paperCap: 700,
  pin: '', camDriver: 'webcam', camBrand: 'Canon', orient: 'portrait', mirrorPrev: true, mirrorRes: false, rot180: false, digicamPath: ''
}
export const loadCfg = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem('cfg') || '{}') } } catch { return { ...DEF } } }
export const saveCfg = c => localStorage.setItem('cfg', JSON.stringify(c))
export const loadSync = () => { try { return JSON.parse(localStorage.getItem('sync') || 'null') } catch { return null } }
export const saveSync = j => localStorage.setItem('sync', JSON.stringify(j))
