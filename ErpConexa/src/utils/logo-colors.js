function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function saturation(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return 0
  return (max - min) / max
}

function hue(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let h = 0
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h = Math.round(h * 60)
  return h < 0 ? h + 360 : h
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('No se pudo leer la imagen del logo'))
    if (source instanceof File || source instanceof Blob) {
      const objectUrl = URL.createObjectURL(source)
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(img)
      }
      img.src = objectUrl
      return
    }
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.src = source
  })
}

/**
 * Extrae colores corporativos dominantes de un logo (canvas en el navegador).
 * @param {File|Blob|string} source
 */
export async function extractLogoColors(source) {
  const img = await loadImage(source)
  const canvas = document.createElement('canvas')
  const size = 128
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  const buckets = new Map()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 128) continue

    const lum = luminance(r, g, b)
    if (lum > 248) continue

    const qr = Math.round(r / 16) * 16
    const qg = Math.round(g / 16) * 16
    const qb = Math.round(b / 16) * 16
    const key = `${qr},${qg},${qb}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  const colors = [...buckets.entries()]
    .map(([key, count]) => {
      const [r, g, b] = key.split(',').map(Number)
      return {
        r,
        g,
        b,
        count,
        hex: rgbToHex(r, g, b),
        lum: luminance(r, g, b),
        sat: saturation(r, g, b),
        hue: hue(r, g, b),
      }
    })
    .sort((a, b) => b.count - a.count)

  if (!colors.length) {
    return {
      primary: '#F57C00',
      secondary: '#1A1A1A',
      accent: '#FFB300',
    }
  }

  const warm = colors.filter((c) => c.sat > 0.2 && c.hue >= 10 && c.hue <= 65)
  const dark = colors.filter((c) => c.lum < 90).sort((a, b) => a.lum - b.lum)
  const primary = warm.sort((a, b) => b.count - a.count)[0] || colors[0]
  const accent = [...warm].sort((a, b) => b.lum - a.lum)[0] || primary
  const secondary = dark[0] || colors.find((c) => c.lum < 50) || { hex: '#1A1A1A' }

  return {
    primary: primary.hex,
    secondary: secondary.hex,
    accent: accent.hex,
  }
}
