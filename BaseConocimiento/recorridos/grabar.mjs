import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const videosDir = path.join(repo, 'BaseConocimiento/videos')
const tmpDir = path.join(here, 'tmp')
const erpUrl = process.env.CONEXA_ERP_URL || 'http://localhost:9500'

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = value
  }
}

loadEnv(path.join(repo, 'Sever.Conexa/.env'))

const email = process.env.CONEXA_MANUAL_EMAIL || process.env.CONEXASOFT_ADMIN_EMAIL || 'admin@conexasoft.com'
const password = process.env.CONEXA_MANUAL_PASSWORD || process.env.CONEXASOFT_ADMIN_PASSWORD || 'Admin123!'
const slug = process.env.CONEXA_MANUAL_SLUG || process.env.CONEXASOFT_SLUG || 'conexasoft'
const demo = JSON.parse(fs.readFileSync(path.join(here, 'demo.json'), 'utf8'))

function fecha(dias) {
  const date = new Date()
  date.setDate(date.getDate() + dias)
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mes}-${dia}`
}

async function paso(page, texto) {
  await page.evaluate((texto) => {
    let el = document.getElementById('manual-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'manual-caption'
      Object.assign(el.style, {
        position: 'fixed',
        left: '16px',
        bottom: '16px',
        zIndex: '100000',
        background: '#0d47a1',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        font: '600 18px/1.35 Roboto, sans-serif',
        maxWidth: '680px',
        boxShadow: '0 8px 24px rgba(0,0,0,.28)',
      })
      document.body.appendChild(el)
    }
    el.textContent = texto
  }, texto)
  await page.waitForTimeout(1100)
}

async function ingresar(page) {
  await page.goto(`${erpUrl}/#/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  const codigo = page.locator('.q-field').filter({ hasText: 'Código de empresa' }).locator('input')
  if (await codigo.count()) await codigo.fill(slug)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  try {
    await page.waitForURL(/#\/dashboard/, { timeout: 12000 })
  } catch {
    if (await codigo.count()) {
      await codigo.fill(slug)
      await page.getByRole('button', { name: 'Ingresar' }).click()
    }
    await page.waitForURL(/#\/dashboard/, { timeout: 20000 })
  }
  await page.waitForTimeout(600)
}

function itemMenu(page, texto) {
  return page.locator('.company-drawer .q-item').filter({
    has: page.getByText(texto, { exact: true }),
  }).last()
}

async function ir(page, modulo, pantalla, titulo) {
  const destino = itemMenu(page, pantalla)
  if (modulo && !(await destino.isVisible())) {
    await itemMenu(page, modulo).click()
    await page.waitForTimeout(400)
  }
  await destino.click()
  await page.getByRole('heading', { name: titulo }).waitFor()
  await page.waitForTimeout(500)
}

function campo(page, etiqueta) {
  return page.locator('.company-form-dialog .q-field').filter({
    has: page.locator('.q-field__label', { hasText: etiqueta }),
  }).first()
}

async function escribir(page, etiqueta, valor) {
  const field = campo(page, etiqueta)
  await field.scrollIntoViewIfNeeded()
  await field.locator('input, textarea').first().fill(String(valor))
  await page.waitForTimeout(250)
}

async function elegir(page, etiqueta, texto) {
  const field = campo(page, etiqueta)
  await field.scrollIntoViewIfNeeded()
  await field.click()
  const input = field.locator('input')
  if (await input.count()) await input.fill(texto)
  const opcion = page.locator('.q-menu .q-item').filter({ hasText: texto }).first()
  await opcion.waitFor({ state: 'visible', timeout: 8000 })
  await opcion.click()
  await page.waitForTimeout(400)
}

async function cotizacion(page) {
  await ingresar(page)
  await paso(page, 'Entre a Cotización.')
  await ir(page, null, 'Cotización', 'Cotizaciones')
  await paso(page, 'Pulse Nueva cotización.')
  await page.getByRole('button', { name: 'Nueva cotización' }).first().click()
  await page.locator('.company-form-dialog').getByText('Nueva cotización', { exact: true }).waitFor()
  await paso(page, 'Elija el cliente. La emisión queda en hoy y usted define hasta cuándo es válida.')
  await elegir(page, 'Cliente', demo.cliente)
  await paso(page, 'Agregue el servicio. La cantidad y el precio salen del catálogo.')
  await page.locator('.sales-doc-lines__row .q-select').first().click()
  await page.locator('.q-menu .q-item').filter({ hasText: demo.servicio }).first().click()
  await page.waitForTimeout(500)
  await escribir(page, 'Observaciones', 'Propuesta de demostración del manual.')
  await paso(page, 'Guarde el borrador. Después puede confirmarlo o clonarlo.')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.getByText('Borrador guardado').waitFor({ timeout: 20000 })
  await paso(page, 'La cotización queda en la lista, todavía sin facturar.')
}

async function lote(page) {
  await ingresar(page)
  await paso(page, 'Entre a Movimientos de inventario.')
  await ir(page, demo.moduloInventario, 'Movimientos', 'Movimientos')
  await paso(page, 'Cree una entrada por compra. Este video no la confirma.')
  await page.getByRole('button', { name: 'Nuevo movimiento' }).first().click()
  await page.locator('.company-form-dialog').getByText('Nuevo movimiento', { exact: true }).waitFor()
  const factura = campo(page, 'N. factura')
  if (!(await factura.isVisible())) await elegir(page, 'Tipo', '01')
  await factura.waitFor({ state: 'visible' })
  await paso(page, 'Indique proveedor, N. factura, fecha de generación y vencimiento.')
  await elegir(page, 'Proveedor', demo.cliente)
  await escribir(page, 'N. factura', 'FAC-1001')
  await escribir(page, 'Fecha de generación', fecha(0))
  await escribir(page, 'Fecha de vencimiento', fecha(30))
  await paso(page, 'Agregue el artículo, la cantidad, el costo y el lote del proveedor.')
  await elegir(page, 'Artículo', demo.articulo)
  await escribir(page, 'Cantidad', '2')
  await escribir(page, 'Costo compra', '25000')
  await page.getByText('Lote proveedor').waitFor()
  await escribir(page, 'Lote proveedor', 'LOTE-DEMO-01')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.getByText('Movimiento guardado en borrador').waitFor({ timeout: 20000 })
  await paso(page, 'Abra la fila. El lote escrito sigue en el borrador.')
  await page.locator('.company-data-table__expand-toggle').first().click()
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((input) => input.value === 'LOTE-DEMO-01'))
  await paso(page, 'El lote interno se asigna al confirmar, no mientras está en borrador.')
  await page.getByRole('button', { name: 'Guardar ítems' }).click()
  await page.getByText('Ítems actualizados').waitFor({ timeout: 20000 })
}

