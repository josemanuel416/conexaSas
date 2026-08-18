const SCOPES = {
  admin: { tokenKey: 'admin_token', authKey: 'admin_auth' },
  company: { tokenKey: 'company_token', authKey: 'company_auth' },
}

function migrateLegacyAuth() {
  const raw = localStorage.getItem('auth')
  if (!raw) return

  try {
    const data = JSON.parse(raw)
    const scope = data.user?.role === 'super_admin' ? 'admin' : 'company'
    if (!getAuth(scope)) {
      saveAuth(data, scope)
    }
  } catch {
    // ignorar datos corruptos
  }

  localStorage.removeItem('token')
  localStorage.removeItem('auth')
}

export function saveAuth(data, scope) {
  const keys = SCOPES[scope]
  localStorage.setItem(keys.tokenKey, data.token)
  localStorage.setItem(keys.authKey, JSON.stringify(data))
}

export function getAuth(scope) {
  const raw = localStorage.getItem(SCOPES[scope].authKey)
  return raw ? JSON.parse(raw) : null
}

export function getToken(scope) {
  return localStorage.getItem(SCOPES[scope].tokenKey)
}

export function getPermissions() {
  return getAuth('company')?.permissions || []
}

export function hasPermission(code) {
  const auth = getAuth('company')
  if (auth?.user?.role === 'company_admin') return true
  const perms = getPermissions()
  if (perms.includes('*')) return true
  return perms.includes(code)
}

export function clearAuth(scope) {
  const keys = SCOPES[scope]
  localStorage.removeItem(keys.tokenKey)
  localStorage.removeItem(keys.authKey)
}

export function isAdmin() {
  return getAuth('admin')?.user?.role === 'super_admin'
}

export function isCompanyUser() {
  const role = getAuth('company')?.user?.role
  return role === 'company_admin' || role === 'user'
}

migrateLegacyAuth()
