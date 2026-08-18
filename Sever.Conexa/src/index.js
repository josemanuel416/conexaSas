import express from 'express';
import cors from 'cors';
import path from 'path';
import net from 'net';
import fs from 'fs';
import multer from 'multer';
import { config } from './config.js';
import { PROJECT_ROOT } from './project-root.js';
import { authMiddleware, requireSuperAdmin, requireCompanyUser, requireCompanyAdmin } from './middleware/auth.js';
import { loginAdmin, getAdminProfile } from './routes/admin/auth.js';
import {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  updateCompanyModules,
  listModules,
  uploadCompanyLogo,
  uploadCompanyLogoMiddleware,
  getCompanyLogo,
} from './routes/admin/companies.js';
import {
  listAllPermissions,
  createPermission,
  updatePermission,
  validatePermissionCodeEndpoint,
} from './routes/admin/permissions.js';
import { loginCompany, getCompanyDashboard } from './routes/auth.js';
import {
  listPermissions,
  listUsers,
  getUser,
  createUser,
  updateUser,
  updateUserPermissions,
} from './routes/company/users.js';
import agendaRouter from './routes/company/agenda.js';
import ventasRouter from './routes/company/ventas.js';
import cajaRouter from './routes/company/caja.js';
import inventarioRouter from './routes/company/inventario.js';
import contabilidadRouter from './routes/company/contabilidad.js';
import catalogRouter from './routes/catalog.js';
import publicRouter from './routes/public.js';
import {
  getSiteContent,
  updateSiteContent,
  listPlans,
  createPlan,
  updatePlan,
  listContactMessages,
  updateContactMessage,
} from './routes/admin/site.js';
import {
  listSupportTickets,
  getSupportTicket,
  replySupportTicket,
  updateSupportTicketStatus,
} from './routes/admin/support.js';
import supportRouter from './routes/company/support.js';

const app = express();

const allowedOrigins = config.corsOrigins;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Download-Filename'],
  })
);
app.use(express.json());

app.use('/assets', express.static(path.join(PROJECT_ROOT, 'assets')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'server-conexa', port: config.activePort });
});

app.use('/api/public', publicRouter);

// --- Admin ---
const admin = express.Router();
admin.post('/auth/login', loginAdmin);
admin.get('/auth/me', authMiddleware, requireSuperAdmin, getAdminProfile);
admin.get('/companies', authMiddleware, requireSuperAdmin, listCompanies);
admin.get('/companies/:id', authMiddleware, requireSuperAdmin, getCompany);
admin.post('/companies', authMiddleware, requireSuperAdmin, createCompany);
admin.put('/companies/:id', authMiddleware, requireSuperAdmin, updateCompany);
admin.get('/companies/:id/logo', authMiddleware, requireSuperAdmin, getCompanyLogo);
admin.post('/companies/:id/logo', authMiddleware, requireSuperAdmin, uploadCompanyLogoMiddleware, uploadCompanyLogo);
admin.put('/companies/:id/modules', authMiddleware, requireSuperAdmin, updateCompanyModules);
admin.get('/modules', authMiddleware, requireSuperAdmin, listModules);
admin.get('/permissions', authMiddleware, requireSuperAdmin, listAllPermissions);
admin.post('/permissions', authMiddleware, requireSuperAdmin, createPermission);
admin.post('/permissions/validate', authMiddleware, requireSuperAdmin, validatePermissionCodeEndpoint);
admin.put('/permissions/:id', authMiddleware, requireSuperAdmin, updatePermission);
admin.get('/site/content', authMiddleware, requireSuperAdmin, getSiteContent);
admin.put('/site/content', authMiddleware, requireSuperAdmin, updateSiteContent);
admin.get('/plans', authMiddleware, requireSuperAdmin, listPlans);
admin.post('/plans', authMiddleware, requireSuperAdmin, createPlan);
admin.put('/plans/:id', authMiddleware, requireSuperAdmin, updatePlan);
admin.get('/contact-messages', authMiddleware, requireSuperAdmin, listContactMessages);
admin.put('/contact-messages/:id', authMiddleware, requireSuperAdmin, updateContactMessage);
admin.get('/support/tickets', authMiddleware, requireSuperAdmin, listSupportTickets);
admin.get('/support/tickets/:id', authMiddleware, requireSuperAdmin, getSupportTicket);
admin.post('/support/tickets/:id/reply', authMiddleware, requireSuperAdmin, replySupportTicket);
admin.patch('/support/tickets/:id', authMiddleware, requireSuperAdmin, updateSupportTicketStatus);
app.use('/api/admin', admin);

// --- Compañía ---
app.post('/api/auth/login', loginCompany);
app.get('/api/dashboard', authMiddleware, requireCompanyUser, getCompanyDashboard);

const company = express.Router();
company.use(authMiddleware, requireCompanyAdmin);
company.get('/permissions', listPermissions);
company.get('/users', listUsers);
company.get('/users/:id', getUser);
company.post('/users', createUser);
company.put('/users/:id', updateUser);
company.put('/users/:id/permissions', updateUserPermissions);
app.use('/api/company', company);

const companyAgenda = express.Router();
companyAgenda.use(authMiddleware, requireCompanyUser);
companyAgenda.use('/agenda', agendaRouter);
app.use('/api/company', companyAgenda);

const companyVentas = express.Router();
companyVentas.use(authMiddleware, requireCompanyUser);
companyVentas.use('/ventas', ventasRouter);
app.use('/api/company', companyVentas);

const companyCaja = express.Router();
companyCaja.use(authMiddleware, requireCompanyUser);
companyCaja.use('/caja', cajaRouter);
app.use('/api/company', companyCaja);

const companyInventario = express.Router();
companyInventario.use(authMiddleware, requireCompanyUser);
companyInventario.use('/inventario', inventarioRouter);
app.use('/api/company', companyInventario);

const companyContabilidad = express.Router();
companyContabilidad.use(authMiddleware, requireCompanyUser);
companyContabilidad.use('/contabilidad', contabilidadRouter);
app.use('/api/company', companyContabilidad);

const companyCatalog = express.Router();
companyCatalog.use(authMiddleware, requireCompanyUser);
companyCatalog.use('/catalog', catalogRouter);
app.use('/api/company', companyCatalog);

const companySupport = express.Router();
companySupport.use(authMiddleware, requireCompanyUser);
companySupport.use('/support', supportRouter);
app.use('/api/company', companySupport);

// Error handler
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'El logo no puede superar 2 MB'
      : err.message;
    return res.status(400).json({ error: message });
  }
  if (err?.message?.includes('Solo se permiten imágenes')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function resolvePort(preferred) {
  for (let offset = 0; offset < 10; offset += 1) {
    const port = preferred + offset;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Sin puertos libres desde ${preferred}`);
}

async function startServer() {
  const preferred = config.port;
  const port = await resolvePort(preferred);
  config.activePort = port;

  if (port !== preferred) {
    console.warn(`Puerto ${preferred} ocupado; Sever.Conexa usará ${port}`);
  }

  fs.writeFileSync(path.join(process.cwd(), '.runtime-port'), String(port));

  const server = app.listen(port, () => {
    console.log(`Server.Conexa corriendo en http://localhost:${port}`);
  });

  server.on('error', (err) => {
    console.error('Error al iniciar el servidor:', err.message);
    process.exit(1);
  });

  function shutdown() {
    server.close();
  }

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
