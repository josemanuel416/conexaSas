<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      title="Compañías"
      icon="business"
      subtitle="Gestión de tenants, contratos y acceso al ERP"
    />

    <div class="company-page-card">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-body2 text-grey-7">
          {{ companies.length }} compañía{{ companies.length === 1 ? '' : 's' }} registrada{{ companies.length === 1 ? '' : 's' }}
        </div>
        <q-btn
          color="primary"
          icon="add"
          label="Nueva compañía"
          to="/admin/companies/create"
          unelevated
        />
      </div>

      <q-table
        class="company-data-table"
        :rows="companies"
        :columns="columns"
        row-key="id"
        flat
        bordered
        :loading="loading"
        :rows-per-page-options="[10, 25, 50]"
      >
        <template #body-cell-name="props">
          <q-td :props="props" class="company-data-table__wrap">
            <div class="text-weight-medium">{{ props.row.name }}</div>
          </q-td>
        </template>

        <template #body-cell-isActive="props">
          <q-td :props="props">
            <q-badge :color="props.row.isActive ? 'positive' : 'negative'">
              {{ props.row.isActive ? 'Activa' : 'Inactiva' }}
            </q-badge>
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props" class="company-data-table__actions">
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="edit"
              color="primary"
              :to="`/admin/companies/${props.row.id}/edit`"
            >
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="settings"
              color="primary"
              :to="`/admin/companies/${props.row.id}/modules`"
            >
              <q-tooltip>Módulos</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()
const loading = ref(true)
const companies = ref([])

const columns = [
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'nit', label: 'NIT', field: 'nit', align: 'left' },
  { name: 'slug', label: 'Slug', field: 'slug', align: 'left' },
  { name: 'userCount', label: 'Usuarios', field: 'userCount', align: 'center' },
  { name: 'moduleCount', label: 'Módulos', field: 'moduleCount', align: 'center' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' },
]

onMounted(async () => {
  try {
    companies.value = await api.admin.companies()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    loading.value = false
  }
})
</script>
