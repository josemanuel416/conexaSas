<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      title="Usuarios del sistema"
      icon="people"
      subtitle="Gestiona accesos y permisos por módulo"
    />

    <div class="company-page-card">
      <div class="q-mb-md">
        <q-btn
          color="primary"
          icon="person_add"
          label="Nuevo usuario"
          to="/users/create"
          unelevated
        />
      </div>

      <q-table
        class="company-data-table"
        :rows="users"
        :columns="columns"
        row-key="id"
        flat
        bordered
        :loading="loading"
      >
        <template #body-cell-actions="props">
          <q-td :props="props" class="company-data-table__actions">
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="edit"
              color="primary"
              :to="`/users/${props.row.id}/edit`"
            >
              <q-tooltip>Editar y permisos</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #body-cell-fullName="props">
          <q-td :props="props" class="company-data-table__wrap">
            <div class="company-data-table__two-lines">{{ props.row.fullName || '—' }}</div>
          </q-td>
        </template>
        <template #body-cell-email="props">
          <q-td :props="props" class="company-data-table__wrap">
            <div class="company-data-table__two-lines">{{ props.row.email || '—' }}</div>
          </q-td>
        </template>
        <template #body-cell-role="props">
          <q-td :props="props">
            <q-badge :color="props.row.role === 'company_admin' ? 'primary' : 'blue-grey'">
              {{ props.row.role === 'company_admin' ? 'Administrador' : 'Usuario' }}
            </q-badge>
          </q-td>
        </template>
        <template #body-cell-isActive="props">
          <q-td :props="props">
            <q-badge :color="props.row.isActive ? 'positive' : 'negative'">
              {{ props.row.isActive ? 'Activo' : 'Inactivo' }}
            </q-badge>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const loading = ref(true)
const users = ref([])

const columns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'fullName', label: 'Nombre', field: 'fullName', align: 'left', style: 'max-width: 200px' },
  { name: 'email', label: 'Email', field: 'email', align: 'left', style: 'max-width: 220px' },
  { name: 'role', label: 'Rol', field: 'role', align: 'center', style: 'width: 120px' },
  { name: 'permissionCount', label: 'Permisos', field: 'permissionCount', align: 'center', style: 'width: 80px' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center', style: 'width: 90px' },
]

onMounted(async () => {
  users.value = await api.company.users()
  loading.value = false
})
</script>
