import express from 'express';
import { config } from './config.js';
import { pool } from './db/pool.js';
import webhookRoutes from './routes/webhook.js';

const app = express();

app.use(express.json());

app.use('/', webhookRoutes);

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('Conexión a PostgreSQL establecida');
  } catch (error) {
    console.error('No se pudo conectar a PostgreSQL:', error.message);
    console.error('Ejecuta "npm run db:migrate" después de configurar tu .env');
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`ChatBoot escuchando en http://localhost:${config.port}`);
    console.log(`Webhook: http://localhost:${config.port}/webhook`);
  });
}

start();
