import { pool } from '../../db/pool.js';

function formatTicket(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    ticketType: row.ticket_type,
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    messageCount: Number(row.message_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMessage(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    isStaffReply: row.is_staff_reply,
    createdAt: row.created_at,
  };
}

const TICKET_LIST_SQL = `
  SELECT t.*, c.name AS company_name, u.full_name AS created_by_name,
         (SELECT COUNT(*)::int FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
  FROM support_tickets t
  JOIN companies c ON c.id = t.company_id
  JOIN users u ON u.id = t.created_by
`;

export async function listSupportTickets(req, res) {
  const params = [];
  let sql = `${TICKET_LIST_SQL} WHERE 1=1`;

  if (req.query.status) {
    params.push(req.query.status);
    sql += ` AND t.status = $${params.length}`;
  }
  if (req.query.companyId) {
    params.push(req.query.companyId);
    sql += ` AND t.company_id = $${params.length}`;
  }
  if (req.query.ticketType) {
    params.push(req.query.ticketType);
    sql += ` AND t.ticket_type = $${params.length}`;
  }

  sql += ' ORDER BY t.updated_at DESC LIMIT 500';
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(formatTicket));
}

export async function getSupportTicket(req, res) {
  const { rows } = await pool.query(
    `${TICKET_LIST_SQL} WHERE t.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

  const { rows: messages } = await pool.query(
    `SELECT m.*, u.full_name AS author_name
     FROM support_ticket_messages m
     JOIN users u ON u.id = m.author_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.created_at ASC`,
    [req.params.id],
  );

  res.json({
    ...formatTicket(rows[0]),
    messages: messages.map(formatMessage),
  });
}

export async function replySupportTicket(req, res) {
  const { body, status } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'La respuesta es requerida' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ticketRows } = await client.query(
      'SELECT id FROM support_tickets WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (!ticketRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_user_id, body, is_staff_reply)
       VALUES ($1, $2, $3, true)`,
      [req.params.id, req.user.id, body.trim()],
    );

    const newStatus = status || 'en_proceso';
    await client.query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, req.params.id],
    );

    await client.query('COMMIT');
    const { rows } = await pool.query(`${TICKET_LIST_SQL} WHERE t.id = $1`, [req.params.id]);
    const { rows: messages } = await pool.query(
      `SELECT m.*, u.full_name AS author_name
       FROM support_ticket_messages m
       JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id],
    );
    res.json({ ...formatTicket(rows[0]), messages: messages.map(formatMessage) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSupportTicketStatus(req, res) {
  const { status, priority } = req.body;
  const { rows } = await pool.query(
    `UPDATE support_tickets SET
       status = COALESCE($1, status),
       priority = COALESCE($2, priority),
       updated_at = NOW()
     WHERE id = $3 RETURNING id`,
    [status || null, priority || null, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });
  const { rows: full } = await pool.query(`${TICKET_LIST_SQL} WHERE t.id = $1`, [req.params.id]);
  res.json(formatTicket(full[0]));
}
