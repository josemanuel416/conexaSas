import { getCompanyVariable } from './company-settings.js';

export const MOVEMENT_SETTING_KEYS = {
  transferOut: 'inventory.movement.transfer_out_code',
  transferIn: 'inventory.movement.transfer_in_code',
  saleOut: 'inventory.movement.sale_out_code',
};

const DEFAULTS = {
  transferOut: '09',
  transferIn: '10',
  saleOut: '02',
};

export async function getInventoryMovementSettings(db, companyId) {
  const [transferOut, transferIn, saleOut] = await Promise.all([
    getCompanyVariable(db, companyId, MOVEMENT_SETTING_KEYS.transferOut),
    getCompanyVariable(db, companyId, MOVEMENT_SETTING_KEYS.transferIn),
    getCompanyVariable(db, companyId, MOVEMENT_SETTING_KEYS.saleOut),
  ]);

  const codes = {
    transferOut: String(transferOut || DEFAULTS.transferOut).trim().toUpperCase(),
    transferIn: String(transferIn || DEFAULTS.transferIn).trim().toUpperCase(),
    saleOut: String(saleOut || DEFAULTS.saleOut).trim().toUpperCase(),
  };

  const { rows } = await db.query(
    `SELECT id, code, name, direction FROM inventory_movement_types
     WHERE company_id = $1 AND code = ANY($2) AND is_active = true`,
    [companyId, [codes.transferOut, codes.transferIn, codes.saleOut]],
  );

  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));

  return {
    ...codes,
    transferOutTypeId: byCode[codes.transferOut]?.id || null,
    transferInTypeId: byCode[codes.transferIn]?.id || null,
    saleOutTypeId: byCode[codes.saleOut]?.id || null,
  };
}

export function isTransferOutCode(code, settings) {
  return String(code).toUpperCase() === settings.transferOut;
}

export function isTransferInCode(code, settings) {
  return String(code).toUpperCase() === settings.transferIn;
}

export function isSaleOutCode(code, settings) {
  return String(code).toUpperCase() === settings.saleOut;
}

export function isTransferMovementCode(code, settings) {
  return isTransferOutCode(code, settings) || isTransferInCode(code, settings);
}

export async function assertMovementTypeCode(db, companyId, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    throw Object.assign(new Error('Código de tipo de movimiento requerido'), { status: 400 });
  }
  const { rows } = await db.query(
    `SELECT code FROM inventory_movement_types
     WHERE company_id = $1 AND code = $2 AND is_active = true`,
    [companyId, normalized],
  );
  if (!rows[0]) {
    throw Object.assign(new Error(`Tipo de movimiento "${normalized}" no existe o está inactivo`), { status: 400 });
  }
  return normalized;
}
