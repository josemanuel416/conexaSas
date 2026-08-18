import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 3500,
  activePort: null,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@conexa.com',
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
    name: process.env.ADMIN_NAME || 'Administrador Conexa',
  },
  /** Compañía operativa ConexaSoft (login tenant, no panel /admin) */
  conexasoft: {
    slug: process.env.CONEXASOFT_SLUG || 'conexasoft',
    adminEmail: process.env.CONEXASOFT_ADMIN_EMAIL || 'admin@conexasoft.com',
    adminPassword: process.env.CONEXASOFT_ADMIN_PASSWORD || 'Admin123!',
    adminName: process.env.CONEXASOFT_ADMIN_NAME || 'Administrador ConexaSoft',
  },
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:9500')
    .split(',')
    .map((o) => o.trim()),
  certStoragePath: process.env.CERT_STORAGE_PATH
    || path.resolve(process.cwd(), 'storage/dian-certs'),
  fePosCertRoot: process.env.FEPOS_CERT_ROOT
    || path.resolve(process.cwd(), '../ServerFEpos/cert/companies'),
  fePosUrl: process.env.FEPOS_URL || 'http://localhost:3010',
  /** GetAcquirer consulta la base real de adquirientes (produccion), aunque facture en pruebas/habilitación */
  dianAcquirerEnv: process.env.DIAN_ACQUIRER_ENV || 'produccion',
};
