import {
  getOrCreateSession,
  updateSession,
  resetSession,
  saveMessage,
  createInvoiceRequest,
  completeInvoiceRequest,
} from '../services/history.js';
import { sendTextMessage } from '../services/whatsapp.js';
import { crearFactura, savePdfFromResponse } from '../services/facturaApi.js';
import { STATES, MESSAGES, buildResumen, parseSiNo } from './states.js';

async function reply(session, phoneNumber, text) {
  await saveMessage(session.id, 'outbound', text);
  await sendTextMessage(phoneNumber, text);
}

export async function handleIncomingMessage(phoneNumber, text, whatsappMessageId) {
  const session = await getOrCreateSession(phoneNumber);
  await saveMessage(session.id, 'inbound', text, whatsappMessageId);

  const input = text.trim();
  const normalized = input.toLowerCase();

  if (normalized === 'ayuda') {
    await reply(session, phoneNumber, MESSAGES.AYUDA);
    return;
  }

  if (normalized === 'cancelar') {
    await resetSession(session.id);
    await reply(session, phoneNumber, MESSAGES.CANCELADO);
    return;
  }

  if (session.state === STATES.IDLE) {
    if (normalized === 'factura' || normalized === 'hola') {
      await updateSession(session.id, { state: STATES.AWAITING_CLAVE, data: {} });
      await reply(session, phoneNumber, MESSAGES.CLAVE);
      return;
    }
    await reply(session, phoneNumber, MESSAGES.BIENVENIDA);
    return;
  }

  const data = typeof session.data === 'object' ? { ...session.data } : {};

  switch (session.state) {
    case STATES.AWAITING_CLAVE:
      data.claveSeguridad = input;
      await updateSession(session.id, { state: STATES.AWAITING_TERCERO, data });
      await reply(session, phoneNumber, MESSAGES.TERCERO);
      break;

    case STATES.AWAITING_TERCERO:
      data.tercero = input;
      await updateSession(session.id, { state: STATES.AWAITING_SERVICIO, data });
      await reply(session, phoneNumber, MESSAGES.SERVICIO);
      break;

    case STATES.AWAITING_SERVICIO:
      data.servicio = input;
      await updateSession(session.id, { state: STATES.AWAITING_CANTIDAD, data });
      await reply(session, phoneNumber, MESSAGES.CANTIDAD);
      break;

    case STATES.AWAITING_CANTIDAD: {
      const cantidad = Number(input.replace(',', '.'));
      if (Number.isNaN(cantidad) || cantidad <= 0) {
        await reply(session, phoneNumber, MESSAGES.ERROR_CANTIDAD);
        return;
      }
      data.cantidad = cantidad;
      await updateSession(session.id, { state: STATES.AWAITING_DESCUENTO, data });
      await reply(session, phoneNumber, MESSAGES.DESCUENTO);
      break;
    }

    case STATES.AWAITING_DESCUENTO: {
      const siNo = parseSiNo(input);
      if (siNo === null) {
        await reply(session, phoneNumber, MESSAGES.DESCUENTO);
        return;
      }
      if (siNo) {
        data.descuento = { aplica: true, tipo: 'porcentaje' };
        await updateSession(session.id, { state: STATES.AWAITING_DESCUENTO_VALOR, data });
        await reply(session, phoneNumber, MESSAGES.DESCUENTO_VALOR);
      } else {
        data.descuento = { aplica: false };
        await updateSession(session.id, { state: STATES.AWAITING_CONFIRMACION, data });
        await reply(session, phoneNumber, buildResumen(data));
      }
      break;
    }

    case STATES.AWAITING_DESCUENTO_VALOR: {
      const valor = Number(input.replace(',', '.'));
      if (Number.isNaN(valor) || valor < 0) {
        await reply(session, phoneNumber, MESSAGES.ERROR_DESCUENTO);
        return;
      }
      data.descuento = { aplica: true, valor, tipo: 'porcentaje' };
      await updateSession(session.id, { state: STATES.AWAITING_CONFIRMACION, data });
      await reply(session, phoneNumber, buildResumen(data));
      break;
    }

    case STATES.AWAITING_CONFIRMACION: {
      const siNo = parseSiNo(input);
      if (siNo === null) {
        await reply(session, phoneNumber, MESSAGES.CONFIRMACION_INVALIDA);
        return;
      }
      if (!siNo) {
        await resetSession(session.id);
        await reply(session, phoneNumber, MESSAGES.CANCELADO);
        return;
      }
      await processInvoice(session, phoneNumber, data);
      break;
    }

    default:
      await resetSession(session.id);
      await reply(session, phoneNumber, MESSAGES.BIENVENIDA);
  }
}

async function processInvoice(session, phoneNumber, data) {
  await updateSession(session.id, { state: STATES.PROCESSING, data });
  await reply(session, phoneNumber, MESSAGES.PROCESANDO);

  const invoiceRequest = await createInvoiceRequest(session.id, data);

  try {
    const result = await crearFactura(data);

    if (!result.ok) {
      await completeInvoiceRequest(invoiceRequest.id, {
        status: 'error',
        responseMessage: result.mensaje,
        errorDetail: JSON.stringify(result.error || result.raw),
      });
      await resetSession(session.id);
      await reply(session, phoneNumber, `❌ ${result.mensaje}`);
      return;
    }

    let pdfPath = null;
    try {
      pdfPath = await savePdfFromResponse(result, invoiceRequest.id);
    } catch (pdfError) {
      console.error('Error guardando PDF:', pdfError);
    }

    await completeInvoiceRequest(invoiceRequest.id, {
      status: 'success',
      responseMessage: result.mensaje,
      facturaId: result.facturaId,
      pdfPath,
    });

    await resetSession(session.id);

    let successMsg = `✅ ${result.mensaje}`;
    if (result.facturaId) {
      successMsg += `\nFactura: *${result.facturaId}*`;
    }
    if (pdfPath) {
      successMsg += '\n\nEl PDF fue generado correctamente.';
      // TODO: enviar documento por WhatsApp cuando media upload esté configurado
    }

    await reply(session, phoneNumber, successMsg);
  } catch (error) {
    console.error('Error al crear factura:', error);
    await completeInvoiceRequest(invoiceRequest.id, {
      status: 'error',
      responseMessage: 'Error de conexión con el servidor de facturas',
      errorDetail: error.message,
    });
    await resetSession(session.id);
    await reply(
      session,
      phoneNumber,
      '❌ No se pudo conectar con el servidor de facturas. Intenta más tarde.'
    );
  }
}
