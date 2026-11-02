// Klien WebSocket Remote Device Management ke Web Master (auto-reconnect, exponential backoff)
const WebSocket = require('ws')

class Rdm {
  constructor({ getCfg, handlers, log = () => {} }) { this.getCfg = getCfg; this.handlers = handlers; this.log = log; this.ws = null; this.delay = 1000; this.stopped = true; this.t = null }
  start() { this.stop(); this.stopped = false; this._connect() }
  stop() { this.stopped = true; clearTimeout(this.t); if (this.ws) { try { this.ws.close() } catch { /* abaikan */ } this.ws = null } }
  get connected() { return !!this.ws && this.ws.readyState === 1 }
  send(event, payload) { if (!this.connected) return false; this.ws.send(JSON.stringify({ event, payload })); return true }
  _connect() {
    const c = this.getCfg(); if (this.stopped || !c.server || !c.token) return
    const ws = new WebSocket(c.server.replace(/^http/, 'ws') + '/ws/kiosk?token=' + encodeURIComponent(c.token))
    this.ws = ws
    ws.on('open', () => { this.delay = 1000; this.log('rdm connected') })
    ws.on('message', async raw => {
      let m; try { m = JSON.parse(raw) } catch { return }
      if (!m.event) return
      try {
        const h = this.handlers[m.event], result = h ? await h(m.payload || {}) : { unsupported: true }
        if (m.cmdId) ws.send(JSON.stringify({ cmdId: m.cmdId, ok: true, result }))
      } catch (e) { if (m.cmdId) ws.send(JSON.stringify({ cmdId: m.cmdId, ok: false, error: String(e.message || e) })) }
    })
    ws.on('close', () => { if (this.ws === ws) this.ws = null; if (!this.stopped) this.t = setTimeout(() => this._connect(), this.delay = Math.min(this.delay * 2, 30000)) })
    ws.on('error', () => {})
  }
}
module.exports = { Rdm }
