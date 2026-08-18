<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="company-layout-header" :style="headerStyle">
      <q-toolbar class="full-width">
        <q-btn flat dense round icon="menu" color="white" aria-label="Menú" @click="drawer = !drawer" />
        <q-toolbar-title class="text-white">
          {{ auth?.user?.companyName || 'ErpConexa' }}
        </q-toolbar-title>
        <q-chip color="white" :text-color="theme.primary" icon="person" class="q-mr-sm">
          {{ auth?.user?.fullName }}
        </q-chip>
        <q-btn flat color="white" icon="logout" label="Salir" @click="logout" />
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered class="company-drawer" :width="drawerWidth">
      <q-scroll-area class="fit">
        <q-list padding class="company-drawer__list">
          <q-item-label header class="company-drawer__section-title">Menú</q-item-label>

          <q-item
            clickable
            v-ripple
            to="/dashboard"
            exact
            class="company-drawer__item"
            active-class="company-drawer__item--active"
          >
            <q-item-section avatar><q-icon name="dashboard" /></q-item-section>
            <q-item-section>Dashboard</q-item-section>
          </q-item>

          <template v-if="hasSalesBilling">
            <q-separator class="company-drawer__separator" />
            <q-item-label header class="company-drawer__section-title">
              {{ SALES_BILLING_MENU.section }}
            </q-item-label>
            <q-item
              v-for="item in SALES_BILLING_MENU.items"
              :key="item.label"
              clickable
              v-ripple
              :to="buildModuleRoute(item)"
              class="company-drawer__item"
              active-class="company-drawer__item--active"
            >
              <q-item-section avatar>
                <q-icon :name="item.icon" />
              </q-item-section>
              <q-item-section>{{ item.label }}</q-item-section>
            </q-item>
          </template>

          <q-separator v-if="hasSalesBilling" class="company-drawer__separator" />
          <q-item-label v-if="auth?.modules?.length" header class="company-drawer__section-title">Módulos</q-item-label>

          <template v-for="mod in auth?.modules || []">
            <q-expansion-item
              v-if="getModuleMenu(mod.code)?.items?.length"
              :key="`menu-exp-${mod.code}`"
              :icon="mod.icon || 'extension'"
              :label="mod.name"
              :default-opened="expandedModule === mod.code"
              expand-separator
              header-class="company-drawer__module-header"
              class="company-module-expansion"
            >
              <q-item
                v-for="item in getModuleMenu(mod.code).items"
                :key="item.label"
                clickable
                v-ripple
                :to="buildModuleRoute(item)"
                dense
                class="company-drawer__subitem"
                active-class="company-drawer__item--active"
              >
                <q-item-section avatar><q-icon :name="item.icon" size="18px" /></q-item-section>
                <q-item-section>{{ item.label }}</q-item-section>
              </q-item>
            </q-expansion-item>

            <q-item v-else :key="`menu-mod-${mod.code}`" clickable v-ripple disable class="company-drawer__item">
              <q-item-section avatar><q-icon :name="mod.icon || 'extension'" color="grey-6" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ mod.name }}</q-item-label>
                <q-item-label caption>Próximamente</q-item-label>
              </q-item-section>
            </q-item>
          </template>

          <q-item v-if="!auth?.modules?.length">
            <q-item-section class="text-grey-7 text-caption">Sin módulos activos</q-item-section>
          </q-item>

          <template v-if="hasInventarioConfig && INVENTARIO_CONFIG_MENU.items.length">
            <q-separator class="company-drawer__separator" />
            <q-item-label header class="company-drawer__section-title">Inventario</q-item-label>
            <q-item
              v-for="item in INVENTARIO_CONFIG_MENU.items"
              :key="item.label"
              clickable
              v-ripple
              :to="buildModuleRoute(item)"
              class="company-drawer__item"
              active-class="company-drawer__item--active"
            >
              <q-item-section avatar><q-icon :name="item.icon" /></q-item-section>
              <q-item-section>{{ item.label }}</q-item-section>
            </q-item>
          </template>

          <template v-if="hasVentasConfig && VENTAS_CONFIG_MENU.items.length">
            <q-separator class="company-drawer__separator" />
            <q-item-label header class="company-drawer__section-title">Configuración</q-item-label>
            <q-item
              v-for="item in VENTAS_CONFIG_MENU.items"
              :key="item.label"
              clickable
              v-ripple
              :to="buildModuleRoute(item)"
              class="company-drawer__item"
              active-class="company-drawer__item--active"
            >
              <q-item-section avatar><q-icon :name="item.icon" /></q-item-section>
              <q-item-section>{{ item.label }}</q-item-section>
            </q-item>
          </template>

          <template v-if="isCompanyAdmin">
            <q-separator class="company-drawer__separator" />
            <q-item-label header class="company-drawer__section-title">Administración</q-item-label>
            <q-item
              clickable
              v-ripple
              to="/users"
              class="company-drawer__item"
              active-class="company-drawer__item--active"
            >
              <q-item-section avatar><q-icon name="people" /></q-item-section>
              <q-item-section>Usuarios y permisos</q-item-section>
            </q-item>
          </template>

          <q-separator class="company-drawer__separator" />
          <q-item-label header class="company-drawer__section-title">ConexaSoft</q-item-label>
          <q-item
            clickable
            v-ripple
            to="/soporte"
            class="company-drawer__item"
            active-class="company-drawer__item--active"
          >
            <q-item-section avatar><q-icon name="support_agent" /></q-item-section>
            <q-item-section>Soporte y requerimientos</q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <nav
      v-if="!drawer && sectionMenuItems.length"
      class="company-section-rail"
      aria-label="Accesos rápidos del módulo"
    >
      <q-btn
        v-for="item in sectionMenuItems"
        :key="item.label"
        flat
        round
        dense
        size="sm"
        :icon="item.icon"
        :to="buildModuleRoute(item)"
        class="company-section-rail__btn"
        :class="{ 'company-section-rail__btn--active': isSectionItemActive(item) }"
      >
        <q-tooltip anchor="center right" self="center left">{{ item.label }}</q-tooltip>
      </q-btn>
    </nav>

    <q-page-container :class="{ 'company-page-container--rail': !drawer && sectionMenuItems.length }">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAuth, clearAuth } from 'src/utils/auth.js'
