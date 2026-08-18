import { round2 } from './accounting-journal-helpers.js';
import { buildYearMonth } from './accounting-helpers.js';
import { clientFullNameExpr } from './client-format.js';

async function getPreviousYearMonth(yearMonth) {
  const year = Math.floor(yearMonth / 100);
  const month = yearMonth % 100;
  if (month === 1) return buildYearMonth(year - 1, 12);
  return buildYearMonth(year, month - 1);
}

export async function closeAccountingPeriod(client, companyId, periodId) {
  const { rows: periodRows } = await client.query(
    `SELECT * FROM accounting_periods WHERE id = $1 AND company_id = $2 FOR UPDATE`,
    [periodId, companyId],
  );
  const period = periodRows[0];
  if (!period) throw Object.assign(new Error('Periodo no encontrado'), { status: 404 });
  if (period.status === 'cerrado') throw Object.assign(new Error('El periodo ya está cerrado'), { status: 400 });

  const prevYm = await getPreviousYearMonth(period.year_month);

  const { rows: openingRows } = await client.query(
    `SELECT account_id, closing_balance
     FROM accounting_balance_month
     WHERE company_id = $1 AND year_month = $2`,
    [companyId, prevYm],
  );
  const openingByAccount = new Map(openingRows.map((r) => [r.account_id, round2(r.closing_balance)]));

  const { rows: movementRows } = await client.query(
    `SELECT l.account_id, a.code, a.name, a.account_type, a.level,
            l.third_party_id, ${clientFullNameExpr('c')} AS third_party_name,
            l.cost_center_id, cc.code AS cost_center_code,
            l.invoice_number, l.line_type, l.amount
     FROM accounting_journal_lines l
     JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
     JOIN accounting_accounts a ON a.id = l.account_id
     LEFT JOIN clients c ON c.id = l.third_party_id
     LEFT JOIN accounting_cost_centers cc ON cc.id = l.cost_center_id
     WHERE e.company_id = $1 AND e.year_month = $2 AND e.status = 'contabilizado'`,
    [companyId, period.year_month],
  );

  const monthMap = new Map();
  const thirdMap = new Map();
  const invoiceMap = new Map();

  for (const row of movementRows) {
    const amount = round2(row.amount);
    const db = row.line_type === 'db' ? amount : 0;
    const cr = row.line_type === 'cr' ? amount : 0;

    if (!monthMap.has(row.account_id)) {
      monthMap.set(row.account_id, {
        accountId: row.account_id,
        accountCode: row.code,
        accountName: row.name,
        opening: openingByAccount.get(row.account_id) || 0,
        debit: 0,
        credit: 0,
      });
    }
    const acc = monthMap.get(row.account_id);
    acc.debit = round2(acc.debit + db);
    acc.credit = round2(acc.credit + cr);

    if (row.third_party_id) {
      const tKey = `${row.account_id}:${row.third_party_id}`;
      if (!thirdMap.has(tKey)) {
        thirdMap.set(tKey, {
          accountId: row.account_id,
          accountCode: row.code,
          accountName: row.name,
          thirdPartyId: row.third_party_id,
          thirdPartyName: row.third_party_name,
          opening: 0,
          debit: 0,
          credit: 0,
        });
      }
      const t = thirdMap.get(tKey);
      t.debit = round2(t.debit + db);
      t.credit = round2(t.credit + cr);
    }

    const invKey = `${row.account_id}:${row.third_party_id || ''}:${row.cost_center_id || ''}:${row.invoice_number || ''}`;
    if (row.invoice_number) {
      if (!invoiceMap.has(invKey)) {
        invoiceMap.set(invKey, {
          accountId: row.account_id,
          accountCode: row.code,
          accountName: row.name,
          thirdPartyId: row.third_party_id,
          thirdPartyName: row.third_party_name,
          costCenterId: row.cost_center_id,
          costCenterCode: row.cost_center_code,
          invoiceNumber: row.invoice_number || '',
          opening: 0,
          debit: 0,
          credit: 0,
        });
      }
      const inv = invoiceMap.get(invKey);
      inv.debit = round2(inv.debit + db);
      inv.credit = round2(inv.credit + cr);
    }
  }

  await client.query(
    `DELETE FROM accounting_balance_month WHERE company_id = $1 AND period_id = $2`,
    [companyId, periodId],
  );
  await client.query(
    `DELETE FROM accounting_balance_third_party WHERE company_id = $1 AND period_id = $2`,
    [companyId, periodId],
  );
  await client.query(
    `DELETE FROM accounting_balance_third_party_invoice WHERE company_id = $1 AND period_id = $2`,
    [companyId, periodId],
  );

  for (const item of monthMap.values()) {
    const closing = round2(item.opening + item.debit - item.credit);
    await client.query(
      `INSERT INTO accounting_balance_month (
         company_id, period_id, year_month, account_id, account_code, account_name,
         opening_balance, debit, credit, closing_balance
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        companyId, periodId, period.year_month, item.accountId, item.accountCode, item.accountName,
        item.opening, item.debit, item.credit, closing,
      ],
    );
  }

  for (const item of thirdMap.values()) {
    const closing = round2(item.opening + item.debit - item.credit);
    await client.query(
      `INSERT INTO accounting_balance_third_party (
         company_id, period_id, year_month, account_id, account_code, account_name,
         third_party_id, third_party_name, opening_balance, debit, credit, closing_balance
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        companyId, periodId, period.year_month, item.accountId, item.accountCode, item.accountName,
        item.thirdPartyId, item.thirdPartyName, item.opening, item.debit, item.credit, closing,
      ],
    );
  }

  for (const item of invoiceMap.values()) {
    const closing = round2(item.opening + item.debit - item.credit);
    await client.query(
      `INSERT INTO accounting_balance_third_party_invoice (
         company_id, period_id, year_month, account_id, account_code, account_name,
         third_party_id, third_party_name, cost_center_id, cost_center_code, invoice_number,
         opening_balance, debit, credit, closing_balance
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        companyId, periodId, period.year_month, item.accountId, item.accountCode, item.accountName,
        item.thirdPartyId, item.thirdPartyName, item.costCenterId, item.costCenterCode,
        item.invoiceNumber, item.opening, item.debit, item.credit, closing,
      ],
    );
  }

  await client.query(
    `UPDATE accounting_periods SET status = 'cerrado', updated_at = NOW() WHERE id = $1`,
    [periodId],
  );

  return {
    periodId,
    yearMonth: period.year_month,
    accountsClosed: monthMap.size,
    thirdPartyBalances: thirdMap.size,
    invoiceBalances: invoiceMap.size,
  };
}

export async function buildTrialBalance(client, companyId, yearMonth) {
  const prevYm = await getPreviousYearMonth(yearMonth);
  const { rows } = await client.query(
    `WITH opening AS (
       SELECT account_id, closing_balance AS opening_balance
       FROM accounting_balance_month
       WHERE company_id = $1 AND year_month = $2
     ),
     moves AS (
       SELECT l.account_id, a.code, a.name, a.level,
              SUM(CASE WHEN l.line_type = 'db' THEN l.amount ELSE 0 END) AS debit,
              SUM(CASE WHEN l.line_type = 'cr' THEN l.amount ELSE 0 END) AS credit
       FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
       JOIN accounting_accounts a ON a.id = l.account_id
       WHERE e.company_id = $1 AND e.year_month = $3 AND e.status = 'contabilizado'
       GROUP BY l.account_id, a.code, a.name, a.level
     ),
     accounts AS (
       SELECT id, code, name, level FROM accounting_accounts
       WHERE company_id = $1 AND account_type = 'detalle' AND status = 'activo'
     )
     SELECT acc.id AS account_id, acc.code, acc.name, acc.level,
            COALESCE(o.opening_balance, 0) AS opening_balance,
            COALESCE(m.debit, 0) AS debit,
            COALESCE(m.credit, 0) AS credit,
            COALESCE(o.opening_balance, 0) + COALESCE(m.debit, 0) - COALESCE(m.credit, 0) AS closing_balance
     FROM accounts acc
     LEFT JOIN opening o ON o.account_id = acc.id
     LEFT JOIN moves m ON m.account_id = acc.id
     WHERE COALESCE(o.opening_balance, 0) <> 0 OR COALESCE(m.debit, 0) <> 0 OR COALESCE(m.credit, 0) <> 0
     ORDER BY acc.code`,
    [companyId, prevYm, yearMonth],
  );

  return rows.map((r) => ({
    accountId: r.account_id,
    accountCode: r.code,
    accountName: r.name,
    level: r.level,
    openingBalance: round2(r.opening_balance),
    debit: round2(r.debit),
    credit: round2(r.credit),
    closingBalance: round2(r.closing_balance),
  }));
}

export async function buildAuxiliaryLedger(client, companyId, yearMonth, { accountId, thirdPartyId } = {}) {
  const params = [companyId, yearMonth];
  let sql = `
    SELECT e.accounting_date, e.voucher_number, vt.code AS voucher_type_code, e.type_reference,
           l.line_number, l.line_type, l.amount, l.description AS line_description,
           a.code AS account_code, a.name AS account_name,
           ${clientFullNameExpr('c')} AS third_party_name, l.invoice_number, l.reference
    FROM accounting_journal_lines l
    JOIN accounting_journal_entries e ON e.id = l.journal_entry_id
    JOIN accounting_voucher_types vt ON vt.id = e.voucher_type_id
    JOIN accounting_accounts a ON a.id = l.account_id
    LEFT JOIN clients c ON c.id = l.third_party_id
    WHERE e.company_id = $1 AND e.year_month = $2 AND e.status = 'contabilizado'`;

  if (accountId) {
    params.push(accountId);
    sql += ` AND l.account_id = $${params.length}`;
  }
  if (thirdPartyId) {
    params.push(thirdPartyId);
    sql += ` AND l.third_party_id = $${params.length}`;
  }

  sql += ' ORDER BY e.accounting_date, e.voucher_number, l.line_number';

  const { rows } = await client.query(sql, params);
  return rows.map((r) => ({
    accountingDate: r.accounting_date,
    voucherNumber: Number(r.voucher_number),
    voucherTypeCode: r.voucher_type_code,
    typeReference: Number(r.type_reference),
    lineNumber: r.line_number,
    lineType: r.line_type,
    amount: round2(r.amount),
    description: r.line_description,
    accountCode: r.account_code,
    accountName: r.account_name,
    thirdPartyName: r.third_party_name,
    invoiceNumber: r.invoice_number,
    reference: r.reference,
  }));
}

export async function buildGeneralBalance(client, companyId, yearMonth) {
  const trial = await buildTrialBalance(client, companyId, yearMonth);
  const { rows: sumAccounts } = await client.query(
    `SELECT id, code, name, level, account_type FROM accounting_accounts
     WHERE company_id = $1 AND account_type = 'suma' AND status = 'activo'
     ORDER BY code`,
    [companyId],
  );

  const detailByPrefix = new Map();
  for (const row of trial) {
    for (const sum of sumAccounts) {
      if (row.accountCode.startsWith(sum.code)) {
        if (!detailByPrefix.has(sum.id)) {
          detailByPrefix.set(sum.id, {
            accountId: sum.id,
            accountCode: sum.code,
            accountName: sum.name,
            level: sum.level,
            openingBalance: 0,
            debit: 0,
            credit: 0,
            closingBalance: 0,
          });
        }
        const agg = detailByPrefix.get(sum.id);
        agg.openingBalance = round2(agg.openingBalance + row.openingBalance);
        agg.debit = round2(agg.debit + row.debit);
        agg.credit = round2(agg.credit + row.credit);
        agg.closingBalance = round2(agg.closingBalance + row.closingBalance);
        break;
      }
    }
  }

  return [...detailByPrefix.values()].filter(
    (r) => r.openingBalance || r.debit || r.credit || r.closingBalance,
  );
}
