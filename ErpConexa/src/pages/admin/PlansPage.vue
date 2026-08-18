<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader title="Paquetes y precios" icon="sell" subtitle="Planes comerciales visibles en el sitio web" />

    <div class="row justify-end q-mb-md">
      <q-btn color="primary" icon="add" label="Nuevo paquete" unelevated @click="openDialog()" />
    </div>

    <q-table :rows="plans" :columns="columns" row-key="id" flat bordered class="company-data-table company-page-card" :loading="loading">
      <template #body-cell-priceMonthly="props">
        <q-td :props="props">${{ formatMoney(props.row.priceMonthly) }}</q-td>
      </template>
      <template #body-cell-isFeatured="props">
        <q-td :props="props">
          <q-icon :name="props.row.isFeatured ? 'star' : 'star_border'" :color="props.row.isFeatured ? 'amber-8' : 'grey'" />
        </q-td>
      </template>
      <template #body-cell-isActive="props">
        <q-td :props="props">
          <q-badge :color="props.row.isActive ? 'positive' : 'grey'">{{ props.row.isActive ? 'Activo' : 'Inactivo' }}</q-badge>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat dense icon="edit" color="primary" @click="openDialog(props.row)" />
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="dialog" persistent>
      <q-card class="company-form-dialog" style="min-width: 520px; max-width: 90vw">
        <q-card-section>
          <div class="text-h6">{{ editing ? 'Editar paquete' : 'Nuevo paquete' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model="form.name" label="Nombre *" outlined dense />
          <q-input v-model="form.slug" label="Slug *" outlined dense hint="ej. profesional" />
          <q-input v-model="form.description" label="Descripción" type="textarea" outlined autogrow />
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input v-model.number="form.priceMonthly" label="Precio mensual *" type="number" outlined dense />
            </div>
            <div class="col-6">
              <q-input v-model.number="form.priceYearly" label="Precio anual" type="number" outlined dense />
            </div>
          </div>
          <q-input v-model="featuresText" label="Características (una por línea)" type="textarea" outlined autogrow />
          <q-input v-model="moduleCodesText" label="Módulos incluidos (códigos separados por coma)" outlined dense hint="ventas, facturacion, inventario..." />
          <div class="row q-col-gutter-md">
            <div class="col-4">
              <q-input v-model.number="form.sortOrder" label="Orden" type="number" outlined dense />
            </div>
            <div class="col-4">
              <q-toggle v-model="form.isFeatured" label="Destacado" />
            </div>
            <div class="col-4">
              <q-toggle v-model="form.isActive" label="Activo" />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Guardar" unelevated :loading="saving" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()
const loading = ref(false)
const saving = ref(false)
const plans = ref([])
const dialog = ref(false)
const editing = ref(null)
const featuresText = ref('')
const moduleCodesText = ref('')

const form = reactive({
  name: '',
  slug: '',
  description: '',
  priceMonthly: 0,
  priceYearly: null,
  sortOrder: 0,
  isFeatured: false,
  isActive: true,
})

const columns = [
  { name: 'sortOrder', label: 'Orden', field: 'sortOrder', align: 'center' },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' },
  { name: 'slug', label: 'Slug', field: 'slug', align: 'left' },
  { name: 'priceMonthly', label: 'Mensual', field: 'priceMonthly', align: 'right' },
  { name: 'isFeatured', label: 'Destacado', field: 'isFeatured', align: 'center' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function openDialog(row = null) {
  editing.value = row
  if (row) {
    Object.assign(form, {
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      priceMonthly: row.priceMonthly,
      priceYearly: row.priceYearly,
      sortOrder: row.sortOrder,
      isFeatured: row.isFeatured,
      isActive: row.isActive,
    })
    featuresText.value = (row.features || []).join('\n')
    moduleCodesText.value = (row.moduleCodes || []).join(', ')
  } else {
    Object.assign(form, { name: '', slug: '', description: '', priceMonthly: 0, priceYearly: null, sortOrder: 0, isFeatured: false, isActive: true })
    featuresText.value = ''
    moduleCodesText.value = ''
  }
  dialog.value = true
}

async function load() {
  loading.value = true
  try {
    plans.value = await api.admin.plans()
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.name?.trim() || !form.slug?.trim()) {
    $q.notify({ type: 'warning', message: 'Nombre y slug son requeridos' })
    return
  }
  saving.value = true
  try {
    const payload = {
      ...form,
      features: featuresText.value.split('\n').map((s) => s.trim()).filter(Boolean),
      moduleCodes: moduleCodesText.value.split(',').map((s) => s.trim()).filter(Boolean),
    }
    if (editing.value) {
      await api.admin.updatePlan(editing.value.id, payload)
    } else {
      await api.admin.createPlan(payload)
    }
    dialog.value = false
    await load()
    $q.notify({ type: 'positive', message: 'Paquete guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
