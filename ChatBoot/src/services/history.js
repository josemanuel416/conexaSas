import { pool } from '../db/pool.js';

export async function getOrCreateSession(phoneNumber) {
  const existing = await pool.query(
    'SELECT * FROM sessions WHERE phone_number = $1',
    [phoneNumber]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await pool.query(
    `INSERT INTO sessions (phone_number, state, data)
     VALUES ($1, 'idle', '{}')
     RETURNING *`,
    [phoneNumber]
  );

  return inserted.rows[0];
}

export async function updateSession(sessionId, { state, data }) {
  const result = await pool.query(
    `UPDATE sessions
     SET state = COALESCE($2, state),
         data = COALESCE($3, data),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sessionId, state ?? null, data ?? null]
  );

  return result.rows[0];
}

export async function resetSession(sessionId) {
  return updateSession(sessionId, { state: 'idle', data: {} });
}

export async function saveMessage(sessionId, direction, content, whatsappMessageId = null) {
  const result = await pool.query(
    `INSERT INTO messages (session_id, direction, content, whatsapp_message_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [sessionId, direction, content, whatsappMessageId]
  );

  return result.rows[0];
}

export async function createInvoiceRequest(sessionId, payload) {
  const result = await pool.query(
    `INSERT INTO invoice_requests (
       session_id, clave_seguridad, tercero, servicio, cantidad,
       descuento_aplica, descuento_valor, descuento_tipo, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [
      sessionId,
      payload.claveSeguridad,
      payload.tercero,
      payload.servicio,
      payload.cantidad,
      payload.descuento?.aplica ?? false,
      payload.descuento?.valor ?? null,
      payload.descuento?.tipo ?? null,
    ]
  );

  return result.rows[0];
}

export async function completeInvoiceRequest(id, { status, responseMessage, facturaId, pdfPath, errorDetail }) {
  const result = await pool.query(
    `UPDATE invoice_requests
     SET status = $2,
         response_message = $3,
         factura_id = $4,
         pdf_path = $5,
         error_detail = $6,
         completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, responseMessage, facturaId, pdfPath, errorDetail]
  );

  return result.rows[0];
}

export async function getSessionHistory(sessionId, limit = 50) {
  const messages = await pool.query(
    `SELECT direction, content, created_at
     FROM messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );

  const invoices = await pool.query(
    `SELECT id, tercero, servicio, cantidad, status, factura_id, created_at, completed_at
     FROM invoice_requests
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );

  return {
    messages: messages.rows.reverse(),
    invoices: invoices.rows,
  };
}
