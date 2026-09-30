import { randomBytes } from 'crypto';
import path from 'path';
import { Router } from 'express';
import { consultKnowledge, getManual, listTopics, manualVideoFile } from '../../../../BaseConocimiento/src/search.js';

const router = Router();
const mediaTickets = new Map();

function rememberMediaTicket(id, token) {
  const now = Date.now();
  for (const [key, entry] of mediaTickets) {
    if (entry.exp <= now) mediaTickets.delete(key);
  }
  const ticket = randomBytes(18).toString('hex');
  mediaTickets.set(ticket, { id, token, exp: now + 5 * 60 * 1000 });
  return ticket;
}

export function liftAyudaVideoCookie(req, _res, next) {
  if (!req.headers.authorization && req.method === 'GET' && /\/video$/.test(req.path)) {
    const entry = mediaTickets.get(String(req.query.t || ''));
    if (entry && entry.exp > Date.now() && req.path.endsWith(`/${entry.id}/video`)) {
      req.headers.authorization = `Bearer ${entry.token}`;
    }
  }
  next();
}

router.post('/manuales/:id/reproducir', (req, res) => {
  if (!manualVideoFile(req.params.id)) {
    return res.status(404).json({ error: 'Este manual no tiene video' });
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const ticket = rememberMediaTicket(req.params.id, token);
  res.json({ src: `/api/company/ayuda/manuales/${req.params.id}/video?t=${ticket}` });
});

router.get('/manuales/:id/video', (req, res) => {
  const file = manualVideoFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'Este manual no tiene video' });
  res.sendFile(path.resolve(file));
});

router.get('/manuales/:id', (req, res) => {
  const manual = getManual(req.params.id);
  if (!manual) return res.status(404).json({ error: 'Manual no encontrado' });
  res.json(manual);
});

router.get('/temas', (req, res) => {
  const kind = ['modulo', 'proceso', 'diccionario'].includes(req.query.kind) ? req.query.kind : undefined;
  res.json(listTopics(kind));
});

router.post('/consultar', (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (question.length < 3) {
    return res.status(400).json({ error: 'Escriba una pregunta de al menos 3 caracteres' });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: 'La pregunta es demasiado larga' });
  }
  res.json(consultKnowledge(question));
});

export default router;
