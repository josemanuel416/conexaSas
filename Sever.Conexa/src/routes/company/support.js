import { Router } from 'express';
import { pool } from '../../db/pool.js';

const router = Router();

function formatTicket(row) {
  return {
    id: row.id,
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
    authorName: row.author_name,
    body: row.body,
    isStaffReply: row.is_staff_reply,
    createdAt: row.created_at,
  };
}

const TICKET_LIST_SQL = `
  SELECT t.*, u.full_name AS created_by_name,
         (SELECT COUNT(*)::int FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
  FROM support_tickets t
  JOIN users u ON u.id = t.created_by
  WHERE t.company_id = $1
`;

router.get('/tickets', async (req, res) => {
  const params = [req.user.companyId];
  let sql = TICKET_LIST_SQL;
  if (req.query.status) {
    params.push(req.query.status);
    sql += ` AND t.status = $${params.length}`;
  }
  sql += ' ORDER BY t.updated_at DESC LIMIT 200';
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(formatTicket));
});

router.get('/tickets/:id', async (req, res) => {
  const { rows } = await pool.query(
    `${TICKET_LIST_SQL} AND t.id = $2`,
    [req.user.companyId, req.params.id],
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
});

router.post('/tickets', async (req, res) => {
  const { ticketType, subject, description, priority } = req.body;
  if (!ticketType || !subject?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Tipo, asunto y descripción son requeridos' });
  }
  const validTypes = ['soporte', 'requerimiento', 'error'];
  if (!validTypes.includes(ticketType)) {
    return res.status(400).json({ error: 'Tipo de ticket inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO support_tickets (company_id, ticket_type, subject, description, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        req.user.companyId,
        ticketType,
        subject.trim(),
        description.trim(),
        priority || 'media',
        req.user.id,
      ],
    );
    const ticketId = rows[0].id;
    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_user_id, body, is_staff_reply)
       VALUES ($1, $2, $3, false)`,
      [ticketId, req.user.id, description.trim()],
    );
    await client.query('COMMIT');

    const { rows: full } = await pool.query(
      `${TICKET_LIST_SQL} AND t.id = $2`,
      [req.user.companyId, ticketId],
    );
    const { rows: messages } = await pool.query(
      `SELECT m.*, u.full_name AS author_name
       FROM support_ticket_messages m
       JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`,
      [ticketId],
    );
    res.status(201).json({ ...formatTicket(full[0]), messages: messages.map(formatMessage) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/tickets/:id/messages', async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'El mensaje es requerido' });

  const { rows: ticketRows } = await pool.query(
    'SELECT id, status FROM support_tickets WHERE id = $1 AND company_id = $2',
    [req.params.id, req.user.companyId],
  );
  if (!ticketRows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (ticketRows[0].status === 'cerrado') {
    return res.status(400).json({ error: 'El ticket está cerrado' });
  }

  await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, author_user_id, body, is_staff_reply)
     VALUES ($1, $2, $3, false)`,
    [req.params.id, req.user.id, body.trim()],
  );
  await pool.query(
    `UPDATE support_tickets SET updated_at = NOW(),
       status = CASE WHEN status = 'resuelto' THEN 'abierto' ELSE status END
     WHERE id = $1`,
    [req.params.id],
  );

  const { rows } = await pool.query(
    `${TICKET_LIST_SQL} AND t.id = $2`,
    [req.user.companyId, req.params.id],
  );
  const { rows: messages } = await pool.query(
    `SELECT m.*, u.full_name AS author_name
     FROM support_ticket_messages m
     JOIN users u ON u.id = m.author_user_id
     WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`,
    [req.params.id],
  );
  res.json({ ...formatTicket(rows[0]), messages: messages.map(formatMessage) });
});

export default router;
