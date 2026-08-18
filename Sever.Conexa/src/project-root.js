import path from 'path';
import { fileURLToPath } from 'url';

/** Raíz del proyecto Sever.Conexa (carpeta que contiene src/ y assets/). */
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

export function resolveProjectPath(relativePath) {
  if (!relativePath) return null;
  if (path.isAbsolute(relativePath)) return relativePath;
  return path.join(PROJECT_ROOT, relativePath);
}
