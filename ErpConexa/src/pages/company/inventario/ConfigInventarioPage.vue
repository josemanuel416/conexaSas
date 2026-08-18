<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <!-- Bodegas -->
      <template v-if="tab === 'bodegas'">
        <div class="q-mb-md">
          <q-btn color="primary" icon="add" label="Nueva bodega" unelevated @click="openWarehouseDialog()" />
        </div>
        <q-table :rows="warehouses" :columns="warehouseColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-isDefault="props">
            <q-td :props="props">
              <q-badge v-if="props.row.isDefault" color="primary">Principal</q-badge>
              <span v-else class="text-grey-6">—</span>
            </q-td>
          </template>
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'grey'">
                {{ props.row.isActive ? 'Activa' : 'Inactiva' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openWarehouseDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Artículos -->
      <template v-else-if="tab === 'articulos'">
        <div class="q-mb-md">
          <q-btn color="primary" icon="add" label="Nuevo artículo" unelevated @click="openArticleDialog()" />
        </div>
        <q-table :rows="articles" :columns="articleColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-averageCost="props">
            <q-td :props="props" class="text-right">{{ formatMoney(props.row.averageCost) }}</q-td>
          </template>
          <template #body-cell-flags="props">
            <q-td :props="props">
              <q-badge v-if="props.row.withoutSupplierLot" color="blue-grey-6" class="q-mr-xs">Sin lote prov.</q-badge>
              <q-badge v-if="props.row.requiresExpiryDate" color="orange-8">Pide vencimiento</q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openArticleDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Tipos artículo -->
      <template v-else-if="tab === 'tipos'">
        <div class="q-mb-md">
          <q-btn color="primary" icon="add" label="Nuevo tipo" unelevated @click="openTypeDialog()" />
        </div>
        <q-table :rows="articleTypes" :columns="typeColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openTypeDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Variables -->
      <template v-else-if="tab === 'variables'">
        <q-table :rows="variables" :columns="variableColumns" row-key="key" flat bordered class="company-data-table">
          <template #body-cell-value="props">
            <q-td :props="props">{{ formatVariableValue(props.row) }}</q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn
                v-if="props.row.isEditable"
                flat dense round size="sm" icon="edit" color="primary"
                @click="openVariableDialog(props.row)"
              >
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>
    </div>

    <!-- Bodega -->
    <CompanyFormDialog v-model="warehouseDialog" :title="warehouseForm.id ? 'Editar bodega' : 'Nueva bodega'" icon="warehouse">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4">
          <q-input v-model="warehouseForm.code" label="Código *" outlined dense :readonly="!!warehouseForm.id" />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="warehouseForm.documentPrefix" label="Prefijo consecutivos *" outlined dense hint="Ej. BOD1" />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="warehouseForm.name" label="Nombre *" outlined dense />
        </div>
        <div class="col-12">
          <q-input v-model="warehouseForm.address" label="Dirección" outlined dense />
        </div>
        <div class="col-12 col-md-6">
          <q-toggle v-model="warehouseForm.isDefault" label="Bodega principal" />
        </div>
        <div v-if="warehouseForm.id" class="col-12 col-md-6">
          <q-toggle v-model="warehouseForm.isActive" label="Activa" />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveWarehouse" />
      </template>
    </CompanyFormDialog>

    <!-- Artículo -->
    <CompanyFormDialog v-model="articleDialog" :title="articleForm.id ? 'Editar artículo' : 'Nuevo artículo'" icon="category" wide>
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-3">
          <q-input v-model="articleForm.code" label="Código" outlined dense hint="Vacío = automático" />
        </div>
        <div class="col-12 col-md-9">
          <q-input v-model="articleForm.name" label="Nombre *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="articleForm.articleTypeId"
            :options="articleTypeOptions"
            label="Tipo"
            outlined dense emit-value map-options clearable
          />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="articleForm.unitOfMeasure" label="Unidad" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="articleForm.barcode" label="Código barras" outlined dense />
        </div>
        <div class="col-12">
          <q-input v-model="articleForm.description" label="Descripción" outlined dense type="textarea" autogrow />
        </div>
        <div class="col-12 col-md-4">
          <q-toggle v-model="articleForm.withoutSupplierLot" label="Sin lote proveedor (usa lote interno)" />
        </div>
        <div class="col-12 col-md-4">
          <q-toggle v-model="articleForm.requiresExpiryDate" label="Solicitar fecha vencimiento al ingresar" />
        </div>
        <div class="col-12 col-md-4">
          <q-input
            v-model.number="articleForm.defaultExpiryDays"
            type="number"
            label="Días vencimiento por defecto"
            outlined dense
            hint="730 = 2 años si no pide fecha"
          />
        </div>
        <div v-if="articleForm.id" class="col-12 col-md-4">
          <q-input :model-value="formatMoney(articleForm.averageCost)" label="Costo promedio" outlined dense readonly />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveArticle" />
      </template>
    </CompanyFormDialog>

    <!-- Tipo -->
    <CompanyFormDialog v-model="typeDialog" :title="typeForm.id ? 'Editar tipo' : 'Nuevo tipo'" icon="label">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4">
          <q-input v-model="typeForm.code" label="Código *" outlined dense :readonly="!!typeForm.id" />
        </div>
        <div class="col-12 col-md-8">
          <q-input v-model="typeForm.name" label="Nombre *" outlined dense />
        </div>
        <div class="col-12">
          <q-input v-model="typeForm.description" label="Descripción" outlined dense />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveType" />
      </template>
    </CompanyFormDialog>

    <!-- Variable -->
    <CompanyFormDialog v-model="variableDialog" title="Editar variable" icon="tune">
      <p class="text-caption text-grey-7 q-mb-md">{{ variableForm.description }}</p>
      <q-select
        v-if="variableForm.key === 'inventory.valuation_method'"
        v-model="variableForm.value"
        :options="valuationOptions"
        label="Método de valorización"
        outlined dense emit-value map-options
      />
      <q-select
        v-else-if="isMovementTypeVariable(variableForm.key)"
        v-model="variableForm.value"
        :options="movementTypeSelectOptions"
        :label="variableForm.label"
        outlined dense emit-value map-options
      />
      <q-input v-else v-model="variableForm.value" :label="variableForm.label" outlined dense />
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveVariable" />
      </template>
    </CompanyFormDialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'

const $q = useQuasar()
const validTabs = ['bodegas', 'articulos', 'tipos', 'variables']
const tab = useCompanyPageTab(validTabs, 'bodegas')

const pageMetaMap = {
  bodegas: { title: 'Bodegas', icon: 'warehouse' },
  articulos: { title: 'Artículos', icon: 'category' },
  tipos: { title: 'Tipos de artículo', icon: 'label' },
  variables: { title: 'Variables inventario', icon: 'tune' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.bodegas)

const saving = ref(false)
const warehouses = ref([])
const articles = ref([])
const articleTypes = ref([])
const variables = ref([])
const movementTypes = ref([])

const MOVEMENT_TYPE_VAR_KEYS = [
  'inventory.movement.transfer_out_code',
  'inventory.movement.transfer_in_code',
  'inventory.movement.sale_out_code',
]

const warehouseDialog = ref(false)
const articleDialog = ref(false)
const typeDialog = ref(false)
const variableDialog = ref(false)

const warehouseForm = reactive({ id: null, code: '', name: '', documentPrefix: '', address: '', isDefault: false, isActive: true })
const articleForm = reactive({
  id: null, code: '', name: '', description: '', articleTypeId: null, unitOfMeasure: 'UND',
  withoutSupplierLot: false, requiresExpiryDate: false, defaultExpiryDays: 730, barcode: '', averageCost: 0,
})
const typeForm = reactive({ id: null, code: '', name: '', description: '' })
const variableForm = reactive({ key: '', label: '', description: '', value: '' })

const valuationOptions = [
  { label: 'Costo promedio del artículo', value: 'average' },
  { label: 'Precio de compra en existencia', value: 'purchase' },
]

const articleTypeOptions = computed(() =>
  articleTypes.value.filter((t) => t.isActive).map((t) => ({ label: `${t.code} — ${t.name}`, value: t.id }))
)

const movementTypeSelectOptions = computed(() =>
  movementTypes.value
    .filter((t) => t.isActive)
    .map((t) => ({ label: `${t.code} — ${t.name}`, value: t.code }))
)

function isMovementTypeVariable(key) {
  return MOVEMENT_TYPE_VAR_KEYS.includes(key)
}

function formatVariableValue(row) {
  if (isMovementTypeVariable(row.key)) {
    const mt = movementTypes.value.find((t) => t.code === row.value)
    return mt ? `${mt.code} — ${mt.name}` : row.value
  }
  if (row.key === 'inventory.valuation_method') {
    return valuationOptions.find((o) => o.value === row.value)?.label || row.value
  }
  return row.value
}

const warehouseColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  { name: 'documentPrefix', label: 'Prefijo', field: 'documentPrefix', align: 'left' },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'isDefault', label: 'Principal', field: 'isDefault', align: 'center' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center' },
]

const articleColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'unitOfMeasure', label: 'Und.', field: 'unitOfMeasure', align: 'left' },
  { name: 'averageCost', label: 'Costo prom.', field: 'averageCost', align: 'right' },
  { name: 'flags', label: 'Config.', field: 'flags', align: 'left' },
]

const typeColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left' },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left' },
]

const variableColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'label', label: 'Variable', field: 'label', align: 'left' },
  { name: 'value', label: 'Valor', field: 'value', align: 'left' },
]

function formatMoney(v) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0)
}

async function loadAll() {
  const [wh, art, types, vars, movTypes] = await Promise.all([
    api.inventario.warehouses(),
    api.inventario.articles(),
    api.inventario.articleTypes(),
    api.inventario.settings(),
    api.inventario.movementTypes(),
  ])
  warehouses.value = wh
  articles.value = art
  articleTypes.value = types
  variables.value = vars
  movementTypes.value = movTypes
}

function openWarehouseDialog(row = null) {
  Object.assign(warehouseForm, row ? {
    id: row.id, code: row.code, name: row.name, documentPrefix: row.documentPrefix,
    address: row.address || '', isDefault: row.isDefault, isActive: row.isActive,
  } : { id: null, code: '', name: '', documentPrefix: '', address: '', isDefault: false, isActive: true })
  warehouseDialog.value = true
}

async function saveWarehouse() {
  saving.value = true
  try {
    const payload = {
      code: warehouseForm.code, name: warehouseForm.name, documentPrefix: warehouseForm.documentPrefix,
      address: warehouseForm.address, isDefault: warehouseForm.isDefault, isActive: warehouseForm.isActive,
    }
    if (warehouseForm.id) await api.inventario.updateWarehouse(warehouseForm.id, payload)
    else await api.inventario.createWarehouse(payload)
    warehouseDialog.value = false
    warehouses.value = await api.inventario.warehouses()
    $q.notify({ type: 'positive', message: 'Bodega guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openArticleDialog(row = null) {
  Object.assign(articleForm, row ? {
    id: row.id, code: row.code, name: row.name, description: row.description || '',
    articleTypeId: row.articleTypeId, unitOfMeasure: row.unitOfMeasure,
    withoutSupplierLot: row.withoutSupplierLot, requiresExpiryDate: row.requiresExpiryDate,
    defaultExpiryDays: row.defaultExpiryDays, barcode: row.barcode || '', averageCost: row.averageCost,
  } : {
    id: null, code: '', name: '', description: '', articleTypeId: null, unitOfMeasure: 'UND',
    withoutSupplierLot: false, requiresExpiryDate: false, defaultExpiryDays: 730, barcode: '', averageCost: 0,
  })
  articleDialog.value = true
}

async function saveArticle() {
  saving.value = true
  try {
    const payload = {
      code: articleForm.code || undefined, name: articleForm.name, description: articleForm.description,
      articleTypeId: articleForm.articleTypeId, unitOfMeasure: articleForm.unitOfMeasure,
      withoutSupplierLot: articleForm.withoutSupplierLot, requiresExpiryDate: articleForm.requiresExpiryDate,
      defaultExpiryDays: articleForm.defaultExpiryDays, barcode: articleForm.barcode,
    }
    if (articleForm.id) await api.inventario.updateArticle(articleForm.id, payload)
    else await api.inventario.createArticle(payload)
    articleDialog.value = false
    articles.value = await api.inventario.articles()
    $q.notify({ type: 'positive', message: 'Artículo guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openTypeDialog(row = null) {
  Object.assign(typeForm, row ? { id: row.id, code: row.code, name: row.name, description: row.description || '' }
    : { id: null, code: '', name: '', description: '' })
  typeDialog.value = true
}

async function saveType() {
  saving.value = true
  try {
    if (typeForm.id) await api.inventario.updateArticleType(typeForm.id, { name: typeForm.name, description: typeForm.description })
    else await api.inventario.createArticleType({ code: typeForm.code, name: typeForm.name, description: typeForm.description })
    typeDialog.value = false
    articleTypes.value = await api.inventario.articleTypes()
    $q.notify({ type: 'positive', message: 'Tipo guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openVariableDialog(row) {
  Object.assign(variableForm, { key: row.key, label: row.label, description: row.description, value: row.value })
  variableDialog.value = true
}

async function saveVariable() {
  saving.value = true
  try {
    await api.inventario.updateSetting(variableForm.key, variableForm.value)
    variableDialog.value = false
    variables.value = await api.inventario.settings()
    $q.notify({ type: 'positive', message: 'Variable actualizada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

onMounted(loadAll)
</script>
