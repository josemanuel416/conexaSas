import { Router } from 'express';
import { config } from '../config.js';
import { handleIncomingMessage } from '../bot/handlers.js';
import { parseIncomingMessage } from '../services/whatsapp.js';

const router = Router();

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('Webhook verificado correctamente');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const incoming = parseIncomingMessage(req.body);
    if (!incoming) return;

    await handleIncomingMessage(incoming.from, incoming.text, incoming.messageId);
  } catch (error) {
    console.error('Error procesando webhook:', error);
  }
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'chatboot' });
});

export default router;
