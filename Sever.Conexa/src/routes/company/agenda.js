import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requirePermission, hasPermission } from '../../middleware/permissions.js';
import { formatClient, prepareClientPayload } from '../../utils/client-format.js';
import { lookupDianAcquirer, validateAndEnrichClientWithDian } from '../../utils/dian-acquirer.js';
import { peekNextServiceCode } from '../../utils/company-settings.js';
import { assertServiceNotDuplicate } from '../../utils/service-catalog.js';
import { todayIsoDate } from '../../utils/app-timezone.js';

const router = Router();

function calcFinalPrice(basePrice, discountAmount, discountPercent, overridePrice) {
  let price = overridePrice != null ? Number(overridePrice) : Number(basePrice);
  if (discountPercent > 0) price -= price * (discountPercent / 100);
  if (discountAmount > 0) price -= Number(discountAmount);
  return Math.max(0, Math.round(price * 100) / 100);
}

async function generateTicketNumber(client, companyId, date) {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS count FROM internal_tickets
     WHERE company_id = $1 AND ticket_date = $2`,
    [companyId, date]
  );
  const seq = Number(rows[0].count) + 1;
  const d = date.replace(/-/g, '');
  return `TK-${d}-${String(seq).padStart(4, '0')}`;
}

// --- Profesionales ---
router.get('/professionals', requirePermission('agenda_citas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM professionals WHERE company_id = $1 ORDER BY first_name`,
    [req.user.companyId]
  );
  res.json(rows.map(formatProfessional));
});

router.post('/professionals', requirePermission('agenda_citas.profesionales'), async (req, res) => {
  const { documentType, documentNumber, firstName, lastName, phone, email, specialty } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO professionals (company_id, document_type, document_number, first_name, last_name, phone, email, specialty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.companyId, documentType || 'CC', documentNumber, firstName, lastName, phone, email, specialty]
    );
    res.status(201).json(formatProfessional(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Documento ya registrado' });
    throw err;
  }
});

router.put('/professionals/:id', requirePermission('agenda_citas.profesionales'), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE professionals SET
       document_type = COALESCE($1, document_type),
       document_number = COALESCE($2, document_number),
       first_name = COALESCE($3, first_name),
       last_name = COALESCE($4, last_name),
       phone = COALESCE($5, phone),
       email = COALESCE($6, email),
       specialty = COALESCE($7, specialty),
       is_active = COALESCE($8, is_active),
       updated_at = NOW()
     WHERE id = $9 AND company_id = $10 RETURNING *`,
    [req.body.documentType, req.body.documentNumber, req.body.firstName, req.body.lastName,
     req.body.phone, req.body.email, req.body.specialty, req.body.isActive,
     req.params.id, req.user.companyId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Profesional no encontrado' });
  res.json(formatProfessional(rows[0]));
});

// --- Servicios ---
router.get('/services', requirePermission('agenda_citas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM services WHERE company_id = $1 ORDER BY code`,
    [req.user.companyId]
  );
  res.json(rows.map(formatService));
});