async function existencias(page) {
  await ingresar(page)
  await paso(page, 'Entre a Existencias.')
  await ir(page, demo.moduloInventario, 'Existencias', 'Existencias')
  await paso(page, 'Aquí ve el saldo por bodega, artículo y lote.')
  const bodega = page.locator('.q-field').filter({
    has: page.locator('.q-field__label', { hasText: 'Bodega' }),
  }).first()
  await bodega.click()
  const opcion = page.locator('.q-menu .q-item').filter({ hasText: demo.bodega }).first()
  await opcion.waitFor({ state: 'visible' })
  await opcion.click()
  await page.waitForTimeout(800)
  await paso(page, 'Un borrador no cambia el saldo. El stock se mueve al confirmar el movimiento.')
}

async function grabar(browser, id, recorrer) {
  fs.mkdirSync(tmpDir, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    locale: 'es-CO',
    recordVideo: { dir: tmpDir, size: { width: 1366, height: 768 } },
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const hide = () => {
      if (document.getElementById('manual-hide-help')) return
      const style = document.createElement('style')
      style.id = 'manual-hide-help'
      style.textContent = '.help-chat{display:none !important}'
      document.documentElement.appendChild(style)
    }
    new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true })
    hide()
  })
  let listo = false
  try {
    await recorrer(page)
    await page.waitForTimeout(1200)
    listo = true
  } catch (error) {
    const shot = path.join(tmpDir, `${id}-error.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    error.message = `${id}: ${error.message} (captura en ${shot})`
    throw error
  } finally {
    const video = page.video()
    await context.close()
    if (listo && video) {
      fs.mkdirSync(videosDir, { recursive: true })
      fs.copyFileSync(await video.path(), path.join(videosDir, `${id}.webm`))
      console.log(`Video listo: videos/${id}.webm`)
    }
  }
}

const browser = await chromium.launch({ slowMo: 140 })
try {
  await grabar(browser, 'proc-cotizacion', cotizacion)
  await grabar(browser, 'proc-lote-proveedor', lote)
  await grabar(browser, 'proc-existencias', existencias)
} finally {
  await browser.close()
}
