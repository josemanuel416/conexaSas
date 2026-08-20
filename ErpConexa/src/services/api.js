function resolveApiUrl() {
  if (import.meta.env.DEV) return ''
  const raw = import.meta.env.VITE_API_URL
  if (raw === '' || raw === 'same-origin') return ''
  return raw || 'http://localhost:3500'
}

const API_URL = resolveApiUrl()

function handleUnauthorized(path) {
  if (typeof window === 'undefined') return
  const isAdmin = path.startsWith('/api/admin')
  if (isAdmin) {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_auth')
    if (!window.location.hash.startsWith('#/admin/login')) {
      window.location.hash = '#/admin/login'
    }
  } else {
    localStorage.removeItem('company_token')
    localStorage.removeItem('company_auth')
    if (!window.location.hash.startsWith('#/login')) {
      window.location.hash = '#/login'
    }
  }
}

export function assetUrl(relativePath, cacheBust = '') {
  if (!relativePath) return null
  const base = `${API_URL}/${String(relativePath).replace(/^\/+/, '')}`
  return cacheBust ? `${base}?v=${cacheBust}` : base
}

function getTokenForPath(path) {
  if (path.startsWith('/api/admin')) {
    return localStorage.getItem('admin_token')
  }
  return localStorage.getItem('company_token')
}

function parseDownloadFilename(res, fallback) {
  const custom = res.headers.get('x-download-filename')
  if (custom) return custom
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/)
  return match?.[1] || fallback
}

async function request(path, options = {}) {
  const headers = {
    ...options.headers,
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const token = getTokenForPath(path)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    const hint = import.meta.env.DEV
      ? 'Verifique que Sever.Conexa esté en ejecución (.\\Scripts\\restart-api.ps1).'
      : `Verifique que Sever.Conexa esté en ejecución (${API_URL || 'proxy /api'}).`
    throw new Error(`No se pudo conectar con la API. ${hint}`)
  }
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized(path)
    }
    const fallback = data.message
      || data.error
      || (res.status === 502 ? 'La API no respondió (502). Ejecute .\\Scripts\\restart-api.ps1 y recargue la página (F5).' : null)
      || (res.status === 404 ? `Ruta no encontrada (${path}). ¿Reinició la API?` : null)
      || `Error en la solicitud (HTTP ${res.status})`
    const err = new Error(fallback)
    err.status = res.status
    err.details = data
    throw err
  }

  return data
}

