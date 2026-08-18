<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      title="Dashboard administrativo"
      icon="dashboard"
      subtitle="Gestión de compañías y permisos de módulos"
    />

    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-4">
        <div class="company-page-card dashboard-stat-card">
          <div class="row items-center no-wrap">
            <q-icon name="business" size="44px" color="primary" class="q-mr-md" />
            <div>
              <div class="text-h4 text-weight-bold">{{ stats.companies }}</div>
              <div class="text-grey-7">Compañías</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="company-page-card dashboard-stat-card">
          <div class="row items-center no-wrap">
            <q-icon name="check_circle" size="44px" color="positive" class="q-mr-md" />
            <div>
              <div class="text-h4 text-weight-bold">{{ stats.active }}</div>
              <div class="text-grey-7">Activas</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="company-page-card dashboard-stat-card">
          <div class="row items-center no-wrap">
            <q-icon name="extension" size="44px" color="primary" class="q-mr-md" />
            <div>
              <div class="text-h4 text-weight-bold">{{ stats.modules }}</div>
              <div class="text-grey-7">Módulos disponibles</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="company-page-card">
      <div class="text-subtitle1 text-weight-medium q-mb-md">Acciones rápidas</div>
      <div class="row q-gutter-sm">
        <q-btn
          color="primary"
          icon="add_business"
          label="Crear compañía"
          to="/admin/companies/create"
          unelevated
        />
        <q-btn
          outline
          color="primary"
          icon="list"
          label="Ver compañías"
          to="/admin/companies"
        />
        <q-btn
          outline
          color="primary"
          icon="security"
          label="Permisos"
          to="/admin/permissions"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()
const stats = ref({ companies: 0, active: 0, modules: 0 })

onMounted(async () => {
  try {
    const [companies, modules] = await Promise.all([
      api.admin.companies(),
      api.admin.modules(),
    ])
    stats.value = {
      companies: companies.length,
      active: companies.filter((c) => c.isActive).length,
      modules: modules.length,
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
})
</script>

<style scoped>
.dashboard-stat-card {
  height: 100%;
}
</style>
