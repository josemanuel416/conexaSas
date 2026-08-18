import { buildCompanyLogoAttachment } from './company-logo.js';

const LOGO_CID = 'company-logo@conexa';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function documentLabel(documentKind) {
  if (documentKind === 'cotizacion') return 'Cotización';
  if (documentKind === 'prefactura') return 'Prefactura';
  if (documentKind === 'nota_credito') return 'Nota crédito electrónica';
  if (documentKind === 'nota_debito') return 'Nota débito electrónica';
  return 'Factura electrónica';
}

/**
 * @param {{
 *   companyRow: object,
 *   invoiceNumber: string,
 *   documentKind?: string,
 *   clientName?: string,
 * }} params
 */
export function buildInvoiceClientEmailContent({
  companyRow,
  invoiceNumber,
  documentKind,
  clientName,
}) {
  const companyName = companyRow.invoice_email_from_name || companyRow.name || 'Emisor';
  const docLabel = documentLabel(documentKind);
  const number = escapeHtml(invoiceNumber || '—');
  const company = escapeHtml(companyName);
  const greeting = clientName?.trim()
    ? `Estimado(a) ${escapeHtml(clientName.trim())},`
    : 'Estimado cliente,';
  const contactEmail = companyRow.invoice_email_from || companyRow.email || '';
  const address = companyRow.address || '';
  const logoAttachment = buildCompanyLogoAttachment(companyRow.logo_path, LOGO_CID);

  const logoBlock = logoAttachment
    ? `<img src="cid:${LOGO_CID}" alt="${company}" style="display:block;max-height:72px;max-width:240px;height:auto;border:0;" />`
    : `<div style="font-size:22px;font-weight:600;color:#1a1a1a;letter-spacing:0.02em;">${company}</div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${docLabel} ${number}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e8e8e8;">
          <tr>
            <td style="padding:28px 32px 12px 32px;">${logoBlock}</td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;font-size:15px;line-height:1.65;color:#222;">
              <p style="margin:0 0 16px 0;">${greeting}</p>
              <p style="margin:0 0 16px 0;">
                Adjuntamos ${escapeHtml(docLabel.toLowerCase())}
                <strong>${number}</strong>${documentKind === 'cotizacion' || documentKind === 'prefactura'
    ? ` de <strong>${company}</strong>.`
    : `, emitida por <strong>${company}</strong>.`}
              </p>
              ${documentKind === 'cotizacion' || documentKind === 'prefactura'
    ? `<p style="margin:0 0 24px 0;">En el PDF adjunto encontrará el detalle de ítems, valores e impuestos.</p>`
    : `<p style="margin:0 0 24px 0;">
                El archivo ZIP incluye el XML firmado y la representación gráfica en PDF,
                conforme a los requisitos de la DIAN (Colombia).
              </p>`}
              <p style="margin:0 0 4px 0;">Atentamente,</p>
              <p style="margin:0;font-weight:700;">${company}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px 32px;border-top:1px solid #ececec;font-size:11px;line-height:1.55;color:#666;">
              <p style="margin:0 0 12px 0;">
                Este mensaje y sus adjuntos son para uso exclusivo del destinatario y pueden contener
                información confidencial o privilegiada. Si lo recibió por error, elimínelo y notifíquelo
                al remitente; queda prohibida su divulgación no autorizada.
              </p>
              <p style="margin:0 0 12px 0;">
                En cumplimiento de la Ley 1581 de 2012, los datos personales suministrados serán
                tratados por <strong>${company}</strong> con fines administrativos, de prestación de
                servicios y facturación electrónica.
              </p>
              <p style="margin:0;">
                Puede ejercer sus derechos de acceso, actualización o rectificación escribiendo a
                ${contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}" style="color:#1565c0;text-decoration:underline;">${escapeHtml(contactEmail)}</a>`
    : 'nuestros canales oficiales de atención'}${address ? ` o en ${escapeHtml(address)}` : ''}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    greeting.replace(/<[^>]+>/g, ''),
    '',
    `Adjuntamos ${docLabel.toLowerCase()} ${invoiceNumber || '—'}${documentKind === 'cotizacion' || documentKind === 'prefactura' ? ` de ${companyName}.` : `, emitida por ${companyName}.`}`,
    documentKind === 'cotizacion' || documentKind === 'prefactura'
      ? 'En el PDF adjunto encontrará el detalle de ítems, valores e impuestos.'
      : 'El archivo ZIP incluye el XML firmado y la representación gráfica en PDF, conforme a la DIAN (Colombia).',
    '',
    'Atentamente,',
    companyName,
    '',
    '—',
    'Este mensaje y sus adjuntos son confidenciales. Si lo recibió por error, elimínelo y notifíquelo al remitente.',
    `Tratamiento de datos conforme a la Ley 1581 de 2012 por ${companyName}.`,
    contactEmail ? `Contacto: ${contactEmail}${address ? ` · ${address}` : ''}` : '',
  ].filter(Boolean).join('\n');

  return { html, text, logoAttachment };
}