import { applyCompanyTheme, themeHeaderStyle, getThemeFromAuth } from 'src/utils/company-theme.js'
import {
  getModuleMenu,
  buildModuleRoute,
  SALES_BILLING_MENU,
  VENTAS_CONFIG_MENU,
  INVENTARIO_CONFIG_MENU,
  hasVentasModules,
  hasInventarioModule,
  hasSalesBillingMenu,
  getSectionMenuForPath,
} from 'src/config/company-modules.js'

const router = useRouter()
const route = useRoute()
const drawer = ref(true)
const drawerWidth = 252
const auth = getAuth('company')
const isCompanyAdmin = auth?.user?.role === 'company_admin'

const theme = computed(() => getThemeFromAuth(auth))
const headerStyle = computed(() => themeHeaderStyle(theme.value))

const hasVentasConfig = computed(() => hasVentasModules(auth?.modules || []))
const hasInventarioConfig = computed(() => hasInventarioModule(auth?.modules || []))
const hasSalesBilling = computed(() => hasSalesBillingMenu(auth?.modules || []))

const sectionMenuItems = computed(() => getSectionMenuForPath(route.path))

const expandedModule = computed(() => {
  if (route.path.startsWith('/ventas/configuracion')) return null
  if (route.path.startsWith('/ventas')) return 'ventas'
  if (route.path.startsWith('/facturacion')) return 'facturacion'
  if (route.path.startsWith('/agenda')) return 'agenda_citas'
  if (route.path.startsWith('/caja')) return 'caja'
  if (route.path.startsWith('/inventario')) return 'inventario'
  if (route.path.startsWith('/contabilidad')) return 'contabilidad'
  return null
})

onMounted(() => {
  if (auth?.theme) applyCompanyTheme(auth.theme)
})

watch(
  () => auth?.theme,
  (t) => {
    if (t) applyCompanyTheme(t)
  },
  { deep: true }
)

function isSectionItemActive(item) {
  if (route.path !== item.to) return false
  const defaultTab = item.to === '/facturacion'
    ? 'invoices'
    : item.to === '/ventas'
      ? 'cotizaciones'
      : item.to === '/ventas/configuracion'
        ? 'resolutions'
      : item.to === '/agenda'
        ? 'agenda'
        : item.to === '/caja'
          ? 'operacion'
          : item.to === '/inventario'
            ? 'movimientos'
            : item.to === '/inventario/configuracion'
              ? 'bodegas'
          : null
  const currentTab = route.query.tab || defaultTab
  if (!item.query?.tab) return !route.query.tab || item.to === '/users'
  return item.query.tab === currentTab
}

function logout() {
  clearAuth('company')
  router.push('/login')
}
</script>
