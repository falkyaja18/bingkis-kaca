// Deteksi otomatis area transparan pada PNG frame -> slot foto.
// detectFromAlpha = fungsi murni (bisa diuji tanpa browser); detectFromUrl = pembungkus canvas.
export function detectFromAlpha(alpha, w, h, { alphaMax = 16, minArea = 0.01 } = {}) {
  const s = Math.max(1, Math.floor(Math.max(w, h) / 400)), gw = Math.ceil(w / s), gh = Math.ceil(h / s)
  const g = new Uint8Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = alpha[Math.min(h - 1, y * s) * w + Math.min(w - 1, x * s)] <= alphaMax ? 1 : 0
  const seen = new Uint8Array(gw * gh), comps = []
  for (let i = 0; i < g.length; i++) {
    if (!g[i] || seen[i]) continue
    const st = [i]; seen[i] = 1
    let minx = gw, maxx = 0, miny = gh, maxy = 0, n = 0
    while (st.length) {
      const c = st.pop(), cx = c % gw, cy = (c / gw) | 0
      n++; if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = ny * gw + nx
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && g[k] && !seen[k]) { seen[k] = 1; st.push(k) }
      }
    }
    if (n / (gw * gh) < minArea) continue
    if ((maxx - minx + 1) > 0.9 * gw && (maxy - miny + 1) > 0.9 * gh) continue   // latar transparan penuh, bukan jendela foto
    // rapikan batas ke resolusi penuh (+-s piksel)
    let x0 = w, x1 = 0, y0 = h, y1 = 0
    for (let y = Math.max(0, miny * s - s); y <= Math.min(h - 1, (maxy + 1) * s + s); y++)
      for (let x = Math.max(0, minx * s - s); x <= Math.min(w - 1, (maxx + 1) * s + s); x++)
        if (alpha[y * w + x] <= alphaMax) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    comps.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
  }
  if (!comps.length) return { slots: [], caps: 0 }
  // kelompokkan ke kolom
  comps.sort((a, b) => a.x - b.x)
  const cols = []
  for (const b of comps) { const c = cols.find(c => Math.abs(c.x - b.x) <= w * 0.06); if (c) c.items.push(b); else cols.push({ x: b.x, items: [b] }) }
  cols.sort((a, b) => a.x - b.x); cols.forEach(c => c.items.sort((a, b) => a.y - b.y))
  // strip ganda (2 kolom identik, >= 3 baris, mis. dipotong dua): baris yang sama memakai foto yang sama
  const dup = cols.length > 1 && cols[0].items.length >= 3 && cols.every(c => c.items.length === cols[0].items.length && c.items.every((b, r) => Math.abs(b.y - cols[0].items[r].y) <= h * 0.03))
  let out
  if (dup) out = cols.flatMap(c => c.items.map((b, r) => ({ ...b, capture: r })))
  else { // urutan baca: atas ke bawah, kiri ke kanan
    const tol = h * 0.04, sorted = [...comps].sort((a, b) => Math.abs(a.y - b.y) <= tol ? a.x - b.x : a.y - b.y)
    out = sorted.map((b, i) => ({ ...b, capture: i }))
  }
  return { slots: out, caps: Math.max(...out.map(s => s.capture)) + 1 }
}

export async function detectFromUrl(url) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, w, h).data, alpha = new Uint8Array(w * h)
  for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3]
  return { w, h, ...detectFromAlpha(alpha, w, h) }
}
