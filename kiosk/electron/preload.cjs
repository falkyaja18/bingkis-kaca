// Jembatan aman Renderer <-> Main (contextIsolation: true, nodeIntegration: false)
const { contextBridge, ipcRenderer } = require('electron')
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a)

contextBridge.exposeInMainWorld('photolabAPI', {
  config: { set: cfg => call('config:set', cfg) },
  status: () => call('status:get'),
  report: obj => ipcRenderer.send('report', obj),
  frames: { cache: frames => call('frames:cache', frames) },
  assets: { cache: list => call('assets:cache', list) },
  camera: { capture: (code, index) => call('camera:capture', code, index), test: () => call('camera:test') },
  session: { finalize: payload => call('session:finalize', payload) },
  sessions: { list: () => call('sessions:list'), reprint: (code, copies) => call('sessions:reprint', code, copies), retry: code => call('sessions:retry', code), last: () => call('sessions:last'), reveal: code => call('sessions:reveal', code) },
  printer: { test: () => call('print:test'), setPaper: n => call('printer:setPaper', n) },
  window: { minimize: () => call('window:minimize'), close: () => call('window:close') },
  on: (ch, cb) => { const f = (_e, p) => cb(p); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f) }
})
