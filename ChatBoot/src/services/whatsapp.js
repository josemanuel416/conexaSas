import { config } from '../config.js';

const BASE_URL = 'https://graph.facebook.com/v21.0';

export async function sendTextMessage(to, text) {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.log(`[WhatsApp mock] → ${to}: ${text}`);
    return { mock: true };
  }

  const response = await fetch(
    `${BASE_URL}/${config.whatsapp.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${error}`);
  }

  return response.json();
}

export async function sendDocumentMessage(to, documentPath, filename, caption = '') {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.log(`[WhatsApp mock] → ${to}: documento ${filename}`);
    return { mock: true };
  }

  // Para producción: subir el archivo a Meta y enviar media_id.
  // Por ahora se documenta en el handler; requiere upload previo.
  throw new Error('Envío de documento pendiente de configurar media upload en WhatsApp API');
}

export function parseIncomingMessage(body) {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!message || message.type !== 'text') {
    return null;
  }

  return {
    from: message.from,
    messageId: message.id,
    text: message.text?.body?.trim() ?? '',
    timestamp: message.timestamp,
  };
}
