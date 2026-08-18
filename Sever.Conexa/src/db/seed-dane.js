import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.resolve(__dirname, '../../../Scripts/database/seeds');

function padDept(id) {
  return String(id).padStart(2, '0');
}

function padCity(id) {
  return String(id).padStart(5, '0');
}

export async function seedDaneLocations() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM dane_departments');
  if (rows[0].count > 0) {
    console.log('✓ Catálogo DANE ya cargado, omitiendo seed');
    return;
  }

  const deptPath = path.join(seedsDir, 'dane-departments.json');
  const citiesPath = path.join(seedsDir, 'dane-cities.json');

  if (!fs.existsSync(deptPath) || !fs.existsSync(citiesPath)) {
    console.warn('⚠ Archivos seed DANE no encontrados en Scripts/database/seeds/');
    return;
  }

  const departments = JSON.parse(fs.readFileSync(deptPath, 'utf8')).data;
  const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8')).data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const d of departments) {
      await client.query(
        `INSERT INTO dane_departments (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
        [padDept(d.id), d.name]
      );
    }

    for (const c of cities) {
      await client.query(
        `INSERT INTO dane_cities (code, department_code, name) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
        [padCity(c.id), padDept(c.departmentId), c.name]
      );
    }

    await client.query('COMMIT');
    console.log(`✓ Catálogo DANE: ${departments.length} departamentos, ${cities.length} municipios`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
