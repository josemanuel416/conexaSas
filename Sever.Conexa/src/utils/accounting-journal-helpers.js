import { buildYearMonth } from './accounting-helpers.js';
import { clientFullNameExpr } from './client-format.js';

export function yearMonthFromDate(dateValue) {
  const raw = String(dateValue || '').slice(0, 10);
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return buildYearMonth(d.getFullYear(), d.getMonth() + 1);
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function formatJournalEntry(row, lines = []) {
  if (!row) return null;
  return {
    id: row.id,
    voucherNumber: Number(row.voucher_number),
    accountingDate: row.accounting_date,
    yearMonth: row.year_month,
    voucherTypeId: row.voucher_type_id,
    voucherTypeCode: row.voucher_type_code,
    voucherTypeName: row.voucher_type_name,
    typeReference: Number(row.type_reference),
    fullReference: row.full_reference || `${row.voucher_type_code || ''}-${row.type_reference || ''}`,
    description: row.description,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    totalDebit: round2(row.total_debit),
    totalCredit: round2(row.total_credit),
    status: row.status,
    source: row.source,
    lines: lines.map(formatJournalLine),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatJournalLine(row) {
  if (!row) return null;
  return {
    id: row.id,
    lineNumber: row.line_number,
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    thirdPartyId: row.third_party_id,
    thirdPartyName: row.third_party_name,
    costCenterId: row.cost_center_id,
    costCenterCode: row.cost_center_code,
    lineType: row.line_type,
    invoiceNumber: row.invoice_number,
    reference: row.reference,
    taxBase: round2(row.tax_base),
    taxAmount: round2(row.tax_amount),
    amount: round2(row.amount),
    description: row.description,
  };
}

export function computeLineTotals(lines = []) {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    const amount = round2(line.amount);
    if (line.lineType === 'db') totalDebit += amount;
    else if (line.lineType === 'cr') totalCredit += amount;
  }
  return { totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
}

export function validateJournalLines(lines, accountsById) {
  if (!Array.isArray(lines) || !lines.length) {
    throw Object.assign(new Error('Agregue al menos una línea al comprobante'), { status: 400 });
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const account = accountsById.get(line.accountId);
    if (!account) {
      throw Object.assign(new Error(`Línea ${i + 1}: cuenta no válida`), { status: 400 });
    }
    if (account.account_type !== 'detalle') {
      throw Object.assign(new Error(`Línea ${i + 1}: solo cuentas detalle (${account.code})`), { status: 400 });
    }
    if (!['db', 'cr'].includes(line.lineType)) {
      throw Object.assign(new Error(`Línea ${i + 1}: tipo debe ser db o cr`), { status: 400 });
    }
    const amount = round2(line.amount);
    if (amount <= 0) {
      throw Object.assign(new Error(`Línea ${i + 1}: el valor debe ser mayor a cero`), { status: 400 });
    }
    if (account.requires_third_party && !line.thirdPartyId) {
      throw Object.assign(new Error(`Línea ${i + 1}: la cuenta ${account.code} requiere tercero`), { status: 400 });
    }
    if (account.requires_cost_center && !line.costCenterId) {
      throw Object.assign(new Error(`Línea ${i + 1}: la cuenta ${account.code} requiere centro de costo`), { status: 400 });
    }
    if (account.requires_invoice && !line.invoiceNumber?.trim()) {
      throw Object.assign(new Error(`Línea ${i + 1}: la cuenta ${account.code} requiere número de factura`), { status: 400 });
    }
  }

  const { totalDebit, totalCredit } = computeLineTotals(lines);
  if (totalDebit !== totalCredit) {
    throw Object.assign(
      new Error(`El comprobante no cuadra: débitos ${totalDebit} ≠ créditos ${totalCredit}`),
      { status: 400 },
    );
  }
  if (totalDebit <= 0) {
    throw Object.assign(new Error('El total del comprobante debe ser mayor a cero'), { status: 400 });
  }

  return { totalDebit, totalCredit };
}

export async function allocateJournalNumbers(client, companyId, voucherTypeId) {
  const seq = await client.query(
    `INSERT INTO accounting_journal_sequences (company_id, last_voucher_number)
     VALUES ($1, 1)
     ON CONFLICT (company_id) DO UPDATE
       SET last_voucher_number = accounting_journal_sequences.last_voucher_number + 1,
           updated_at = NOW()
     RETURNING last_voucher_number`,
    [companyId],
  );
  const typeSeq = await client.query(
    `INSERT INTO accounting_voucher_type_sequences (company_id, voucher_type_id, last_reference)
     VALUES ($1, $2, 1)
     ON CONFLICT (voucher_type_id) DO UPDATE
       SET last_reference = accounting_voucher_type_sequences.last_reference + 1,
           updated_at = NOW()
     RETURNING last_reference`,
    [companyId, voucherTypeId],
  );
  return {
    voucherNumber: Number(seq.rows[0].last_voucher_number),
    typeReference: Number(typeSeq.rows[0].last_reference),
  };
}

export async function loadJournalEntry(client, companyId, id) {
  const { rows } = await client.query(
    `SELECT e.*, vt.code AS voucher_type_code, vt.name AS voucher_type_name,
            u.full_name AS created_by_name,
            CONCAT(vt.code, '-', e.type_reference) AS full_reference
     FROM accounting_journal_entries e
     JOIN accounting_voucher_types vt ON vt.id = e.voucher_type_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.id = $1 AND e.company_id = $2`,
    [id, companyId],
  );
  if (!rows[0]) return null;

  const { rows: lineRows } = await client.query(
    `SELECT l.*, a.code AS account_code, a.name AS account_name,
            ${clientFullNameExpr('c')} AS third_party_name,
            cc.code AS cost_center_code
     FROM accounting_journal_lines l
     JOIN accounting_accounts a ON a.id = l.account_id
     LEFT JOIN clients c ON c.id = l.third_party_id
     LEFT JOIN accounting_cost_centers cc ON cc.id = l.cost_center_id
     WHERE l.journal_entry_id = $1
     ORDER BY l.line_number`,
    [id],
  );

  return formatJournalEntry(rows[0], lineRows);
}

export async function assertOpenPeriod(client, companyId, yearMonth) {
  const { rows } = await client.query(
    `SELECT * FROM accounting_periods WHERE company_id = $1 AND year_month = $2`,
    [companyId, yearMonth],
  );
  if (!rows[0]) {
    throw Object.assign(new Error(`No existe periodo contable ${yearMonth}`), { status: 400 });
  }
  if (rows[0].status !== 'abierto') {
    throw Object.assign(new Error('El periodo contable está cerrado'), { status: 400 });
  }
  return rows[0];
}

export async function loadAccountsMap(client, companyId, accountIds) {
  const { rows } = await client.query(
    `SELECT * FROM accounting_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])`,
    [companyId, accountIds],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export function normalizeJournalLines(lines = []) {
  return lines.map((line, idx) => ({
    accountId: line.accountId,
    thirdPartyId: line.thirdPartyId || null,
    costCenterId: line.costCenterId || null,
    lineType: line.lineType,
    invoiceNumber: line.invoiceNumber?.trim() || null,
    reference: line.reference?.trim() || null,
    taxBase: round2(line.taxBase),
    taxAmount: round2(line.taxAmount),
    amount: round2(line.amount),
    description: line.description?.trim() || null,
    lineNumber: idx + 1,
  }));
}
