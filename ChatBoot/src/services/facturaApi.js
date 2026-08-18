import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

export async function crearFactura(payload) {
  if (!config.facturaApi.url) {
    throw new Error('FACTURA_API_URL no está configurada');
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.facturaApi.apiKey) {
    headers.Authorization = `Bearer ${config.facturaApi.apiKey}`;
  }

  const response = await fetch(config.facturaApi.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      claveSeguridad: payload.claveSeguridad,
      tercero: payload.tercero,
      servicio: payload.servicio,
      cantidad: payload.cantidad,
      descuento: payload.descuento,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      mensaje: data.mensaje || data.message || `Error HTTP ${response.status}`,
      error: data,
    };
  }

  return {
    ok: data.ok !== false,
    mensaje: data.mensaje || data.message || 'Factura creada',
    facturaId: data.facturaId || data.factura_id,
    pdfBase64: data.pdf || data.pdfBase64,
    pdfUrl: data.pdfUrl || data.pdf_url,
    raw: data,
  };
}

export async function savePdfFromResponse(result, invoiceRequestId) {
  const storageDir = path.resolve('storage/pdfs');
  await fs.mkdir(storageDir, { recursive: true });

  if (result.pdfBase64) {
    const filename = `factura-${invoiceRequestId}.pdf`;
    const filePath = path.join(storageDir, filename);
    await fs.writeFile(filePath, Buffer.from(result.pdfBase64, 'base64'));
    return filePath;
  }

  if (result.pdfUrl) {
    const response = await fetch(result.pdfUrl);
    if (!response.ok) {
      throw new Error('No se pudo descargar el PDF desde la URL');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `factura-${invoiceRequestId}.pdf`;
    const filePath = path.join(storageDir, filename);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  return null;
}
