// Struktur penyimpanan lokal kiosk: %AppData%/<app>/storage/{temp,print,failsave,frames}
const path = require('path'), fs = require('fs')
module.exports = function makePaths(userData) {
  const root = path.join(userData, 'storage')
  const d = { root, temp: path.join(root, 'temp'), print: path.join(root, 'print'), failsave: path.join(root, 'failsave'), frames: path.join(root, 'frames'), assets: path.join(root, 'assets') }
  Object.values(d).forEach(p => fs.mkdirSync(p, { recursive: true }))
  return d
}
