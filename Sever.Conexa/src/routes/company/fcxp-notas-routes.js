import { requirePermission } from '../../middleware/permissions.js';
import {
  createNota,
  updateNota,
  confirmNota,
  voidNota,
  loadNota,
  loadNotasForFcxp,
  processNotaDianSend,
  getNotaSubmissionDetail,
  getDisponibilidad,
  formatNotaSubmission,
} from '../../utils/fcxp-notas.js';
import { buildFcxpNotaPdf, buildFcxpNotaPdfFileName } from '../../utils/fcxp-nota-pdf.js';
import { pool } from '../../db/pool.js';

async function loadCompanyForPdf(companyId, userId, userEmail) {
  const { rows } = await pool.query(
    `SELECT name, nit, address, phone, logo_path, verification_digit,
            theme_primary, theme_secondary, theme_accent
     FROM companies WHERE id = $1`,
    [companyId],
  );
  const company = rows[0] || {};
  const { rows: userRows } = await pool.query(
    `SELECT email, full_name FROM users WHERE id = $1`,
    [userId],
  );
  const printedByUser = userRows[0] || {};
  return {
    company: {
      name: company.name,
      nit: company.nit,
      address: company.address,
      phone: company.phone,
      logoPath: company.logo_path,
      verificationDigit: company.verification_digit,
      themePrimary: company.theme_primary,
      themeSecondary: company.theme_secondary,
      themeAccent: company.theme_accent,
    },
    printedBy: {
      email: printedByUser.email || userEmail,
      fullName: printedByUser.full_name,
    },
  };
}

function registerNotaPdfRoute(router, base, { loadFcxp }) {
  router.get(`/:id/${base}/:notaId/pdf`, requirePermission('cuentas_pagar.acceso'), async (req, res) => {
    const fcxp = await loadFcxp(req.params.id, req.user.companyId);
    if (!fcxp) return res.status(404).json({ error: 'CxP no encontrada' });

    const nota = await loadNota(req.params.notaId, req.user.companyId);
    if (!nota || nota.fcxpId !== req.params.id) {
      return res.status(404).json({ error: 'Nota no encontrada' });
    }
    if (nota.status === 'borrador') {
      return res.status(400).json({ error: 'Confirme la nota antes de generar el PDF' });
    }

    try {
      const { company, printedBy } = await loadCompanyForPdf(
        req.user.companyId,
        req.user.userId,
        req.user.email,
      );
      const { rows: submissionRows } = await pool.query(
        `SELECT signed_xml, dian_environment
         FROM fcxpdbcr_dian_submissions
         WHERE fcxpdbcr_id = $1 AND signed_xml IS NOT NULL
         ORDER BY is_success DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [nota.id],
      );
      const pdfBuffer = await buildFcxpNotaPdf({
        company,
        fcxp,
        nota,
        printedBy,
        signedXml: submissionRows[0]?.signed_xml || null,
        dianEnvironment: submissionRows[0]?.dian_environment || '',
      });
      const fileName = buildFcxpNotaPdfFileName(nota);
      const forceDownload = req.query.download === '1' || req.query.download === 'true';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Download-Filename', fileName);
      res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error('[fcxp-nota-pdf]', err);
      res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
    }
  });
}

function registerNotaRoutesForBase(router, base, { loadFcxp }) {
  router.get(`/:id/${base}/disponibilidad`, requirePermission('cuentas_pagar.acceso'), async (req, res) => {
    try {
      const excludeNotaId = req.query.excludeNotaId || null;
      const data = await getDisponibilidad(req.params.id, req.user.companyId, excludeNotaId);
      res.json(data);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  router.get(`/:id/${base}`, requirePermission('cuentas_pagar.acceso'), async (req, res) => {
    const fcxp = await loadFcxp(req.params.id, req.user.companyId);
    if (!fcxp) return res.status(404).json({ error: 'CxP no encontrada' });
    res.json(await loadNotasForFcxp(req.params.id, req.user.companyId));
  });

  router.post(`/:id/${base}`, requirePermission('cuentas_pagar.notas'), async (req, res) => {
    try {
      const nota = await createNota(req.params.id, req.user.companyId, req.user.userId, req.body);
      res.status(201).json(nota);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  router.get(`/:id/${base}/:notaId`, requirePermission('cuentas_pagar.acceso'), async (req, res) => {
    const nota = await loadNota(req.params.notaId, req.user.companyId);
    if (!nota || nota.fcxpId !== req.params.id) {
      return res.status(404).json({ error: 'Nota no encontrada' });
    }
    res.json(nota);
  });

  router.put(`/:id/${base}/:notaId`, requirePermission('cuentas_pagar.notas'), async (req, res) => {
    try {
      const nota = await updateNota(req.params.id, req.params.notaId, req.user.companyId, req.body);
      res.json(nota);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  router.post(`/:id/${base}/:notaId/confirm`, requirePermission('cuentas_pagar.notas'), async (req, res) => {
    try {
      const nota = await confirmNota(req.params.id, req.params.notaId, req.user.companyId);
      res.json({ nota, fcxp: await loadFcxp(req.params.id, req.user.companyId) });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  router.post(`/:id/${base}/:notaId/send-dian`, requirePermission('cuentas_pagar.enviar_dian'), async (req, res) => {
    const result = await processNotaDianSend(
      req.params.id,
      req.params.notaId,
      req.user.companyId,
      req.user.userId,
      loadFcxp,
    );
    res.status(result.httpStatus).json(result.body);
  });

  router.patch(`/:id/${base}/:notaId/void`, requirePermission('cuentas_pagar.notas'), async (req, res) => {
    try {
      const nota = await voidNota(req.params.id, req.params.notaId, req.user.companyId);
      res.json({ nota, fcxp: await loadFcxp(req.params.id, req.user.companyId) });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  router.get(`/:id/${base}/:notaId/submissions`, requirePermission('cuentas_pagar.acceso'), async (req, res) => {
    const nota = await loadNota(req.params.notaId, req.user.companyId);
    if (!nota || nota.fcxpId !== req.params.id) {
      return res.status(404).json({ error: 'Nota no encontrada' });
    }
    const { rows } = await pool.query(
      `SELECT * FROM fcxpdbcr_dian_submissions
       WHERE fcxpdbcr_id = $1 AND company_id = $2 ORDER BY attempt_number`,
      [req.params.notaId, req.user.companyId],
    );
    res.json(rows.map(formatNotaSubmission));
  });

  router.get(`/:id/${base}/:notaId/submissions/:attempt/detail`, requirePermission('cuentas_pagar.acceso'), async (req, res) => {
    const attempt = Number(req.params.attempt);
    if (!Number.isFinite(attempt) || attempt < 1) {
      return res.status(400).json({ error: 'Número de intento inválido' });
    }
    const detail = await getNotaSubmissionDetail(
      req.params.id,
      req.params.notaId,
      req.user.companyId,
      attempt,
    );
    if (!detail) return res.status(404).json({ error: 'Envío no encontrado' });
    res.json(detail);
  });
}

export function registerFcxpNotasRoutes(router, deps) {
  for (const base of ['notas', 'notes']) {
    registerNotaRoutesForBase(router, base, deps);
    registerNotaPdfRoute(router, base, deps);
  }
}
