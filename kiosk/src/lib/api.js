export const kapi = (cfg, path, opt = {}) =>
  fetch(cfg.server + '/api/v1/kiosk' + path, { ...opt, headers: { 'content-type': 'application/json', 'x-kiosk-token': cfg.token } })