router.post('/services', requirePermission('agenda_citas.servicios'), async (req, res) => {
  const { code, description, basePrice, durationMinutes } = req.body;
  const desc = String(description || '').trim();
  if (!desc) return res.status(400).json({ error: 'Descripción requerida' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertServiceNotDuplicate(client, req.user.companyId, desc);
    const serviceCode = code?.trim() || (await peekNextServiceCode(client, req.user.companyId)).nextCode;
    const { rows } = await client.query(
      `INSERT INTO services (company_id, code, description, base_price, duration_minutes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, serviceCode, desc, basePrice, durationMinutes || 30]
    );
    await client.query('COMMIT');
    res.status(201).json(formatService(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Código ya registrado' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/services/:id', requirePermission('agenda_citas.servicios'), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE services SET description=COALESCE($1,description),
       base_price=COALESCE($2,base_price), duration_minutes=COALESCE($3,duration_minutes),
       is_active=COALESCE($4,is_active), updated_at=NOW()
     WHERE id=$5 AND company_id=$6 RETURNING *`,
    [req.body.description, req.body.basePrice, req.body.durationMinutes,
     req.body.isActive, req.params.id, req.user.companyId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Servicio no encontrado' });
  res.json(formatService(rows[0]));
});

// --- Clientes ---
router.get('/clients/dian-lookup', requirePermission('agenda_citas.clientes'), async (req, res) => {
  try {
    const { documentType, documentNumber } = req.query;
    const lookup = await lookupDianAcquirer(
      req.user.companyId,
      documentType,
      documentNumber,
    );
    res.json({
      found: lookup.found,
      statusCode: lookup.statusCode,
      message: lookup.message,
      receiverName: lookup.receiverName,
      receiverEmail: lookup.receiverEmail,
      suggested: lookup.suggested,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        missing: err.missing,
        hint: err.hint,
      });
    }
    throw err;
  }
});

router.get('/clients', requirePermission('agenda_citas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM clients WHERE company_id = $1 ORDER BY first_name`,
    [req.user.companyId]
  );
  res.json(rows.map(formatClient));
});

router.post('/clients', requirePermission('agenda_citas.clientes'), async (req, res) => {
  try {
    const p = prepareClientPayload(req.body);
    const dianResult = await validateAndEnrichClientWithDian(req.user.companyId, p);
    const { rows } = await pool.query(
      `INSERT INTO clients (
         company_id, document_type, document_number, verification_digit,
         person_type, tax_level_code, business_name,
         first_name, middle_name, last_name, phone, email, address,
         city_code, city_name, department_code, department_name, country_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        req.user.companyId, p.documentType, p.documentNumber, p.verificationDigit,
        p.personType, p.taxLevelCode, p.businessName,
        p.firstName, p.middleName, p.lastName, p.phone, p.email, p.address,
        p.cityCode, p.cityName, p.departmentCode, p.departmentName, p.countryCode,
      ]
    );
    res.status(201).json({
      ...formatClient(rows[0]),
      dianValidation: dianResult,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Documento ya registrado' });
    throw err;
  }
});

router.put('/clients/:id', requirePermission('agenda_citas.clientes'), async (req, res) => {
  try {
    const p = prepareClientPayload(req.body);
    const dianResult = await validateAndEnrichClientWithDian(req.user.companyId, p);
    const { rows } = await pool.query(
      `UPDATE clients SET
         document_type = $1, document_number = $2, verification_digit = $3,
         person_type = $4, tax_level_code = $5, business_name = $6,
         first_name = $7, middle_name = $8, last_name = $9, phone = $10, email = $11, address = $12,
         city_code = $13, city_name = $14, department_code = $15, department_name = $16,
         country_code = $17, is_active = COALESCE($18, is_active), updated_at = NOW()
       WHERE id = $19 AND company_id = $20 RETURNING *`,
      [
        p.documentType, p.documentNumber, p.verificationDigit,
        p.personType, p.taxLevelCode, p.businessName,
        p.firstName, p.middleName, p.lastName, p.phone, p.email, p.address,
        p.cityCode, p.cityName, p.departmentCode, p.departmentName, p.countryCode,
        req.body.isActive, req.params.id, req.user.companyId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({
      ...formatClient(rows[0]),
      dianValidation: dianResult,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// --- Modelos de agenda ---
router.get('/schedule-templates', requirePermission('agenda_citas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT st.*, p.first_name, p.last_name
     FROM schedule_templates st
     JOIN professionals p ON p.id = st.professional_id
     WHERE st.company_id = $1 ORDER BY p.first_name`,
    [req.user.companyId]
  );

  const result = [];
  for (const st of rows) {
    const prog = await pool.query(
      `SELECT day_of_week, start_time, end_time FROM schedule_programming
       WHERE schedule_template_id = $1 ORDER BY day_of_week`,
      [st.id]
    );
    result.push(formatScheduleTemplate(st, prog.rows));
  }
  res.json(result);
});

router.post('/schedule-templates', requirePermission('agenda_citas.modelos'), async (req, res) => {
  const { professionalId, name, slotDurationMinutes, programming } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO schedule_templates (company_id, professional_id, name, slot_duration_minutes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.companyId, professionalId, name, slotDurationMinutes || 30]
    );
    for (const p of programming || []) {
      await client.query(
        `INSERT INTO schedule_programming (schedule_template_id, day_of_week, start_time, end_time)
         VALUES ($1,$2,$3,$4)`,
        [rows[0].id, p.dayOfWeek, p.startTime, p.endTime]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id, message: 'Modelo creado' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Slots disponibles para un profesional en una fecha (generados desde el modelo de agenda)
router.get('/available-slots', requirePermission('agenda_citas.acceso'), async (req, res) => {
  const { professionalId, date, serviceId, excludeAppointmentId } = req.query;
  if (!professionalId || !date) {
    return res.status(400).json({ error: 'professionalId y date requeridos' });
  }

  const dayOfWeek = getDayOfWeek(date);
  const days = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const { rows: templates } = await pool.query(
    `SELECT st.*, sp.start_time, sp.end_time
     FROM schedule_templates st
     JOIN schedule_programming sp ON sp.schedule_template_id = st.id
     WHERE st.professional_id = $1 AND st.company_id = $2 AND st.is_active = true
       AND sp.day_of_week = $3
     ORDER BY sp.start_time`,
    [professionalId, req.user.companyId, dayOfWeek]
  );

  if (!templates.length) {
    return res.json({
      programming: [],
      slots: [],
      message: 'Sin modelo de agenda para este día',
    });
  }

  let serviceDuration = null;
  if (serviceId) {
    const { rows: svc } = await pool.query(
      `SELECT duration_minutes FROM services WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [serviceId, req.user.companyId]
    );
    if (svc[0]) serviceDuration = svc[0].duration_minutes;
  }

  const programming = templates.map((t) => ({
    modelName: t.name,
    dayName: days[dayOfWeek],
    startTime: String(t.start_time).slice(0, 5),
    endTime: String(t.end_time).slice(0, 5),
    slotDurationMinutes: t.slot_duration_minutes,
  }));

  const slots = [];
  for (const t of templates) {
    const duration = t.slot_duration_minutes;
    let current = timeToMinutes(t.start_time);
    const end = timeToMinutes(t.end_time);

    while (current + duration <= end) {
      const slotStart = minutesToTime(current);
      const slotEnd = minutesToTime(current + duration);
      if (!serviceDuration || current + serviceDuration <= end) {
        slots.push({ startTime: slotStart, endTime: slotEnd });
      }
      current += duration;
    }
  }

  slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const bookedParams = [professionalId, date];
  let bookedSql = `SELECT start_time, end_time FROM appointments
     WHERE professional_id = $1 AND appointment_date = $2
       AND status NOT IN ('cancelada', 'reagendada')`;
  if (excludeAppointmentId) {
    bookedSql += ` AND id != $3`;
    bookedParams.push(excludeAppointmentId);
  }

  const { rows: booked } = await pool.query(bookedSql, bookedParams);

  const available = slots.filter((slot) => {
    const s = timeToMinutes(slot.startTime);
    const e = serviceDuration
      ? s + serviceDuration
      : timeToMinutes(slot.endTime);
    return !booked.some((b) => {
      const bs = timeToMinutes(b.start_time);
      const be = timeToMinutes(b.end_time);
      return s < be && e > bs;
    });
  });

  res.json({
    programming,
    slots: available,
    message: available.length ? null : 'Todos los turnos están ocupados',
  });
});

// --- Citas / Agenda ---
router.get('/appointments', requirePermission('agenda_citas.acceso'), async (req, res) => {
  const { date, professionalId, status } = req.query;
  let sql = `
    SELECT a.*, p.first_name AS prof_first, p.last_name AS prof_last,
           c.first_name AS client_first, c.last_name AS client_last, c.phone AS client_phone,
           s.code AS service_code, s.description AS service_desc
    FROM appointments a
    JOIN professionals p ON p.id = a.professional_id
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    WHERE a.company_id = $1`;
  const params = [req.user.companyId];
  let i = 2;

  if (date) { sql += ` AND a.appointment_date = $${i++}`; params.push(date); }
  if (professionalId) { sql += ` AND a.professional_id = $${i++}`; params.push(professionalId); }
  if (status) { sql += ` AND a.status = $${i++}`; params.push(status); }
  sql += ` ORDER BY a.appointment_date, a.start_time`;

  const { rows } = await pool.query(sql, params);
  res.json(rows.map(formatAppointment));
});

router.post('/appointments', requirePermission('agenda_citas.agendar'), async (req, res) => {
  const {
    professionalId, clientId, serviceId, appointmentDate, startTime,
    discountAmount, discountPercent, overridePrice, priceOverrideReason, notes,
  } = req.body;

  if (!professionalId || !clientId || !serviceId || !appointmentDate || !startTime) {
    return res.status(400).json({ error: 'Profesional, cliente, servicio, fecha y hora son requeridos' });
  }

  const normalizedTime = normalizeTime(startTime);
  if (!normalizedTime) {
    return res.status(400).json({ error: 'Formato de hora inválido' });
  }

  const discAmt = Number(discountAmount) || 0;
  const discPct = Number(discountPercent) || 0;

  const { rows: svc } = await pool.query(
    `SELECT * FROM services WHERE id = $1 AND company_id = $2`,
    [serviceId, req.user.companyId]
  );
  if (!svc[0]) return res.status(400).json({ error: 'Servicio no válido' });

  const { rows: prof } = await pool.query(
    `SELECT id FROM professionals WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [professionalId, req.user.companyId]
  );
  if (!prof[0]) return res.status(400).json({ error: 'Profesional no válido' });

  const { rows: cli } = await pool.query(
    `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [clientId, req.user.companyId]
  );
  if (!cli[0]) return res.status(400).json({ error: 'Cliente no válido' });

  const basePrice = Number(svc[0].base_price);
  const endTime = addMinutes(normalizedTime, svc[0].duration_minutes);

  const { rows: conflict } = await pool.query(
    `SELECT id FROM appointments
     WHERE professional_id = $1 AND appointment_date = $2
       AND status NOT IN ('cancelada', 'reagendada')
       AND start_time < $3::time AND end_time > $4::time`,
    [professionalId, appointmentDate, endTime, normalizedTime]
  );
  if (conflict.length > 0) {
    return res.status(409).json({ error: 'Ya existe una cita en ese horario' });
  }

  if (discAmt > 0 || discPct > 0) {
    if (!(await hasPermission(req.user, 'agenda_citas.descuento'))) {
      return res.status(403).json({ error: 'Sin permiso para aplicar descuentos' });
    }
  }
  if (overridePrice != null && overridePrice !== '' && Number(overridePrice) > basePrice) {
    if (!(await hasPermission(req.user, 'agenda_citas.cambiar_valor'))) {
      return res.status(403).json({ error: 'Sin permiso para cambiar el valor' });
    }
  }

  const finalPrice = calcFinalPrice(basePrice, discAmt, discPct, overridePrice ?? basePrice);

  try {
    const { rows } = await pool.query(
      `INSERT INTO appointments (
         company_id, professional_id, client_id, service_id,
         appointment_date, start_time, end_time,
         service_base_price, final_price, discount_amount, discount_percent,
         discount_authorized_by, price_override, price_override_reason,
         notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        req.user.companyId, professionalId, clientId, serviceId,
        appointmentDate, normalizedTime, endTime, basePrice, finalPrice,
        discAmt, discPct,
        (discAmt > 0 || discPct > 0) ? req.user.userId : null,
        overridePrice != null && overridePrice !== '' && Number(overridePrice) !== basePrice,
        priceOverrideReason || null, notes || null, req.user.userId,
      ]
    );
    res.status(201).json(formatAppointment(rows[0]));
  } catch (err) {
    console.error('Error creando cita:', err.message);
    return res.status(500).json({ error: 'No se pudo crear la cita. Verifique los datos.' });
  }
});

router.patch('/appointments/:id/complete', requirePermission('agenda_citas.cumplida'), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE appointments SET status = 'cumplida', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND status = 'programada' RETURNING *`,
    [req.params.id, req.user.companyId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cita no encontrada o no se puede completar' });
  res.json(formatAppointment(rows[0]));
});

router.post('/appointments/:id/reschedule', requirePermission('agenda_citas.reagendar'), async (req, res) => {
  const { appointmentDate, startTime } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: old } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND company_id = $2 AND status = 'programada'`,
      [req.params.id, req.user.companyId]
    );
    if (!old[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const o = old[0];
    const duration = timeToMinutes(o.end_time) - timeToMinutes(o.start_time);
    const endTime = addMinutes(startTime, duration);

    await client.query(
      `UPDATE appointments SET status = 'reagendada', updated_at = NOW() WHERE id = $1`,
      [o.id]
    );

    const { rows: created } = await client.query(
      `INSERT INTO appointments (
         company_id, professional_id, client_id, service_id,
         appointment_date, start_time, end_time,
         service_base_price, final_price, discount_amount, discount_percent,
         discount_authorized_by, price_override, price_override_reason,
         status, rescheduled_from_id, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'programada',$15,$16) RETURNING *`,
      [
        o.company_id, o.professional_id, o.client_id, o.service_id,
        appointmentDate, startTime, endTime,
        o.service_base_price, o.final_price, o.discount_amount, o.discount_percent,
        o.discount_authorized_by, o.price_override, o.price_override_reason,
        o.id, req.user.userId,
      ]
    );

    await client.query('COMMIT');
    res.json(formatAppointment(created[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/appointments/:id/invoice', requirePermission('agenda_citas.facturar'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: appt } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND company_id = $2 AND status = 'cumplida'`,
      [req.params.id, req.user.companyId]
    );
    if (!appt[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La cita debe estar cumplida para facturar' });
    }

    const a = appt[0];
    const ticketNumber = await generateTicketNumber(client, req.user.companyId, a.appointment_date);
    const subtotal = Number(a.service_base_price);
    const discount = subtotal - Number(a.final_price);

    const { rows: ticket } = await client.query(
      `INSERT INTO internal_tickets (company_id, appointment_id, ticket_number, ticket_date, subtotal, discount, total, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.companyId, a.id, ticketNumber, a.appointment_date, subtotal, discount, a.final_price, req.user.userId]
    );

    await client.query(
      `UPDATE appointments SET status = 'facturada', updated_at = NOW() WHERE id = $1`,
      [a.id]
    );

    await client.query('COMMIT');
    res.status(201).json(formatTicket(ticket[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// --- Facturado del día ---
router.get('/tickets/daily', requirePermission('agenda_citas.ver_facturado'), async (req, res) => {
  const date = req.query.date || todayIsoDate();

  const { rows } = await pool.query(
    `SELECT t.*, a.appointment_date, a.start_time,
            c.first_name AS client_first, c.last_name AS client_last,
            s.description AS service_desc, p.first_name AS prof_first, p.last_name AS prof_last
     FROM internal_tickets t
     JOIN appointments a ON a.id = t.appointment_id
     JOIN clients c ON c.id = a.client_id
     JOIN services s ON s.id = a.service_id
     JOIN professionals p ON p.id = a.professional_id
     WHERE t.company_id = $1 AND t.ticket_date = $2
     ORDER BY t.created_at`,
    [req.user.companyId, date]
  );

  const total = rows.reduce((sum, t) => sum + Number(t.total), 0);

  res.json({
    date,
    tickets: rows.map((t) => ({
      ...formatTicket(t),
      clientName: `${t.client_first} ${t.client_last}`,
      serviceDesc: t.service_desc,
      professionalName: `${t.prof_first} ${t.prof_last}`,
      appointmentTime: t.start_time,
    })),
    summary: { count: rows.length, total },
  });
});

// --- Helpers ---
function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  return dow === 0 ? 7 : dow;
}

function normalizeTime(time) {
  if (!time) return null;
  const parts = String(time).trim().split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function timeToMinutes(t) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutes(time, minutes) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

function formatProfessional(p) {
  return {
    id: p.id, documentType: p.document_type, documentNumber: p.document_number,
    firstName: p.first_name, lastName: p.last_name, fullName: `${p.first_name} ${p.last_name}`,
    phone: p.phone, email: p.email, specialty: p.specialty, isActive: p.is_active,
  };
}

function formatService(s) {
  return {
    id: s.id, code: s.code, description: s.description,
    basePrice: Number(s.base_price), durationMinutes: s.duration_minutes, isActive: s.is_active,
  };
}

function formatScheduleTemplate(st, programming) {
  const days = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  return {
    id: st.id, professionalId: st.professional_id,
    professionalName: `${st.first_name} ${st.last_name}`,
    name: st.name, slotDurationMinutes: st.slot_duration_minutes, isActive: st.is_active,
    programming: programming.map((p) => ({
      dayOfWeek: p.day_of_week, dayName: days[p.day_of_week],
      startTime: String(p.start_time).slice(0, 5), endTime: String(p.end_time).slice(0, 5),
    })),
  };
}

function formatDateValue(value) {
  if (!value) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatAppointment(a) {
  return {
    id: a.id, professionalId: a.professional_id,
    professionalName: a.prof_first ? `${a.prof_first} ${a.prof_last}` : undefined,
    clientId: a.client_id,
    clientName: a.client_first ? `${a.client_first} ${a.client_last}` : undefined,
    clientPhone: a.client_phone,
    serviceId: a.service_id, serviceCode: a.service_code, serviceDesc: a.service_desc,
    appointmentDate: formatDateValue(a.appointment_date),
    startTime: String(a.start_time).slice(0, 5),
    endTime: String(a.end_time).slice(0, 5),
    serviceBasePrice: Number(a.service_base_price),
    finalPrice: Number(a.final_price),
    discountAmount: Number(a.discount_amount),
    discountPercent: Number(a.discount_percent),
    priceOverride: a.price_override,
    status: a.status, notes: a.notes,
  };
}

function formatTicket(t) {
  return {
    id: t.id, ticketNumber: t.ticket_number, ticketDate: t.ticket_date,
    subtotal: Number(t.subtotal), discount: Number(t.discount), total: Number(t.total),
    createdAt: t.created_at,
  };
}

export default router;
