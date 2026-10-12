// Генерация иконок PWA без внешних зависимостей: растеризация простых фигур + PNG через zlib.
// Запуск: node scripts/make_icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [15, 17, 21]
const FG = [255, 176, 32]

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// фигуры в координатах 0..1
const rrect = (x, y, cx, cy, w, h, r) => {
  const dx = Math.max(Math.abs(x - cx) - w / 2 + r, 0)
  const dy = Math.max(Math.abs(y - cy) - h / 2 + r, 0)
  return Math.hypot(dx, dy) <= r
}
function barbell(u, v, scale) {
  // масштаб вокруг центра (для maskable — меньше, чтобы попасть в безопасную зону)
  const x = 0.5 + (u - 0.5) / scale, y = 0.5 + (v - 0.5) / scale
  if (rrect(x, y, 0.5, 0.5, 0.78, 0.045, 0.02)) return true // гриф
  for (const s of [-1, 1]) {
    if (rrect(x, y, 0.5 + s * 0.2, 0.5, 0.075, 0.42, 0.03)) return true // большие блины
    if (rrect(x, y, 0.5 + s * 0.29, 0.5, 0.06, 0.28, 0.025)) return true // малые блины
    if (rrect(x, y, 0.5 + s * 0.135, 0.5, 0.03, 0.12, 0.012)) return true // замки
  }
  return false
}
function icon(size, { maskable = false, rounded = true } = {}) {
  const S = 4
  return png(size, (px, py) => {
    let bg = 0, fg = 0
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const u = (px + (i + 0.5) / S) / size, v = (py + (j + 0.5) / S) / size
      const inBg = maskable || !rounded || rrect(u, v, 0.5, 0.5, 1, 1, 0.22)
      if (!inBg) continue
      bg++
      if (barbell(u, v, maskable ? 0.72 : 0.9)) fg++
    }
    const a = bg / (S * S)
    if (a === 0) return [0, 0, 0, 0]
    const t = fg / bg
    return [0, 1, 2].map((k) => Math.round(BG[k] * (1 - t) + FG[k] * t)).concat([Math.round(a * 255)])
  })
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', icon(192))
writeFileSync('public/icons/icon-512.png', icon(512))
writeFileSync('public/icons/icon-maskable-512.png', icon(512, { maskable: true }))
writeFileSync('public/icons/apple-touch-icon.png', icon(180, { rounded: false }))
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0f1115"/><g fill="#ffb020" transform="translate(50 50) scale(0.9) translate(-50 -50)"><rect x="11" y="47.75" width="78" height="4.5" rx="2"/><rect x="66.25" y="29" width="7.5" height="42" rx="3"/><rect x="26.25" y="29" width="7.5" height="42" rx="3"/><rect x="76" y="36" width="6" height="28" rx="2.5"/><rect x="18" y="36" width="6" height="28" rx="2.5"/><rect x="62" y="44" width="3" height="12" rx="1.2"/><rect x="35" y="44" width="3" height="12" rx="1.2"/></g></svg>`)
console.log('icons written')
