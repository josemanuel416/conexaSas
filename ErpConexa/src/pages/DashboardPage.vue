<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      :title="dashboard?.company?.name || 'Dashboard'"
      icon="dashboard"
      :subtitle="dashboard?.company?.nit ? `NIT: ${dashboard.company.nit}` : ''"
    />

    <div class="company-page-card">
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-sm-6">
          <q-card flat bordered class="dashboard-stat-card">
            <q-card-section class="row items-center">
              <div class="dashboard-stat-card__icon">
                <q-icon name="people" size="28px" color="primary" />
              </div>
              <div>
                <div class="text-h5">{{ dashboard?.stats?.users || 0 }}</div>
                <div class="text-grey-7">Usuarios activos</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-sm-6">
          <q-card flat bordered class="dashboard-stat-card">
            <q-card-section class="row items-center">
              <div class="dashboard-stat-card__icon">
                <q-icon name="extension" size="28px" color="primary" />
              </div>
              <div>
                <div class="text-h5">{{ dashboard?.stats?.modules || 0 }}</div>
                <div class="text-grey-7">Módulos activos</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div class="text-subtitle1 text-weight-medium q-mb-md">Módulos disponibles</div>
      <div class="row q-col-gutter-md">
        <div
          v-for="mod in dashboard?.modules || []"
          :key="mod.code"
          class="col-12 col-sm-6 col-md-4"
        >
          <q-card flat bordered class="module-card">
            <q-card-section class="row items-center">
              <div class="module-card__icon">
                <q-icon :name="mod.icon || 'extension'" size="26px" color="primary" />
              </div>
              <div>
                <div class="text-subtitle1">{{ mod.name }}</div>
                <div class="text-caption text-grey-7">{{ mod.description }}</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>

    <q-inner-loading :showing="loading" />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const loading = ref(true)
const dashboard = ref(null)

onMounted(async () => {
  dashboard.value = await api.dashboard()
  loading.value = false
})
</script>

<style scoped>
.dashboard-stat-card,
.module-card {
  border-radius: 12px;
  border-color: #90caf9;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
  overflow: hidden;
}
.dashboard-stat-card {
  border-top: 3px solid #1976d2;
}
.module-card {
  border-top: 3px solid #0d47a1;
}
.dashboard-stat-card:hover,
.module-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 32px rgba(13, 71, 161, 0.16);
}
.dashboard-stat-card__icon,
.module-card__icon {
  width: 52px;
  height: 52px;
  margin-right: 16px;
  border-radius: 14px;
  background: #e3f2fd;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
@media (prefers-reduced-motion: reduce) {
  .dashboard-stat-card,
  .module-card {
    transition: none;
  }
  .dashboard-stat-card:hover,
  .module-card:hover {
    transform: none;
  }
}
</style>
