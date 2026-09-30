import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')

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

const { pool } = await import(pathToFileURL(path.join(repo, 'Sever.Conexa/src/db/pool.js')).href)

const slug = process.env.CONEXA_MANUAL_SLUG || process.env.CONEXASOFT_SLUG || 'conexasoft'

const company = await pool.query('SELECT id, name FROM companies WHERE slug = $1', [slug])
if (!company.rows[0]) throw new Error(`No existe la compañía ${slug}`)
const companyId = company.rows[0].id

await pool.query(
  `INSERT INTO clients (company_id, document_type, document_number, first_name, last_name, person_type)
   SELECT $1, 'CC', '800000001', 'Manual', 'Ayuda', 'natural'
   WHERE NOT EXISTS (
     SELECT 1 FROM clients WHERE company_id = $1 AND document_number = '800000001'
   )`,
  [companyId],
)

await pool.query(
  `INSERT INTO services (company_id, code, description, base_price, duration_minutes)
   SELECT $1, 'SRV-AYUDA', 'Acompañamiento comercial', 150000, 30
   WHERE NOT EXISTS (
     SELECT 1 FROM services WHERE company_id = $1 AND code = 'SRV-AYUDA'
   )`,
  [companyId],
)

await pool.query(
  `INSERT INTO inventory_articles (
     company_id, code, name, unit_of_measure, without_supplier_lot, requires_expiry_date
   )
   SELECT $1, 'ARTMAN', 'Producto de demostración', 'UND', false, false
   WHERE NOT EXISTS (
     SELECT 1 FROM inventory_articles WHERE company_id = $1 AND code = 'ARTMAN'
   )`,
  [companyId],
)

const bodega = await pool.query(
  `SELECT name FROM inventory_warehouses
   WHERE company_id = $1 AND is_active = true
   ORDER BY is_default DESC, name
   LIMIT 1`,
  [companyId],
)
const tipo = await pool.query(
  `SELECT code, name, direction FROM inventory_movement_types
   WHERE company_id = $1 AND code = '01'`,
  [companyId],
)
const modulo = await pool.query(
  `SELECT m.name
   FROM modules m
   JOIN company_modules cm ON cm.module_id = m.id
   WHERE cm.company_id = $1 AND m.code = 'inventario'`,
  [companyId],
)

if (!bodega.rows[0]) throw new Error('La compañía de prueba no tiene bodega')
if (!tipo.rows[0] || tipo.rows[0].direction !== 'entrada') {
  throw new Error('El tipo 01 debe existir y ser una entrada')
}

const demo = {
  slug,
  cliente: 'Manual Ayuda',
  documento: '800000001',
  servicio: 'Acompañamiento comercial',
  articulo: 'ARTMAN',
  articuloNombre: 'Producto de demostración',
  bodega: bodega.rows[0].name,
  tipoCompra: `${tipo.rows[0].code} — ${tipo.rows[0].name}`,
  moduloInventario: modulo.rows[0]?.name || 'Inventario',
}

fs.writeFileSync(path.join(here, 'demo.json'), `${JSON.stringify(demo, null, 2)}\n`)
console.log(`Datos de demostración listos en ${demo.slug}: ${demo.bodega}, ${demo.tipoCompra}`)
await pool.end()
