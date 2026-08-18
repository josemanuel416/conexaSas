import pg from 'pg';

const adminUrl = 'postgresql://postgres:JUANMANUEL@localhost:5432/postgres';
const client = new pg.Client({ connectionString: adminUrl });

await client.connect();

const { rows } = await client.query(
  `SELECT 1 FROM pg_database WHERE datname = 'Conexa'`
);

if (rows.length === 0) {
  await client.query('CREATE DATABASE "Conexa"');
  console.log('✓ Base de datos Conexa creada');
} else {
  console.log('✓ Base de datos Conexa ya existe');
}

await client.end();
