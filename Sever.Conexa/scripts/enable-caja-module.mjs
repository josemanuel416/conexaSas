import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows: mods } = await pool.query("SELECT id FROM modules WHERE code = 'caja'");
if (!mods[0]) {
  console.error('Módulo caja no encontrado');
  process.exit(1);
}

const { rows: companies } = await pool.query('SELECT id, name FROM companies');
for (const c of companies) {
  await pool.query(
    `INSERT INTO company_modules (company_id, module_id, is_enabled)
     VALUES ($1, $2, true)
     ON CONFLICT (company_id, module_id) DO UPDATE SET is_enabled = true`,
    [c.id, mods[0].id],
  );
  console.log('Caja habilitada para:', c.name);
}

await pool.end();