export const api = {
  admin: {
    login: (email, password) =>
      request('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request('/api/admin/auth/me'),
    companies: () => request('/api/admin/companies'),
    company: (id) => request(`/api/admin/companies/${id}`),
    createCompany: (data) =>
      request('/api/admin/companies', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateCompany: (id, data) =>
      request(`/api/admin/companies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    uploadCompanyLogo: (id, file) => {
      const form = new FormData()
      form.append('logo', file)
      return request(`/api/admin/companies/${id}/logo`, { method: 'POST', body: form })
    },
    fetchCompanyLogoBlob: async (id) => {
      const path = `/api/admin/companies/${id}/logo`
      const url = `${API_URL}${path}`
      const headers = {}
      const token = getTokenForPath(path)
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      return { blob, url: URL.createObjectURL(blob) }
    },
    updateModules: (id, modules) =>
      request(`/api/admin/companies/${id}/modules`, {
        method: 'PUT',
        body: JSON.stringify({ modules }),
      }),
    modules: () => request('/api/admin/modules'),
    permissions: () => request('/api/admin/permissions'),
    createPermission: (data) =>
      request('/api/admin/permissions', { method: 'POST', body: JSON.stringify(data) }),
    updatePermission: (id, data) =>
      request(`/api/admin/permissions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    validatePermission: (data) =>
      request('/api/admin/permissions/validate', { method: 'POST', body: JSON.stringify(data) }),
    siteContent: () => request('/api/admin/site/content'),
    updateSiteContent: (data) =>
      request('/api/admin/site/content', { method: 'PUT', body: JSON.stringify(data) }),
    plans: () => request('/api/admin/plans'),
    createPlan: (data) =>
      request('/api/admin/plans', { method: 'POST', body: JSON.stringify(data) }),
    updatePlan: (id, data) =>
      request(`/api/admin/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    contactMessages: () => request('/api/admin/contact-messages'),
    updateContactMessage: (id, data) =>
      request(`/api/admin/contact-messages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    supportTickets: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/admin/support/tickets${q ? '?' + q : ''}`)
    },
    supportTicket: (id) => request(`/api/admin/support/tickets/${id}`),
    replySupportTicket: (id, data) =>
      request(`/api/admin/support/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(data) }),
    updateSupportTicket: (id, data) =>
      request(`/api/admin/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  public: {
    site: () => request('/api/public/site'),
    plans: () => request('/api/public/plans'),
    contact: (data) =>
      request('/api/public/contact', { method: 'POST', body: JSON.stringify(data) }),
  },
  auth: {
    login: (email, password, companySlug = null) =>
      request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(companySlug ? { companySlug } : {}),
        }),
      }),
  },
  dashboard: () => request('/api/dashboard'),
  company: {
    permissions: () => request('/api/company/permissions'),
    users: () => request('/api/company/users'),
    user: (id) => request(`/api/company/users/${id}`),
    createUser: (data) =>
      request('/api/company/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) =>
      request(`/api/company/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateUserPermissions: (id, permissions) =>
      request(`/api/company/users/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
    agenda: {
      professionals: () => request('/api/company/agenda/professionals'),
      createProfessional: (d) => request('/api/company/agenda/professionals', { method: 'POST', body: JSON.stringify(d) }),
      updateProfessional: (id, d) => request(`/api/company/agenda/professionals/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
      services: () => request('/api/company/agenda/services'),
      createService: (d) => request('/api/company/agenda/services', { method: 'POST', body: JSON.stringify(d) }),
      updateService: (id, d) => request(`/api/company/agenda/services/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
      clients: () => request('/api/company/agenda/clients'),
      createClient: (d) => request('/api/company/agenda/clients', { method: 'POST', body: JSON.stringify(d) }),
      updateClient: (id, d) => request(`/api/company/agenda/clients/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
      scheduleTemplates: () => request('/api/company/agenda/schedule-templates'),
      createScheduleTemplate: (d) => request('/api/company/agenda/schedule-templates', { method: 'POST', body: JSON.stringify(d) }),
      availableSlots: (professionalId, date, serviceId = null, excludeAppointmentId = null) => {
        let url = `/api/company/agenda/available-slots?professionalId=${professionalId}&date=${date}`
        if (serviceId) url += `&serviceId=${serviceId}`
        if (excludeAppointmentId) url += `&excludeAppointmentId=${excludeAppointmentId}`
        return request(url)
      },
      appointments: (params = {}) => {
        const q = new URLSearchParams(params).toString()
        return request(`/api/company/agenda/appointments${q ? '?' + q : ''}`)
      },
      createAppointment: (d) => request('/api/company/agenda/appointments', { method: 'POST', body: JSON.stringify(d) }),
      completeAppointment: (id) => request(`/api/company/agenda/appointments/${id}/complete`, { method: 'PATCH' }),
      rescheduleAppointment: (id, d) => request(`/api/company/agenda/appointments/${id}/reschedule`, { method: 'POST', body: JSON.stringify(d) }),
      invoiceAppointment: (id) => request(`/api/company/agenda/appointments/${id}/invoice`, { method: 'POST' }),
      dailyTickets: (date) => request(`/api/company/agenda/tickets/daily?date=${date}`),
    },
  },
  ventas: {
    clients: () => request('/api/company/ventas/clients'),
    dianClientLookup: ({ documentType, documentNumber }) => {
      const q = new URLSearchParams({ documentType, documentNumber }).toString()
      return request(`/api/company/ventas/clients/dian-lookup?${q}`)
    },
    createClient: (d) => request('/api/company/ventas/clients', { method: 'POST', body: JSON.stringify(d) }),
    updateClient: (id, d) => request(`/api/company/ventas/clients/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    services: () => request('/api/company/ventas/services'),
    catalogArticles: () => request('/api/company/ventas/catalog/articles'),
    nextServiceCode: () => request('/api/company/ventas/services/next-code'),
    createService: (d) => request('/api/company/ventas/services', { method: 'POST', body: JSON.stringify(d) }),
    updateService: (id, d) => request(`/api/company/ventas/services/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    settings: () => request('/api/company/ventas/settings'),
    updateSetting: (key, value) =>
      request(`/api/company/ventas/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    resolutions: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/ventas/resolutions${q ? '?' + q : ''}`)
    },
    createResolution: (d) => request('/api/company/ventas/resolutions', { method: 'POST', body: JSON.stringify(d) }),
    updateResolution: (id, d) => request(`/api/company/ventas/resolutions/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    dianConfig: () => request('/api/company/ventas/dian-config'),
    updateDianConfig: (d) =>
      request('/api/company/ventas/dian-config', { method: 'PUT', body: JSON.stringify(d) }),
    dianCertificate: () => request('/api/company/ventas/dian-certificate'),
    uploadDianCertificate: (file, password) => {
      const form = new FormData()
      form.append('certificate', file)
      form.append('password', password)
      return request('/api/company/ventas/dian-certificate', { method: 'POST', body: form })
    },
    deleteDianCertificate: () =>
      request('/api/company/ventas/dian-certificate', { method: 'DELETE' }),
    documents: (kind, params = {}) => {
      const q = new URLSearchParams({ kind, ...params }).toString()
      return request(`/api/company/ventas/documents?${q}`)
    },
    document: (id) => request(`/api/company/ventas/documents/${id}`),
    confirmDocument: (id) => request(`/api/company/ventas/documents/${id}/confirm`, { method: 'PATCH' }),
    sendDocumentToClient: (id, d) =>
      request(`/api/company/ventas/documents/${id}/send-to-client`, { method: 'POST', body: JSON.stringify(d) }),
    fetchDocumentPdf: async (id, { download = false } = {}) => {
      const path = `/api/company/ventas/documents/${id}/pdf${download ? '?download=1' : '?inline=1'}`
      const headers = {}
      const token = getTokenForPath('/api/company/ventas/documents/0/pdf')
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_URL}${path}`, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const pdfBlob = blob.type.includes('pdf')
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
      const filename = parseDownloadFilename(res, `documento-${id}.pdf`)
      const objectUrl = URL.createObjectURL(pdfBlob)
      return { blob: pdfBlob, filename, url: objectUrl }
    },
    createDocument: (d) => request('/api/company/ventas/documents', { method: 'POST', body: JSON.stringify(d) }),
    updateDocument: (id, d) => request(`/api/company/ventas/documents/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    convertDocument: (id, d) => request(`/api/company/ventas/documents/${id}/convert`, { method: 'POST', body: JSON.stringify(d) }),
    invoices: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/ventas/invoices${q ? '?' + q : ''}`)
    },
    invoice: (id) => request(`/api/company/ventas/invoices/${id}`),
    emitInvoice: (id) => request(`/api/company/ventas/invoices/${id}/emit`, { method: 'PATCH' }),
    voidInvoice: (id) => request(`/api/company/ventas/invoices/${id}/void`, { method: 'PATCH' }),
    sendDian: (id) => request(`/api/company/ventas/invoices/${id}/send-dian`, { method: 'POST' }),
    submissions: (id) => request(`/api/company/ventas/invoices/${id}/submissions`),
    submissionDetail: (invoiceId, attempt) =>
      request(`/api/company/ventas/invoices/${invoiceId}/submissions/${attempt}/detail`),
    refreshSubmission: (id, attempt) =>
      request(`/api/company/ventas/invoices/${id}/submissions/${attempt}/refresh`, { method: 'POST' }),
    downloadAttachedDocument: async (id, params = {}) => {
      const path = `/api/company/ventas/invoices/${id}/attached-document`
      const q = new URLSearchParams(params).toString()
      const url = `${API_URL}${path}${q ? '?' + q : ''}`
      const headers = {}
      const token = getTokenForPath(path)
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const filename = parseDownloadFilename(res, `attached-document-${id}.xml`)
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(blobUrl)
      return filename
    },
    downloadClientPackage: async (id, params = {}) => {
      const path = `/api/company/ventas/invoices/${id}/client-package`
      const q = new URLSearchParams(params).toString()
      const url = `${API_URL}${path}${q ? '?' + q : ''}`
      const headers = {}
      const token = getTokenForPath(path)
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const filename = parseDownloadFilename(res, `factura-${id}.zip`)
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(blobUrl)
      return filename
    },
    sendInvoiceToClient: (id, body = {}) =>
      request(`/api/company/ventas/invoices/${id}/send-to-client`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    fetchInvoicePdfBlob: async (id, { download = false } = {}) => {
      const path = `/api/company/ventas/invoices/${id}/pdf${download ? '?download=1' : '?inline=1'}`
      const url = `${API_URL}${path}`
      const headers = {}
      const token = getTokenForPath('/api/company/ventas/invoices/0/pdf')
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const pdfBlob = blob.type.includes('pdf')
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
      const filename = parseDownloadFilename(res, `factura-${id}.pdf`)
      const objectUrl = URL.createObjectURL(pdfBlob)
      return { blob: pdfBlob, filename, url: objectUrl }
    },
    downloadInvoicePdf: async (id) => {
      const { blob, filename, url } = await api.ventas.fetchInvoicePdfBlob(id, { download: true })
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
    allSubmissions: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/ventas/dian-submissions${q ? '?' + q : ''}`)
    },
    creditNotes: () => request('/api/company/ventas/credit-notes'),
    creditNoteConcepts: () => request('/api/company/ventas/credit-note-concepts'),
    invoiceCreditNotes: (invoiceId) => request(`/api/company/ventas/invoices/${invoiceId}/credit-notes`),
    createCreditNote: (d) => request('/api/company/ventas/credit-notes', { method: 'POST', body: JSON.stringify(d) }),
    updateCreditNote: (id, d) => request(`/api/company/ventas/credit-notes/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    voidCreditNote: (id) => request(`/api/company/ventas/credit-notes/${id}/void`, { method: 'PATCH' }),
  },

  caja: {
    paymentMethods: () => request('/api/company/caja/payment-methods'),
    registers: () => request('/api/company/caja/registers'),
    createRegister: (d) => request('/api/company/caja/registers', { method: 'POST', body: JSON.stringify(d) }),
    updateRegister: (id, d) => request(`/api/company/caja/registers/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    currentSession: (registerId) => {
      const q = new URLSearchParams({ registerId }).toString()
      return request(`/api/company/caja/sessions/current?${q}`)
    },
    sessions: (params = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
      return request(`/api/company/caja/sessions${q ? '?' + q : ''}`)
    },
    session: (id) => request(`/api/company/caja/sessions/${id}`),
    openSession: (d) => request('/api/company/caja/sessions/open', { method: 'POST', body: JSON.stringify(d) }),
    closeSession: (id, d) => request(`/api/company/caja/sessions/${id}/close`, { method: 'POST', body: JSON.stringify(d) }),
    receipts: (sessionId) => request(`/api/company/caja/receipts?sessionId=${sessionId}`),
    receiptPrint: (id) => request(`/api/company/caja/receipts/${id}/print`),
    createReceipt: (d) => request('/api/company/caja/receipts', { method: 'POST', body: JSON.stringify(d) }),
    updateReceipt: (id, d) => request(`/api/company/caja/receipts/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    confirmReceipt: (id) => request(`/api/company/caja/receipts/${id}/confirm`, { method: 'POST' }),
    discardReceipt: (id) => request(`/api/company/caja/receipts/${id}/discard`, { method: 'POST' }),
    voidReceipt: (id) => request(`/api/company/caja/receipts/${id}/void`, { method: 'POST' }),
    createEgresoCaja: (d) => request('/api/company/caja/receipts/egreso-caja', { method: 'POST', body: JSON.stringify(d) }),
    emitInvoiceFromReceipt: (id, d) => request(`/api/company/caja/receipts/${id}/invoice`, { method: 'POST', body: JSON.stringify(d) }),
    catalogClients: () => request('/api/company/caja/catalog/clients'),
    catalogClientDianLookup: (params) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/caja/catalog/clients/dian-lookup?${q}`)
    },
    createCatalogClient: (d) => request('/api/company/caja/catalog/clients', { method: 'POST', body: JSON.stringify(d) }),
    catalogServices: () => request('/api/company/caja/catalog/services'),
    nextCatalogServiceCode: () => request('/api/company/caja/catalog/services/next-code'),
    createCatalogService: (d) => request('/api/company/caja/catalog/services', { method: 'POST', body: JSON.stringify(d) }),
    fetchSessionArqueoPdf: async (sessionId, { download = false } = {}) => {
      const path = `/api/company/caja/sessions/${sessionId}/arqueo-pdf${download ? '?download=1' : '?inline=1'}`
      const url = `${API_URL}${path}`
      const headers = {}
      const token = getTokenForPath('/api/company/caja/sessions/x/arqueo-pdf')
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const pdfBlob = blob.type.includes('pdf')
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
      const filename = parseDownloadFilename(res, `arqueo-${sessionId}.pdf`)
      const objectUrl = URL.createObjectURL(pdfBlob)
      return { blob: pdfBlob, filename, url: objectUrl }
    },
    downloadSessionArqueoPdf: async (sessionId) => {
      const { filename, url } = await api.caja.fetchSessionArqueoPdf(sessionId, { download: true })
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
  },

  inventario: {
    warehouses: () => request('/api/company/inventario/warehouses'),
    createWarehouse: (d) => request('/api/company/inventario/warehouses', { method: 'POST', body: JSON.stringify(d) }),
    updateWarehouse: (id, d) => request(`/api/company/inventario/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    articleTypes: () => request('/api/company/inventario/article-types'),
    createArticleType: (d) => request('/api/company/inventario/article-types', { method: 'POST', body: JSON.stringify(d) }),
    updateArticleType: (id, d) => request(`/api/company/inventario/article-types/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    movementTypes: () => request('/api/company/inventario/movement-types'),
    articles: () => request('/api/company/inventario/articles'),
    nextArticleCode: () => request('/api/company/inventario/articles/next-code'),
    createArticle: (d) => request('/api/company/inventario/articles', { method: 'POST', body: JSON.stringify(d) }),
    updateArticle: (id, d) => request(`/api/company/inventario/articles/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    balances: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/inventario/balances${q ? '?' + q : ''}`)
    },
    settings: () => request('/api/company/inventario/settings'),
    movementConfig: () => request('/api/company/inventario/movement-config'),
    updateSetting: (key, value) =>
      request(`/api/company/inventario/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    movements: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/inventario/movements${q ? '?' + q : ''}`)
    },
    movement: (id) => request(`/api/company/inventario/movements/${id}`),
    createMovement: (d) => request('/api/company/inventario/movements', { method: 'POST', body: JSON.stringify(d) }),
    updateMovement: (id, d) =>
      request(`/api/company/inventario/movements/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    confirmMovement: (id) => request(`/api/company/inventario/movements/${id}/confirm`, { method: 'PATCH' }),
    voidMovement: (id, reason) =>
      request(`/api/company/inventario/movements/${id}/void`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    createMovementInvoice: (id, d) =>
      request(`/api/company/inventario/movements/${id}/create-invoice`, { method: 'POST', body: JSON.stringify(d) }),
    catalogClients: () => request('/api/company/inventario/catalog/clients'),
    catalogClientDianLookup: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/inventario/catalog/clients/dian-lookup?${q}`)
    },
    createCatalogClient: (d) =>
      request('/api/company/inventario/catalog/clients', { method: 'POST', body: JSON.stringify(d) }),
    fetchBinary: async (path, fallbackName, { download = false } = {}) => {
      const sep = path.includes('?') ? '&' : '?'
      const fullPath = `${path}${sep}${download ? 'download=1' : 'inline=1'}`
      const headers = {}
      const token = getTokenForPath(fullPath.split('?')[0])
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_URL}${fullPath}`, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const filename = parseDownloadFilename(res, fallbackName)
      const objectUrl = URL.createObjectURL(blob)
      return { blob, filename, url: objectUrl }
    },
    fetchMovimientosReportPdf: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      const path = `/api/company/inventario/movements/export-pdf${q ? `?${q}` : ''}`
      return api.inventario.fetchBinary(path, 'Movimientos-inventario.pdf')
    },
    downloadMovimientosReportExcel: async (params = {}) => {
      const q = new URLSearchParams(params).toString()
      const path = `/api/company/inventario/movements/export-excel${q ? `?${q}` : ''}`
      const { filename, url } = await api.inventario.fetchBinary(path, 'Movimientos-inventario.xlsx', { download: true })
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
    fetchMovementPdf: (id) =>
      api.inventario.fetchBinary(`/api/company/inventario/movements/${id}/pdf`, `Movimiento-${id}.pdf`),
    downloadMovementExcel: async (id) => {
      const { filename, url } = await api.inventario.fetchBinary(
        `/api/company/inventario/movements/${id}/excel`,
        `Movimiento-${id}.xlsx`,
        { download: true },
      )
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
    fetchExistenciasReportPdf: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      const path = `/api/company/inventario/balances/export-pdf${q ? `?${q}` : ''}`
      return api.inventario.fetchBinary(path, 'Existencias-inventario.pdf')
    },
    downloadExistenciasReportExcel: async (params = {}) => {
      const q = new URLSearchParams(params).toString()
      const path = `/api/company/inventario/balances/export-excel${q ? `?${q}` : ''}`
      const { filename, url } = await api.inventario.fetchBinary(path, 'Existencias-inventario.xlsx', { download: true })
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
  },

  contabilidad: {
    accounts: () => request('/api/company/contabilidad/accounts'),
    createAccount: (d) => request('/api/company/contabilidad/accounts', { method: 'POST', body: JSON.stringify(d) }),
    updateAccount: (id, d) =>
      request(`/api/company/contabilidad/accounts/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    downloadChartTemplate: async () => {
      const path = '/api/company/contabilidad/accounts/template'
      const headers = {}
      const token = getTokenForPath(path)
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_URL}${path}`, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const filename = parseDownloadFilename(res, 'Plan-contable-plantilla.xlsx')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
    exportChart: async () => {
      const path = '/api/company/contabilidad/accounts/export'
      const headers = {}
      const token = getTokenForPath(path)
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_URL}${path}`, { headers })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const filename = parseDownloadFilename(res, 'Plan-contable.xlsx')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      return filename
    },
    importChart: async (file) => {
      const form = new FormData()
      form.append('file', file)
      return request('/api/company/contabilidad/accounts/import', { method: 'POST', body: form })
    },
    voucherTypes: () => request('/api/company/contabilidad/voucher-types'),
    createVoucherType: (d) =>
      request('/api/company/contabilidad/voucher-types', { method: 'POST', body: JSON.stringify(d) }),
    updateVoucherType: (id, d) =>
      request(`/api/company/contabilidad/voucher-types/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    costCenters: () => request('/api/company/contabilidad/cost-centers'),
    createCostCenter: (d) =>
      request('/api/company/contabilidad/cost-centers', { method: 'POST', body: JSON.stringify(d) }),
    updateCostCenter: (id, d) =>
      request(`/api/company/contabilidad/cost-centers/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    periods: () => request('/api/company/contabilidad/periods'),
    createPeriod: (d) => request('/api/company/contabilidad/periods', { method: 'POST', body: JSON.stringify(d) }),
    updatePeriod: (id, d) =>
      request(`/api/company/contabilidad/periods/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    taxes: () => request('/api/company/contabilidad/taxes'),
    createTax: (d) => request('/api/company/contabilidad/taxes', { method: 'POST', body: JSON.stringify(d) }),
    updateTax: (id, d) => request(`/api/company/contabilidad/taxes/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    taxClasses: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/contabilidad/tax-classes${q ? '?' + q : ''}`)
    },
    createTaxClass: (d) =>
      request('/api/company/contabilidad/tax-classes', { method: 'POST', body: JSON.stringify(d) }),
    updateTaxClass: (id, d) =>
      request(`/api/company/contabilidad/tax-classes/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    taxRates: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/contabilidad/tax-rates${q ? '?' + q : ''}`)
    },
    createTaxRate: (d) =>
      request('/api/company/contabilidad/tax-rates', { method: 'POST', body: JSON.stringify(d) }),
    updateTaxRate: (id, d) =>
      request(`/api/company/contabilidad/tax-rates/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    journalEntries: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/contabilidad/journal-entries${q ? '?' + q : ''}`)
    },
    journalEntry: (id) => request(`/api/company/contabilidad/journal-entries/${id}`),
    createJournalEntry: (d) =>
      request('/api/company/contabilidad/journal-entries', { method: 'POST', body: JSON.stringify(d) }),
    updateJournalEntry: (id, d) =>
      request(`/api/company/contabilidad/journal-entries/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    postJournalEntry: (id) =>
      request(`/api/company/contabilidad/journal-entries/${id}/post`, { method: 'PATCH' }),
    voidJournalEntry: (id) =>
      request(`/api/company/contabilidad/journal-entries/${id}/void`, { method: 'PATCH' }),
    closePeriod: (id) =>
      request(`/api/company/contabilidad/periods/${id}/close`, { method: 'POST' }),
    trialBalance: (yearMonth) =>
      request(`/api/company/contabilidad/reports/trial-balance?yearMonth=${yearMonth}`),
    auxiliaryLedger: (yearMonth, params = {}) => {
      const search = { yearMonth, ...params }
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(search).filter(([, v]) => v != null && v !== ''))
      ).toString()
      return request(`/api/company/contabilidad/reports/auxiliary-ledger?${q}`)
    },
    generalBalance: (yearMonth) =>
      request(`/api/company/contabilidad/reports/general-balance?yearMonth=${yearMonth}`),
    catalogClients: () => request('/api/company/contabilidad/catalog/clients'),
  },

  support: {
    tickets: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/support/tickets${q ? '?' + q : ''}`)
    },
    ticket: (id) => request(`/api/company/support/tickets/${id}`),
    createTicket: (data) =>
      request('/api/company/support/tickets', { method: 'POST', body: JSON.stringify(data) }),
    addMessage: (id, body) =>
      request(`/api/company/support/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
  },

  catalog: {
    departments: () => request('/api/company/catalog/departments'),
    cities: (params = {}) => {
      const q = new URLSearchParams(params).toString()
      return request(`/api/company/catalog/cities${q ? '?' + q : ''}`)
    },
  },
}
