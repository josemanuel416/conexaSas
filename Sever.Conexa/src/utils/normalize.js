export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function normalizePassword(password) {
  return typeof password === 'string' ? password.trim() : '';
}
