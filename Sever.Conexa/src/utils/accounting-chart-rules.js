export function normalizeAccountCode(raw) {
  return String(raw ?? '').trim().replace(/\s/g, '');
}

export function isValidAccountCodeLength(len) {
  if (len === 1) return true;
  return len >= 2 && len % 2 === 0;
}

export function getAccountLevel(code) {
  const normalized = normalizeAccountCode(code);
  const len = normalized.length;
  if (!isValidAccountCodeLength(len)) return null;
  if (len === 1) return 1;
  if (len === 2) return 2;
  return len / 2 + 1;
}

export function getParentAccountCode(code) {
  const normalized = normalizeAccountCode(code);
  const level = getAccountLevel(normalized);
  if (!level || level === 1) return null;
  if (level === 2) return normalized.substring(0, 1);
  return normalized.substring(0, normalized.length - 2);
}

export function validateAccountCode(code) {
  const normalized = normalizeAccountCode(code);
  if (!normalized) {
    return { ok: false, error: 'La cuenta es requerida' };
  }
  if (!/^\d+$/.test(normalized)) {
    return { ok: false, error: 'La cuenta solo puede contener dígitos' };
  }
  const len = normalized.length;
  if (!isValidAccountCodeLength(len)) {
    return {
      ok: false,
      error: `Longitud inválida (${len}). Use 1, 2, 4, 6, 8... (no longitudes impares salvo nivel 1)`,
    };
  }
  return {
    ok: true,
    code: normalized,
    level: getAccountLevel(normalized),
    parentCode: getParentAccountCode(normalized),
  };
}

export function parseBoolCell(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (['si', 'sí', 's', '1', 'true', 'verdadero', 'x'].includes(s)) return true;
  if (['no', 'n', '0', 'false', 'falso'].includes(s)) return false;
  return defaultValue;
}

export function parseAccountType(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'suma') return 'suma';
  if (s === 'detalle') return 'detalle';
  return null;
}

export function parseAccountClass(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (['cxc', 'cxp', 'otros'].includes(s)) return s;
  return null;
}

export function parseRecordStatus(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'activo') return 'activo';
  if (s === 'inactivo') return 'inactivo';
  return null;
}

export function validateAccountRow(row, codeSet, parentTypeByCode) {
  const errors = [];
  const codeCheck = validateAccountCode(row.code);
  if (!codeCheck.ok) {
    errors.push(codeCheck.error);
    return { ok: false, errors };
  }

  const { code, level, parentCode } = codeCheck;

  if (!row.name?.trim()) {
    errors.push('Nombre cuenta es requerido');
  }

  const accountType = parseAccountType(row.accountType);
  if (!accountType) {
    errors.push('Tipo debe ser suma o detalle');
  }

  const accountClass = parseAccountClass(row.accountClass) || 'otros';
  const status = parseRecordStatus(row.status) || 'activo';

  if (level === 1 && accountType === 'detalle') {
    errors.push('Las cuentas de nivel 1 deben ser tipo suma');
  }

  if (level > 1) {
    if (!parentCode) {
      errors.push('No se pudo determinar la cuenta suma');
    } else if (!codeSet.has(parentCode)) {
      errors.push(`La cuenta suma "${parentCode}" no existe en el plan`);
    } else if (parentTypeByCode.get(parentCode) !== 'suma') {
      errors.push(`La cuenta suma "${parentCode}" debe ser tipo suma`);
    }
  }

  if (accountType === 'detalle' && level > 1 && parentCode && parentTypeByCode.get(parentCode) !== 'suma') {
    errors.push('Las cuentas detalle requieren una cuenta suma padre');
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      code,
      name: String(row.name).trim(),
      level,
      accountType,
      parentCode,
      accountClass,
      status,
      requiresThirdParty: parseBoolCell(row.requiresThirdParty),
      requiresTax: parseBoolCell(row.requiresTax),
      taxCode: parseBoolCell(row.requiresTax) && row.taxCode?.trim() ? row.taxCode.trim() : null,
      requiresInvoice: parseBoolCell(row.requiresInvoice),
      requiresCostCenter: parseBoolCell(row.requiresCostCenter),
    },
  };
}

export function sortAccountsByLevel(rows) {
  return [...rows].sort((a, b) => {
    const la = getAccountLevel(a.code) || 0;
    const lb = getAccountLevel(b.code) || 0;
    if (la !== lb) return la - lb;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

export function buildImportValidationMaps(rows) {
  const codeSet = new Set();
  const parentTypeByCode = new Map();

  for (const row of rows) {
    const check = validateAccountCode(row.code);
    if (check.ok) {
      codeSet.add(check.code);
      const type = parseAccountType(row.accountType);
      if (type) parentTypeByCode.set(check.code, type);
    }
  }

  return { codeSet, parentTypeByCode };
}
