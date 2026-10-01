<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <q-banner dense rounded class="bg-blue-1 text-blue-10 q-mb-md">
        Catálogo <strong>CNDBCR</strong>: conceptos internos de notas débito/crédito con homologación DIAN (tipo 95, anexo 16.2.4).
      </q-banner>

      <div class="row q-col-gutter-sm q-mb-md items-center">
        <div class="col-auto">
          <q-btn
            v-if="canManage"
            color="primary"
            icon="add"
            label="Nuevo concepto"
            unelevated
            no-caps
            @click="openDialog()"
          />
        </div>
      </div>

      <q-table
        :rows="conceptos"
        :columns="columns"
        row-key="id"
        flat
        bordered
        class="company-data-table"
        :loading="loading"
      >
        <template #body-cell-dianCode="props">
          <q-td :props="props">
            <q-badge color="teal-7" outline>{{ props.row.dianCode }}</q-badge>
            <div class="text-caption text-grey-7">{{ props.row.dianName }}</div>
          </q-td>
        </template>
        <template #body-cell-cuentaConta="props">
          <q-td :props="props">
            <span v-if="props.row.cuentaContaCode">{{ props.row.cuentaContaCode }}</span>
            <span v-else class="text-grey-6">—</span>
          </q-td>
        </template>
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge :color="props.row.status === 'activo' ? 'positive' : 'grey'">
              {{ props.row.status === 'activo' ? 'Activo' : 'Inactivo' }}
            </q-badge>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props" class="company-data-table__actions">
            <q-btn
              v-if="canManage"
              flat dense round size="sm"
              icon="edit"
              color="primary"
              @click="openDialog(props.row)"
            >
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <CompanyFormDialog
      v-model="dialogOpen"
      :title="editId ? 'Editar concepto' : 'Nuevo concepto'"
      icon="topic"
      compact
      @hide="resetDialog"
    >
      <div class="cxp-concepto-form">
        <q-input
          v-model="form.concepto"
          label="Concepto (código interno) *"
          outlined dense maxlength="20"
          hint="Ej. 01, DEVPAR, AJPRE"
        />
        <q-input
          v-model="form.descripcion"
          label="Descripción *"
          outlined dense type="textarea" autogrow class="cxp-concepto-form__full"
        />
        <q-select
          v-model="form.dianCode"
          :options="dianOptions"
          label="Homologo DIAN *"
          outlined dense emit-value map-options class="cxp-concepto-form__full"
        />
        <q-select
          v-model="form.cuentaConta"
          :options="accountOptions"
          label="Cuenta contable"
          outlined dense emit-value map-options clearable
          use-input input-debounce="200"
          @filter="filterAccounts"
        />
        <q-input v-model.number="form.sortOrder" type="number" label="Orden" outlined dense min="0" />
        <q-select
          v-model="form.status"
          :options="statusOptions"
          label="Estado *"
          outlined dense emit-value map-options
        />
      </div>
      <template #actions>
        <q-btn flat no-caps icon="close" label="Cancelar" color="grey-8" @click="dialogOpen = false" />
        <q-btn unelevated no-caps icon="save" label="Guardar" color="primary" :loading="saving" @click="saveConcepto" />
      </template>
    </CompanyFormDialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import { api } from 'src/services/api.js'
import { hasPermission } from 'src/utils/auth.js'

const $q = useQuasar()

const pageMeta = { title: 'Conceptos notas CxP', icon: 'topic' }
const loading = ref(false)
const saving = ref(false)
const dialogOpen = ref(false)
const editId = ref(null)
const conceptos = ref([])
const dianCatalog = ref([])
const accounts = ref([])
const accountOptions = ref([])

const canManage = computed(() =>
  hasPermission('cuentas_pagar.config') || hasPermission('cuentas_pagar.registrar'),
)

const columns = [
  { name: 'concepto', label: 'Concepto', field: 'concepto', align: 'left', style: 'width: 96px' },
  { name: 'descripcion', label: 'Descripción', field: 'descripcion', align: 'left' },
  { name: 'dianCode', label: 'Homologo DIAN', field: 'dianCode', align: 'left', style: 'width: 180px' },
  { name: 'cuentaConta', label: 'Cuenta conta.', field: 'cuentaContaCode', align: 'left', style: 'width: 110px' },
  { name: 'sortOrder', label: 'Orden', field: 'sortOrder', align: 'center', style: 'width: 72px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'left', style: 'width: 96px' },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 72px' },
]

const statusOptions = [
  { label: 'Activo', value: 'activo' },
  { label: 'Inactivo', value: 'inactivo' },
]

const form = reactive(emptyForm())

const dianOptions = computed(() =>
  dianCatalog.value.map((item) => ({
    label: `${item.code} — ${item.name}`,
    value: item.code,
  })),
)

function emptyForm() {
  return {
    concepto: '',
    descripcion: '',
    dianCode: '1',
    cuentaConta: null,
    sortOrder: 0,
    status: 'activo',
  }
}

function resetDialog() {
  editId.value = null
  Object.assign(form, emptyForm())
}

function openDialog(row = null) {
  resetDialog()
  if (row) {
    editId.value = row.id
    Object.assign(form, {
      concepto: row.concepto,
      descripcion: row.descripcion,
      dianCode: row.dianCode,
      cuentaConta: row.cuentaConta,
      sortOrder: row.sortOrder,
      status: row.status,
    })
  }
  dialogOpen.value = true
}

function filterAccounts(val, update) {
  update(() => {
    const q = String(val || '').toLowerCase()
    accountOptions.value = accounts.value
      .filter((a) => !q || `${a.code} ${a.name}`.toLowerCase().includes(q))
      .map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id }))
  })
}

async function loadData() {
  loading.value = true
  try {
    const [items, dian, accts] = await Promise.all([
      api.cuentasPagar.conceptosNotas.list(),
      api.cuentasPagar.conceptosNotas.dianCatalog(),
      api.contabilidad.accounts(),
    ])
    conceptos.value = items
    dianCatalog.value = dian
    accounts.value = accts.filter((a) => a.accountType === 'detalle' && a.status === 'activo')
    accountOptions.value = accounts.value.map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id }))
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudieron cargar los conceptos' })
  } finally {
    loading.value = false
  }
}

async function saveConcepto() {
  saving.value = true
  try {
    const payload = { ...form }
    if (editId.value) {
      await api.cuentasPagar.conceptosNotas.update(editId.value, payload)
    } else {
      await api.cuentasPagar.conceptosNotas.create(payload)
    }
    dialogOpen.value = false
    await loadData()
    $q.notify({ type: 'positive', message: 'Concepto guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo guardar' })
  } finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.cxp-concepto-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.cxp-concepto-form__full {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .cxp-concepto-form {
    grid-template-columns: 1fr;
  }
}
</style>
