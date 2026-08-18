import nodemailer from 'nodemailer';
import { resolveSecret } from './dian-certificate.js';
import { buildInvoiceClientEmailContent } from './invoice-email-template.js';

function resolveSmtpSecure(port, configuredSecure) {
  if (port === 465) return true;
  if (port === 587) return false;
  if (configuredSecure == null) return port === 465;
  return Boolean(configuredSecure);
}

export function buildInvoiceSmtpTransport(companyRow, smtpPassword) {
  const port = Number(companyRow.invoice_smtp_port) || 587;
  const secure = resolveSmtpSecure(port, companyRow.invoice_smtp_secure);

  return nodemailer.createTransport({
    host: companyRow.invoice_smtp_host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: companyRow.invoice_smtp_user,
      pass: smtpPassword,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });
}

function formatSmtpError(err) {
  const msg = String(err?.message || err || '');
  if (/wrong version number|EPROTO|SSL routines/i.test(msg)) {
    return 'Error SMTP/TLS: en puerto 587 use STARTTLS (desactive "TLS directo"); en puerto 465 actívelo.';
  }
  if (/invalid login|authentication/i.test(msg)) {
    return 'No se pudo autenticar en SMTP. Verifique usuario y contraseña (Gmail requiere contraseña de aplicación).';
  }
  return msg || 'No se pudo enviar el correo';
}

export async function sendInvoicePackageEmail({
  companyRow,
  toEmail,
  subject,
  text,
  html,
  attachments = [],
}) {
  const smtpPassword = resolveSecret(companyRow.invoice_smtp_password);
  if (!companyRow.invoice_smtp_host || !companyRow.invoice_smtp_user || !smtpPassword) {
    throw new Error('Configure SMTP de facturación en Emisor DIAN antes de enviar al cliente');
  }
  if (!companyRow.invoice_email_from) {
    throw new Error('Configure correo remitente de facturas en Emisor DIAN');
  }
  if (!toEmail) {
    throw new Error('El cliente no tiene correo electrónico registrado');
  }

  const transporter = buildInvoiceSmtpTransport(companyRow, smtpPassword);

  try {
    await transporter.sendMail({
      from: {
        name: companyRow.invoice_email_from_name || companyRow.name || 'Facturación',
        address: companyRow.invoice_email_from,
      },
      to: toEmail,
      subject,
      text,
      html,
      attachments,
    });
  } catch (err) {
    throw new Error(formatSmtpError(err));
  }
}

export async function sendInvoiceEmailToClient({
  companyRow,
  clientEmail,
  clientName,
  emailSubject,
  invoiceNumber,
  documentKind,
  zipBuffer,
  zipFileName,
  toEmail,
}) {
  const recipient = toEmail || clientEmail;
  const { html, text, logoAttachment } = buildInvoiceClientEmailContent({
    companyRow,
    invoiceNumber,
    documentKind,
    clientName,
  });

  const attachments = [
    { filename: zipFileName, content: zipBuffer },
  ];
  if (logoAttachment) attachments.unshift(logoAttachment);

  await sendInvoicePackageEmail({
    companyRow,
    toEmail: recipient,
    subject: emailSubject,
    text,
    html,
    attachments,
  });
  return { to: recipient };
}
