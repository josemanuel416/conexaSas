<template>
  <q-layout view="hHh lpR fFf" class="admin-layout bg-grey-2">
    <q-header elevated class="admin-layout-header" :style="headerStyle">
      <q-toolbar class="full-width">
        <q-btn
          flat
          dense
          round
          icon="menu"
          color="white"
          aria-label="Menú"
          @click="drawer = !drawer"
        />
        <q-toolbar-title class="text-white row items-center no-wrap">
          <img
            :src="brandAssets.iconWhitePng"
            alt="ConexaSoft"
            class="admin-layout-header__logo q-mr-sm"
          />
          <span>Panel Administrativo</span>
        </q-toolbar-title>
        <q-chip color="white" text-color="primary" icon="person" class="q-mr-sm">
          {{ auth?.user?.fullName }}
        </q-chip>
        <q-btn flat color="white" icon="logout" label="Salir" @click="logout" />
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="drawer"
      show-if-above
      bordered
      class="admin-drawer company-drawer"
      :width="drawerWidth"
    >
      <q-scroll-area class="fit">
        <div class="admin-drawer__brand">
          <img :src="brandAssets.iconPng" alt="ConexaSoft" class="admin-drawer__brand-logo" />
          <div class="admin-drawer__brand-text">
            <div class="admin-drawer__brand-title">Conexa</div>
            <div class="admin-drawer__brand-sub">ConexaSoft S.A.S</div>
          </div>
        </div>

        <q-list padding class="company-drawer__list">
          <q-item-label header class="company-drawer__section-title">Menú principal</q-item-label>

          <q-item
            v-for="item in menuItems"
            :key="item.to"
            clickable
            v-ripple
            :to="item.to"
            :exact="item.exact"
            class="company-drawer__item"
            active-class="company-drawer__item--active"
          >
            <q-item-section avatar>
              <q-icon :name="item.icon" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ item.label }}</q-item-label>
              <q-item-label v-if="item.caption" caption>{{ item.caption }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAuth, clearAuth } from 'src/utils/auth.js'
import { ADMIN_THEME, applyAdminTheme, themeHeaderStyle } from 'src/utils/company-theme.js'
import { BRAND_ASSETS } from 'src/config/brand-assets.js'

const router = useRouter()
const drawer = ref(true)
const drawerWidth = 252
const auth = getAuth('admin')
const brandAssets = BRAND_ASSETS

const headerStyle = computed(() => themeHeaderStyle(ADMIN_THEME))

const menuItems = [
  { label: 'Dashboard', icon: 'dashboard', to: '/admin/dashboard', exact: true, caption: 'Resumen general' },
  { label: 'Compañías', icon: 'business', to: '/admin/companies', caption: 'Tenants y contratos' },
  { label: 'Sitio web', icon: 'language', to: '/admin/site', caption: 'Misión, visión y contacto' },
  { label: 'Paquetes', icon: 'sell', to: '/admin/plans', caption: 'Precios y planes' },
  { label: 'Soporte', icon: 'support_agent', to: '/admin/support', caption: 'Tickets de compañías' },
  { label: 'Permisos', icon: 'security', to: '/admin/permissions', caption: 'Catálogo del sistema' },
]

onMounted(() => {
  applyAdminTheme()
})

function logout() {
  clearAuth('admin')
  router.push('/admin/login')
}
</script>
