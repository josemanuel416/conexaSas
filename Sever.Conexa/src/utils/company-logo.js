import fs from 'fs';
import path from 'path';
import { resolveProjectPath } from '../project-root.js';

export function resolveCompanyLogoAbsolute(logoPath) {
  const candidate = resolveProjectPath(logoPath);
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

export function companyLogoMimeType(absolutePath) {
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

export function buildCompanyLogoAttachment(logoPath, cid = 'company-logo@conexa') {
  const absolutePath = resolveCompanyLogoAbsolute(logoPath);
  if (!absolutePath) return null;
  return {
    filename: path.basename(absolutePath),
    path: absolutePath,
    cid,
    contentType: companyLogoMimeType(absolutePath),
  };
}
