import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/permissions.js';
import {
  yearMonthFromDate,
  validateJournalLines,
  normalizeJournalLines,
  allocateJournalNumbers,
  loadJournalEntry,
  assertOpenPeriod,
  loadAccountsMap,
  round2,
} from '../../utils/accounting-journal-helpers.js';
import {
  closeAccountingPeriod,
  buildTrialBalance,
  buildAuxiliaryLedger,
  buildGeneralBalance,
} from '../../utils/accounting-period-close.js';
import { formatClient } from '../../utils/client-format.js';

export default function attachJournalRoutes(router) {
  router.get('/journal-entries', requirePermission('contabilidad.acceso', 'contabilidad.movimientos'), async (req, res) => {
    const params = [req.user.companyId];
    let sql = `
      SELECT e.*, vt.code AS voucher_type_code, vt.name AS voucher_type_name,
             u.full_name AS created_by_name,
             CONCAT(vt.code, '-', e.type_reference) AS full_reference
      FROM accounting_journal_entries e
      JOIN accounting_voucher_types vt ON vt.id = e.voucher_type_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE e.company_id = $1`;

    if (req.query.yearMonth) {
      params.push(Number(req.query.yearMonth));
      sql += ` AND e.year_month = $${params.length}`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      sql += ` AND e.status = $${params.length}`;
    }

    sql += ' ORDER BY e.accounting_date DESC, e.voucher_number DESC LIMIT 500';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r) => ({
      id: r.id,
      voucherNumber: Number(r.voucher_number),
      accountingDate: r.accounting_date,
      yearMonth: r.year_month,
      voucherTypeCode: r.voucher_type_code,
      voucherTypeName: r.voucher_type_name,
      typeReference: Number(r.type_reference),
      fullReference: r.full_reference,
      description: r.description,
      createdByName: r.created_by_name,
      totalDebit: round2(r.total_debit),
      totalCredit: round2(r.total_credit),
      status: r.status,
    })));
  });

  router.get('/journal-entries/:id', requirePermission('contabilidad.acceso', 'contabilidad.movimientos'), async (req, res) => {
    const entry = await loadJournalEntry(pool, req.user.companyId, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json(entry);
  });

  router.post('/journal-entries', requirePermission('contabilidad.movimientos'), async (req, res) => {
    const { voucherTypeId, accountingDate, description, lines, post } = req.body;
    if (!voucherTypeId || !accountingDate) {
      return res.status(400).json({ error: 'Tipo de comprobante y fecha contable son requeridos' });
    }

    const yearMonth = yearMonthFromDate(accountingDate);
    if (!yearMonth) return res.status(400).json({ error: 'Fecha contable inválida' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assertOpenPeriod(client, req.user.companyId, yearMonth);

      const normalized = normalizeJournalLines(lines);
      const accountIds = [...new Set(normalized.map((l) => l.accountId))];
      const accountsById = await loadAccountsMap(client, req.user.companyId, accountIds);
      const totals = validateJournalLines(normalized, accountsById);

      const { voucherNumber, typeReference } = await allocateJournalNumbers(
        client,
        req.user.companyId,
        voucherTypeId,
      );

      const status = post ? 'contabilizado' : 'borrador';
      const { rows } = await client.query(
        `INSERT INTO accounting_journal_entries (
           company_id, voucher_number, accounting_date, year_month, voucher_type_id,
           type_reference, description, created_by, total_debit, total_credit, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          req.user.companyId,
          voucherNumber,
          accountingDate,
          yearMonth,
          voucherTypeId,
          typeReference,
          description?.trim() || null,
          req.user.id,
          totals.totalDebit,
          totals.totalCredit,
          status,
        ],
      );

      const entryId = rows[0].id;
      for (const line of normalized) {
        await client.query(
          `INSERT INTO accounting_journal_lines (
             company_id, journal_entry_id, line_number, account_id, third_party_id,
             cost_center_id, line_type, invoice_number, reference, tax_base, tax_amount, amount, description
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            req.user.companyId, entryId, line.lineNumber, line.accountId, line.thirdPartyId,
            line.costCenterId, line.lineType, line.invoiceNumber, line.reference,
            line.taxBase, line.taxAmount, line.amount, line.description,
          ],
        );
      }

      await client.query('COMMIT');
      res.status(201).json(await loadJournalEntry(pool, req.user.companyId, entryId));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    } finally {
      client.release();
    }
  });

  router.put('/journal-entries/:id', requirePermission('contabilidad.movimientos'), async (req, res) => {
    const { accountingDate, description, lines } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: existingRows } = await client.query(
        `SELECT * FROM accounting_journal_entries WHERE id = $1 AND company_id = $2 FOR UPDATE`,
        [req.params.id, req.user.companyId],
      );
      const existing = existingRows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comprobante no encontrado' });
      }
      if (existing.status !== 'borrador') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Solo se pueden editar comprobantes en borrador' });
      }

      const nextDate = accountingDate || existing.accounting_date;
      const yearMonth = yearMonthFromDate(nextDate);
      await assertOpenPeriod(client, req.user.companyId, yearMonth);

      const normalized = normalizeJournalLines(lines);
      const accountsById = await loadAccountsMap(
        client,
        req.user.companyId,
        [...new Set(normalized.map((l) => l.accountId))],
      );
      const totals = validateJournalLines(normalized, accountsById);

      await client.query(
        `UPDATE accounting_journal_entries SET
           accounting_date = $3, year_month = $4, description = $5,
           total_debit = $6, total_credit = $7, updated_at = NOW()
         WHERE id = $1 AND company_id = $2`,
        [
          req.params.id, req.user.companyId, nextDate, yearMonth,
          description?.trim() || null, totals.totalDebit, totals.totalCredit,
        ],
      );

      await client.query(`DELETE FROM accounting_journal_lines WHERE journal_entry_id = $1`, [req.params.id]);
      for (const line of normalized) {
        await client.query(
          `INSERT INTO accounting_journal_lines (
             company_id, journal_entry_id, line_number, account_id, third_party_id,
             cost_center_id, line_type, invoice_number, reference, tax_base, tax_amount, amount, description
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            req.user.companyId, req.params.id, line.lineNumber, line.accountId, line.thirdPartyId,
            line.costCenterId, line.lineType, line.invoiceNumber, line.reference,
            line.taxBase, line.taxAmount, line.amount, line.description,
          ],
        );
      }

      await client.query('COMMIT');
      res.json(await loadJournalEntry(pool, req.user.companyId, req.params.id));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    } finally {
      client.release();
    }
  });

  router.patch('/journal-entries/:id/post', requirePermission('contabilidad.movimientos'), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const entry = await loadJournalEntry(client, req.user.companyId, req.params.id);
      if (!entry) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comprobante no encontrado' });
      }
      if (entry.status !== 'borrador') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El comprobante ya fue contabilizado o anulado' });
      }
      await assertOpenPeriod(client, req.user.companyId, entry.yearMonth);

      await client.query(
        `UPDATE accounting_journal_entries SET status = 'contabilizado', updated_at = NOW()
         WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.user.companyId],
      );
      await client.query('COMMIT');
      res.json(await loadJournalEntry(pool, req.user.companyId, req.params.id));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    } finally {
      client.release();
    }
  });

  router.patch('/journal-entries/:id/void', requirePermission('contabilidad.movimientos'), async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE accounting_journal_entries SET status = 'anulado', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status <> 'anulado'
       RETURNING id`,
      [req.params.id, req.user.companyId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json(await loadJournalEntry(pool, req.user.companyId, req.params.id));
  });

  router.post('/periods/:id/close', requirePermission('contabilidad.cerrar'), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await closeAccountingPeriod(client, req.user.companyId, req.params.id);
      await client.query('COMMIT');
      res.json({ ok: true, message: 'Periodo cerrado correctamente', ...result });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    } finally {
      client.release();
    }
  });

  router.get('/reports/trial-balance', requirePermission('contabilidad.acceso', 'contabilidad.reportes'), async (req, res) => {
    const yearMonth = Number(req.query.yearMonth);
    if (!yearMonth) return res.status(400).json({ error: 'yearMonth es requerido (ej. 202601)' });
    const rows = await buildTrialBalance(pool, req.user.companyId, yearMonth);
    res.json({ yearMonth, rows });
  });

  router.get('/reports/auxiliary-ledger', requirePermission('contabilidad.acceso', 'contabilidad.reportes'), async (req, res) => {
    const yearMonth = Number(req.query.yearMonth);
    if (!yearMonth) return res.status(400).json({ error: 'yearMonth es requerido' });
    const rows = await buildAuxiliaryLedger(pool, req.user.companyId, yearMonth, {
      accountId: req.query.accountId || null,
      thirdPartyId: req.query.thirdPartyId || null,
    });
    res.json({ yearMonth, rows });
  });

  router.get('/reports/general-balance', requirePermission('contabilidad.acceso', 'contabilidad.reportes'), async (req, res) => {
    const yearMonth = Number(req.query.yearMonth);
    if (!yearMonth) return res.status(400).json({ error: 'yearMonth es requerido' });
    const rows = await buildGeneralBalance(pool, req.user.companyId, yearMonth);
    res.json({ yearMonth, rows });
  });

  router.get('/catalog/clients', requirePermission('contabilidad.acceso', 'contabilidad.movimientos'), async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM clients
       WHERE company_id = $1 AND is_active = true
       ORDER BY first_name, last_name, business_name
       LIMIT 500`,
      [req.user.companyId],
    );
    res.json(rows.map(formatClient));
  });
}
