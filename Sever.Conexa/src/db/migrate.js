import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { config } from '../config.js';
import { seedDaneLocations } from './seed-dane.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(__dirname, '../../../Scripts/database');

async function runSqlFile(filename) {
  const filePath = path.join(scriptsDir, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
  console.log(`✓ ${filename}`);
}

async function seedAdmin() {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`
  );

  if (rows.length > 0) {
    console.log('✓ Admin ya existe, omitiendo seed');
    return;
  }

  const hash = await bcrypt.hash(config.admin.password, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, company_id)
     VALUES ($1, $2, $3, 'super_admin', NULL)`,
    [config.admin.email, hash, config.admin.name]
  );
  console.log(`✓ Admin creado: ${config.admin.email}`);
}

async function seedConexaSoftCompany() {
  const { rows } = await pool.query(
    `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
    [config.conexasoft.slug]
  );

  if (!rows[0]) {
    console.log('⚠ Compañía ConexaSoft no encontrada (ejecute 029_conexasoft_company.sql)');
    return;
  }

  const companyId = rows[0].id;
  const { rows: existing } = await pool.query(
    `SELECT id FROM users
     WHERE company_id = $1 AND role = 'company_admin' AND email = $2
     LIMIT 1`,
    [companyId, config.conexasoft.adminEmail]
  );

  if (existing.length > 0) {
    console.log('✓ Usuario ConexaSoft ya existe, omitiendo seed');
    return;
  }

  const hash = await bcrypt.hash(config.conexasoft.adminPassword, 12);
  await pool.query(
    `INSERT INTO users (company_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, 'company_admin')`,
    [companyId, config.conexasoft.adminEmail, hash, config.conexasoft.adminName]
  );
  console.log(`✓ Usuario ConexaSoft creado: ${config.conexasoft.adminEmail}`);
}

async function migrate() {
  console.log('Ejecutando migraciones...\n');

  await runSqlFile('001_init_schema.sql');
  await runSqlFile('003_add_agenda_citas.sql');
  await runSqlFile('004_permissions_users.sql');
  await runSqlFile('005_agenda_citas.sql');
  await runSqlFile('006_ventas_facturacion.sql');
  await runSqlFile('007_company_theme.sql');
  await runSqlFile('008_sales_documents.sql');
  await runSqlFile('009_client_dian_fields.sql');
  await runSqlFile('010_dane_locations.sql');
  await runSqlFile('011_company_system_variables.sql');
  await runSqlFile('012_dian_config_fields.sql');
  await runSqlFile('013_company_invoice_email.sql');
  await runSqlFile('014_dian_software_pin.sql');
  await runSqlFile('015_dian_certificate.sql');
  await runSqlFile('016_dian_cert_subject_dv.sql');
  await runSqlFile('017_client_middle_name.sql');
  await runSqlFile('018_dian_file_sequences.sql');
  await runSqlFile('019_company_logo_invoice.sql');
  await runSqlFile('020_dian_environment_pruebas.sql');
  await runSqlFile('021_dian_credit_note_concepts.sql');
  await runSqlFile('022_credit_note_sequence.sql');
  await runSqlFile('023_invoice_source_dian_numbers.sql');
  await runSqlFile('024_caja.sql');
  await runSqlFile('025_caja_enhancements.sql');
  await runSqlFile('026_caja_service_id.sql');
  await runSqlFile('027_caja_receipt_status.sql');
  await runSqlFile('028_conexasoft_theme_defaults.sql');
  await runSqlFile('029_conexasoft_company.sql');
  await runSqlFile('030_inventario.sql');
  await runSqlFile('031_inventario_detail_fields.sql');
  await runSqlFile('032_inventario_movement_config.sql');
  await runSqlFile('033_contabilidad.sql');
  await runSqlFile('034_accounting_account_level.sql');
  await runSqlFile('035_accounting_taxes.sql');
  await runSqlFile('036_accounting_reports_permission.sql');
  await runSqlFile('037_public_site_support.sql');
  await runSqlFile('038_site_landing_copy.sql');
  await seedDaneLocations();
  await seedAdmin();
  await seedConexaSoftCompany();

  console.log('\nMigraciones completadas.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
