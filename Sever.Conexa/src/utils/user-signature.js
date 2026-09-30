import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, resolveProjectPath } from '../project-root.js';

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function signatureExtension(mime) {
  return MIME_EXT[mime] || null;
}

export function resolveUserSignatureAbsolute(signaturePath) {
  const candidate = resolveProjectPath(signaturePath);
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

export function saveUserSignatureFile(userId, buffer, mime) {
  const ext = signatureExtension(mime);
  if (!ext) {
    throw Object.assign(new Error('La firma debe ser PNG, JPG o WEBP'), { status: 400 });
  }
  const dir = path.join(PROJECT_ROOT, 'assets', 'users', userId);
  fs.mkdirSync(dir, { recursive: true });
  for (const oldExt of ['png', 'jpg', 'jpeg', 'webp']) {
    const oldPath = path.join(dir, `signature.${oldExt}`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  fs.writeFileSync(path.join(dir, `signature.${ext}`), buffer);
  return `assets/users/${userId}/signature.${ext}`;
}

export function deleteUserSignatureFile(signaturePath) {
  const absolute = resolveUserSignatureAbsolute(signaturePath);
  if (absolute) fs.unlinkSync(absolute);
}

export async function loadUserAuthor(db, userId) {
  if (!userId) return null;
  const { rows } = await db.query(
    `SELECT id, email, full_name, signature_path FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] || null;
}
