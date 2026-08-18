import { getAuth, isAdmin, isCompanyUser } from 'src/utils/auth.js'

const routes = [
  // --- Sitio público ---
  {
    path: '/',
    component: () => import('layouts/PublicLayout.vue'),
    meta: { public: true },
    children: [
      { path: '', component: () => import('pages/public/LandingPage.vue') },
    ],
  },

  // --- Login compañía ---
  {
    path: '/login',
    component: () => import('layouts/AuthLayout.vue'),
    meta: { guest: true },
    children: [
      { path: '', component: () => import('pages/LoginPage.vue') },
    ],
  },

  // --- App compañía ---
  {
    path: '/',
    component: () => import('layouts/CompanyLayout.vue'),
    meta: { requiresCompany: true },
    children: [
      {
        path: 'dashboard',
        component: () => import('pages/DashboardPage.vue'),
      },
      {
        path: 'users',
        meta: { requiresCompanyAdmin: true },
        component: () => import('pages/company/UsersPage.vue'),
      },
      {
        path: 'users/create',
        meta: { requiresCompanyAdmin: true },
        component: () => import('pages/company/UserFormPage.vue'),
      },
      {
        path: 'users/:id/edit',
        meta: { requiresCompanyAdmin: true },
        component: () => import('pages/company/UserFormPage.vue'),
      },
      {
        path: 'agenda',
        component: () => import('pages/company/agenda/AgendaPage.vue'),
      },
      {
        path: 'ventas',
        component: () => import('pages/company/ventas/VentasPage.vue'),
      },
      {
        path: 'ventas/configuracion',
        component: () => import('pages/company/ventas/ConfigVentasPage.vue'),
      },
      {
        path: 'facturacion',
        component: () => import('pages/company/facturacion/FacturacionPage.vue'),
      },
      {
        path: 'caja',
        component: () => import('pages/company/caja/CajaPage.vue'),
      },
      {
        path: 'inventario',
        component: () => import('pages/company/inventario/InventarioPage.vue'),
      },
      {
        path: 'inventario/configuracion',
        component: () => import('pages/company/inventario/ConfigInventarioPage.vue'),
      },
      {
        path: 'contabilidad',
        component: () => import('pages/company/contabilidad/ContabilidadPage.vue'),
      },
      {
        path: 'contabilidad/reportes',
        component: () => import('pages/company/contabilidad/ReportesContabilidadPage.vue'),
      },
      {
        path: 'contabilidad/configuracion',
        component: () => import('pages/company/contabilidad/ConfigContabilidadPage.vue'),
      },
      {
        path: 'soporte',
        component: () => import('pages/company/support/SupportPage.vue'),
      },
    ],
  },

  // --- Admin login ---
  {
    path: '/admin/login',
    component: () => import('layouts/AuthLayout.vue'),
    meta: { guest: true },
    children: [
      { path: '', component: () => import('pages/admin/LoginPage.vue') },
    ],
  },

  // --- Panel administrativo ---
  {
    path: '/admin',
    component: () => import('layouts/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      {
        path: '',
        redirect: '/admin/dashboard',
      },
      {
        path: 'dashboard',
        component: () => import('pages/admin/DashboardPage.vue'),
      },
      {
        path: 'companies',
        component: () => import('pages/admin/CompaniesPage.vue'),
      },
      {
        path: 'companies/create',
        name: 'admin-companies-create',
        component: () => import('pages/admin/CompanyFormPage.vue'),
      },
      {
        path: 'companies/:id/edit',
        name: 'admin-companies-edit',
        component: () => import('pages/admin/CompanyFormPage.vue'),
      },
      {
        path: 'companies/:id/modules',
        component: () => import('pages/admin/CompanyModulesPage.vue'),
      },
      {
        path: 'permissions',
        component: () => import('pages/admin/PermissionsPage.vue'),
      },
      {
        path: 'site',
        component: () => import('pages/admin/SiteContentPage.vue'),
      },
      {
        path: 'plans',
        component: () => import('pages/admin/PlansPage.vue'),
      },
      {
        path: 'support',
        component: () => import('pages/admin/SupportTicketsPage.vue'),
      },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('layouts/AuthLayout.vue'),
    children: [
      { path: '', component: () => import('pages/ErrorNotFound.vue') },
    ],
  },
]

export default routes

export function setupRouterGuards(router) {
  router.beforeEach((to) => {
    if (to.meta.requiresAdmin) {
      const auth = getAuth('admin')
      if (!auth || !isAdmin()) {
        return '/admin/login'
      }
    }

    if (to.meta.requiresCompany) {
      const auth = getAuth('company')
      if (!auth || !isCompanyUser()) {
        return '/login'
      }
    }

    if (to.meta.requiresCompanyAdmin) {
      const auth = getAuth('company')
      if (!auth || auth.user?.role !== 'company_admin') {
        return '/dashboard'
      }
    }

    if (to.meta.guest) {
      if (to.path.startsWith('/admin/login')) {
        if (isAdmin()) return '/admin/dashboard'
      } else if (to.path === '/login') {
        if (isCompanyUser()) return '/dashboard'
      }
    }

    return true
  })
}
