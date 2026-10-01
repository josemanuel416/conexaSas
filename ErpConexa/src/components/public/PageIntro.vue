<template>
  <Teleport to="body">
  <div
    v-if="visible"
    class="page-intro"
    :class="{ 'page-intro--leave': leaving }"
    role="status"
    aria-label="Cargando ConexaSoft"
  >
    <canvas ref="canvasEl" class="page-intro__canvas" aria-hidden="true" />
    <div class="page-intro__brand" :class="{ 'page-intro__brand--on': logoOn }">
      <img :src="brandAssets.icon" alt="" class="page-intro__icon" />
      <div class="page-intro__name">ConexaSoft</div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BRAND_ASSETS } from 'src/config/brand-assets.js'

const brandAssets = BRAND_ASSETS
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const visible = ref(!reduceMotion)
const leaving = ref(false)
const logoOn = ref(false)
const canvasEl = ref(null)

let raf = 0
let leaveTimer = 0
let logoTimer = 0
let hideTimer = 0
let removeResize = () => {}

function rand(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildNeuron(cx, cy, scale) {
  const random = rand(42)
  const segments = []
  const tips = []

  function grow(x, y, angle, length, depth, trail) {
    const nx = x + Math.cos(angle) * length
    const ny = y + Math.sin(angle) * length
    const path = trail.concat([[nx, ny]])
    segments.push({ x1: x, y1: y, x2: nx, y2: ny, depth })
    if (depth <= 0 || length < 16 * scale) {
      tips.push(path)
      return
    }
    const spread = 0.42 + random() * 0.35
    grow(nx, ny, angle - spread, length * (0.62 + random() * 0.12), depth - 1, path)
    grow(nx, ny, angle + spread * 0.9, length * (0.58 + random() * 0.12), depth - 1, path)
    if (depth > 2 && random() > 0.45) {
      grow(nx, ny, angle + (random() - 0.5) * 0.4, length * 0.55, depth - 2, path)
    }
  }

  const arms = 7
  for (let i = 0; i < arms; i += 1) {
    const angle = -Math.PI + (i / arms) * Math.PI * 2 + 0.2
    const length = (78 + (i % 3) * 18) * scale
    grow(cx, cy, angle, length, 4, [[cx, cy]])
  }

  const signal = tips.reduce((best, path) => (path.length > best.length ? path : best), tips[0] || [[cx, cy]])
  return { segments, signal: signal.slice().reverse() }
}

function pointAt(path, t) {
  if (path.length < 2) return path[0]
  const clamped = Math.min(1, Math.max(0, t))
  const pos = clamped * (path.length - 1)
  const i = Math.floor(pos)
  const f = pos - i
  const a = path[i]
  const b = path[Math.min(i + 1, path.length - 1)]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

function glow(ctx, x, y, radius, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

onMounted(() => {
  if (!visible.value) return
  const canvas = canvasEl.value
  const ctx = canvas.getContext('2d')
  const start = performance.now()

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(window.innerWidth * dpr)
    canvas.height = Math.floor(window.innerHeight * dpr)
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize()
  window.addEventListener('resize', resize)
  removeResize = () => window.removeEventListener('resize', resize)

  const draw = (now) => {
    const t = now - start
    const w = window.innerWidth
    const h = window.innerHeight
    const cx = w / 2
    const cy = h / 2
    const scale = Math.min(w, h) / 520
    const { segments, signal } = buildNeuron(cx, cy, scale)

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#050814'
    ctx.fillRect(0, 0, w, h)

    const branchAlpha = Math.min(1, t / 700)
    ctx.lineCap = 'round'
    segments.forEach((seg) => {
      ctx.strokeStyle = `rgba(186, 214, 236, ${0.28 + (4 - seg.depth) * 0.08 * branchAlpha})`
      ctx.lineWidth = Math.max(0.6, (seg.depth + 1) * 0.55) * scale
      ctx.beginPath()
      ctx.moveTo(seg.x1, seg.y1)
      ctx.lineTo(seg.x2, seg.y2)
      ctx.stroke()
    })

    glow(ctx, cx, cy, 28 * scale, 'rgba(25, 118, 210, 0.35)', 'rgba(25, 118, 210, 0)')

    const travelStart = 650
    const travelEnd = 2500
    if (t > travelStart) {
      const p = Math.min(1, (t - travelStart) / (travelEnd - travelStart))
      const eased = 1 - (1 - p) ** 2
      for (let i = 8; i >= 0; i -= 1) {
        const [x, y] = pointAt(signal, eased - i * 0.035)
        const radius = (22 - i * 2) * scale
        glow(
          ctx,
          x,
          y,
          Math.max(4, radius),
          i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(0, 229, 255, 0.55)',
          'rgba(0, 229, 255, 0)',
        )
      }
      if (p > 0.82) {
        const flare = (p - 0.82) / 0.18
        glow(ctx, cx, cy, (40 + flare * 90) * scale, `rgba(0, 229, 255, ${0.35 + flare * 0.4})`, 'rgba(0, 229, 255, 0)')
        glow(ctx, cx, cy, 18 * scale, 'rgba(255,255,255,0.9)', 'rgba(105, 240, 174, 0)')
      }
    }

    if (t < 4200) raf = requestAnimationFrame(draw)
  }

  raf = requestAnimationFrame(draw)
  logoTimer = window.setTimeout(() => { logoOn.value = true }, 2200)
  leaveTimer = window.setTimeout(() => { leaving.value = true }, 3400)
  hideTimer = window.setTimeout(() => { visible.value = false }, 4100)
})

onBeforeUnmount(() => {
  removeResize()
  cancelAnimationFrame(raf)
  window.clearTimeout(logoTimer)
  window.clearTimeout(leaveTimer)
  window.clearTimeout(hideTimer)
})
</script>

<style scoped>
.page-intro {
  position: fixed;
  inset: 0;
  z-index: 100000;
  background: #050814;
  opacity: 1;
  transition: opacity 0.7s ease;
}
.page-intro--leave {
  opacity: 0;
  pointer-events: none;
}
.page-intro__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.page-intro__brand {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  opacity: 0;
  text-align: center;
  transition: opacity 0.55s ease, transform 0.55s ease;
}
.page-intro__brand--on {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.page-intro__icon {
  width: 72px;
  height: 72px;
  display: block;
  margin: 0 auto 8px;
}
.page-intro__name {
  color: #fff;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}
</style>
