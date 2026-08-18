import dotenv from 'dotenv';
import pg from 'pg';
import { resolveSecret } from '../src/utils/dian-certificate.js';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`SELECT dian_software_pin FROM companies WHERE nit = '902031938'`);
const pin = resolveSecret(rows[0]?.dian_software_pin);
console.log('pin_len', pin?.length || 0);
await pool.end();
