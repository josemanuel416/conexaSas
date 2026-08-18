export function formatAccount(row, parent = null) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    parentAccountId: row.parent_account_id,
    parentAccountCode: parent?.code || row.parent_account_code || null,
    parentAccountName: parent?.name || row.parent_account_name || null,
    accountClass: row.account_class,
    level: row.level,
    status: row.status,
    requiresThirdParty: row.requires_third_party,
    requiresTax: row.requires_tax,
    taxCode: row.tax_code,
    requiresInvoice: row.requires_invoice,
    requiresCostCenter: row.requires_cost_center,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatVoucherType(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    sortOrder: row.sort_order,
    lastReference: row.last_reference != null ? Number(row.last_reference) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatCostCenter(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatPeriod(row) {
  if (!row) return null;
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    yearMonth: row.year_month,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildYearMonth(year, month) {
  return Number(year) * 100 + Number(month);
}

export function parseYearMonth(yearMonth) {
  const ym = Number(yearMonth);
  return {
    year: Math.floor(ym / 100),
    month: ym % 100,
  };
}

export function formatTax(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatTaxClass(row) {
  if (!row) return null;
  return {
    id: row.id,
    taxId: row.tax_id,
    taxCode: row.tax_code,
    taxName: row.tax_name,
    classCode: row.class_code,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatTaxRate(row) {
  if (!row) return null;
  return {
    id: row.id,
    taxId: row.tax_id,
    taxCode: row.tax_code,
    taxName: row.tax_name,
    taxClassId: row.tax_class_id,
    classCode: row.class_code,
    classDescription: row.class_description,
    rateValue: Number(row.rate_value),
    startDate: row.start_date,
    endDate: row.end_date,
    minAmount: Number(row.min_amount),
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
