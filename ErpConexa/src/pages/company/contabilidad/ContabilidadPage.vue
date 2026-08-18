<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" :subtitle="pageMeta.subtitle" />

    <div class="company-page-card">
      <template v-if="tab === 'movimientos'">
        <div class="row q-col-gutter-md q-mb-md items-end">
          <div class="col-12 col-md-3">
            <q-select
              v-model="filterYearMonth"
              :options="periodOptions"
              label="Periodo"
              outlined dense emit-value map-options
            />
          </div>
          <div class="col-12 col-md-3">
            <q-select
              v-model="filterStatus"
              :options="statusFilterOptions"
              label="Estado"
              outlined dense emit-value map-options clearable
            />
          </div>
          <div class="col-auto">
            <q-btn color="primary" icon="add" label="Nuevo comprobante" unelevated @click="openEntryDialog()" />
          </div>
        </div>

        <q-table :rows="journalEntries" :columns="entryColumns" row-key="id" flat bordered class="company-data-table" :loading="loading">
          <template #body-cell-accountingDate="props">
            <q-td :props="props">{{ formatDate(props.row.accountingDate) }}</q-td>
          </template>
          <template #body-cell-totalDebit="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.totalDebit) }}</q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="entryStatusColor(props.row.status)">{{ entryStatusLabel(props.row.status) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="visibility" color="primary" @click="viewEntry(props.row)">
                <q-tooltip>Ver</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status === 'borrador'"
                flat dense round size="sm" icon="edit" color="primary"
                @click="editEntry(props.row)"
              >
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status === 'borrador'"
                flat dense round size="sm" icon="check_circle" color="positive"
                @click="postEntry(props.row)"
              >
                <q-tooltip>Contabilizar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status !== 'anulado'"
                flat dense round size="sm" icon="block" color="negative"
                @click="voidEntry(props.row)"
              >
                <q-tooltip>Anular</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'cierre'">
        <q-banner dense rounded class="bg-blue-1 text-blue-10 q-mb-md">
          El cierre genera saldos de mes (cuenta, tercero y factura) y bloquea el periodo.
        </q-banner>
        <q-table :rows="periods" :columns="closePeriodColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-yearMonth="props">
            <q-td :props="props">{{ formatYearMonth(props.row.yearMonth) }}</q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="props.row.status === 'abierto' ? 'positive' : 'grey-7'">
                {{ props.row.status === 'abierto' ? 'Abierto' : 'Cerrado' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                v-if="props.row.status === 'abierto'"
                color="orange-9"
                icon="event_busy"
                label="Cerrar mes"
                unelevated dense
                :loading="closingPeriodId === props.row.id"
                @click="closePeriod(props.row)"
              />
            </q-td>
          </template>
        </q-table>
      </template>
    </div>

    <CompanyFormDialog
      v-model="entryDialog"
      :title="entryForm.id ? 'Editar comprobante' : 'Nuevo comprobante'"
      icon="edit_note"
      wide
      sales-document
    >
      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-4">
          <q-select
            v-model="entryForm.voucherTypeId"
            :options="voucherTypeOptions"
            label="Comprobante *"
            outlined dense emit-value map-options
            :readonly="!!entryForm.id"
          />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="entryForm.accountingDate" type="date" label="Fecha contable *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="entryForm.description" label="Detalle" outlined dense />
        </div>
      </div>

      <div class="text-subtitle2 q-mb-sm">Líneas del movimiento</div>
      <div v-for="(line, idx) in entryForm.lines" :key="idx" class="journal-line-row q-mb-md q-pa-md">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-md-3">
            <q-select
              v-model="line.accountId"
              :options="detailAccountOptions"
              label="Cuenta *"
              outlined dense emit-value map-options use-input input-debounce="200"
              @filter="filterAccounts"
            />
          </div>
          <div class="col-6 col-md-2">
            <q-select
              v-model="line.lineType"
              :options="lineTypeOptions"
              label="Tipo *"
              outlined dense emit-value map-options
            />
          </div>
          <div class="col-6 col-md-2">
            <q-input v-model.number="line.amount" type="number" label="Valor *" outlined dense />
          </div>
          <div class="col-12 col-md-3">
            <q-select
              v-model="line.thirdPartyId"
              :options="clientOptions"
              label="Tercero"
              outlined dense emit-value map-options clearable
            />
          </div>
          <div class="col-12 col-md-2">
            <q-btn flat round icon="delete" color="negative" @click="removeLine(idx)" />
          </div>
          <div class="col-12 col-md-3">
            <q-select
              v-model="line.costCenterId"
              :options="costCenterOptions"
              label="Centro costo"
              outlined dense emit-value map-options clearable
            />
          </div>
          <div class="col-12 col-md-3">
            <q-input v-model="line.invoiceNumber" label="N. factura" outlined dense />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="line.description" label="Detalle línea" outlined dense />
          </div>
        </div>
      </div>

      <q-btn flat icon="add" label="Agregar línea" color="primary" @click="addLine" />

      <div class="sales-doc-summary q-mt-md">
        <div class="sales-doc-summary__box">
          <div class="sales-doc-summary__row">
            <span>Total débitos</span>
            <span>${{ formatMoney(lineTotals.debit) }}</span>
          </div>
          <div class="sales-doc-summary__row">
            <span>Total créditos</span>
            <span>${{ formatMoney(lineTotals.credit) }}</span>
          </div>
          <div class="sales-doc-summary__row sales-doc-summary__row--total">
            <span>Diferencia</span>
            <span :class="lineTotals.diff === 0 ? 'text-positive' : 'text-negative'">
              ${{ formatMoney(lineTotals.diff) }}
            </span>
          </div>
        </div>
      </div>

      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="grey-8" icon="save" label="Guardar borrador" :loading="saving" unelevated @click="saveEntry(false)" />
        <q-btn color="primary" icon="check_circle" label="Contabilizar" :loading="saving" unelevated @click="saveEntry(true)" />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog v-model="viewDialog" title="Comprobante contable" icon="visibility" wide sales-document>
      <template v-if="selectedEntry">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-3">
            <div class="text-caption text-grey-7">Nro. comprobante</div>
            <div>{{ selectedEntry.voucherNumber }}</div>
          </div>
          <div class="col-12 col-md-3">
            <div class="text-caption text-grey-7">Referencia</div>
            <div>{{ selectedEntry.fullReference }}</div>
          </div>
          <div class="col-12 col-md-3">
            <div class="text-caption text-grey-7">Fecha</div>
            <div>{{ formatDate(selectedEntry.accountingDate) }}</div>
          </div>
          <div class="col-12 col-md-3">
            <div class="text-caption text-grey-7">Estado</div>
            <q-badge :color="entryStatusColor(selectedEntry.status)">{{ entryStatusLabel(selectedEntry.status) }}</q-badge>
          </div>
        </div>
        <q-markup-table flat bordered dense>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Tercero</th>
              <th class="text-center">Tipo</th>
              <th class="text-right">Valor</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in selectedEntry.lines" :key="line.id">
              <td>{{ line.accountCode }} — {{ line.accountName }}</td>
              <td>{{ line.thirdPartyName || '—' }}</td>
              <td class="text-center">{{ line.lineType === 'db' ? 'DB' : 'CR' }}</td>
              <td class="text-right">${{ formatMoney(line.amount) }}</td>
              <td>{{ line.description || '—' }}</td>
            </tr>
          </tbody>
        </q-markup-table>
      </template>
      <template #actions>
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
      </template>
    </CompanyFormDialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'
import { formatDate } from 'src/utils/date-format.js'

const $q = useQuasar()
const validTabs = ['movimientos', 'cierre']
const tab = useCompanyPageTab(validTabs, 'movimientos')

const pageMetaMap = {
  movimientos: {
    title: 'Movimiento diario',
    icon: 'edit_note',
    subtitle: 'Registro de comprobantes contables (débitos y créditos).',
  },
  cierre: {
    title: 'Cierre de mes',
    icon: 'event_busy',
    subtitle: 'Cierre de periodos y generación de saldos.',
  },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.movimientos)

const loading = ref(false)
const saving = ref(false)
const closingPeriodId = ref(null)
const journalEntries = ref([])
const periods = ref([])
const accounts = ref([])
const voucherTypes = ref([])
const costCenters = ref([])
const clients = ref([])

const filterYearMonth = ref(null)
const filterStatus = ref(null)

const entryDialog = ref(false)
const viewDialog = ref(false)
const selectedEntry = ref(null)

const emptyLine = () => ({
  accountId: null,
  lineType: 'db',
  amount: 0,
  thirdPartyId: null,
  costCenterId: null,
  invoiceNumber: '',
  reference: '',
  taxBase: 0,
  taxAmount: 0,
  description: '',
})

const entryForm = reactive({
  id: null,
  voucherTypeId: null,
  accountingDate: new Date().toISOString().slice(0, 10),
  description: '',
  lines: [emptyLine(), emptyLine()],
})

const accountFilterOptions = ref([])

const periodOptions = computed(() =>
  periods.value.map((p) => ({
    label: formatYearMonth(p.yearMonth),
    value: p.yearMonth,
  }))
)

const voucherTypeOptions = computed(() =>
  voucherTypes.value.filter((v) => v.status === 'activo').map((v) => ({ label: `${v.code} — ${v.name}`, value: v.id }))
)

const detailAccountOptions = computed(() => accountFilterOptions.value)

const costCenterOptions = computed(() =>
  costCenters.value.filter((c) => c.status === 'activo').map((c) => ({ label: `${c.code} — ${c.name}`, value: c.id }))
)

const clientOptions = computed(() =>
  clients.value.map((c) => ({ label: `${c.fullName} (${c.documentNumber || '—'})`, value: c.id }))
)

const lineTypeOptions = [
  { label: 'Débito', value: 'db' },
  { label: 'Crédito', value: 'cr' },
]

const statusFilterOptions = [
  { label: 'Borrador', value: 'borrador' },
  { label: 'Contabilizado', value: 'contabilizado' },
  { label: 'Anulado', value: 'anulado' },
]

const entryColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 120px' },
  { name: 'voucherNumber', label: 'Nro.', field: 'voucherNumber', align: 'left', sortable: true },
  { name: 'fullReference', label: 'Referencia', field: 'fullReference', align: 'left' },
  { name: 'accountingDate', label: 'Fecha', field: 'accountingDate', align: 'left', sortable: true },
  { name: 'voucherTypeCode', label: 'Tipo', field: 'voucherTypeCode', align: 'left' },
  { name: 'description', label: 'Detalle', field: 'description', align: 'left' },
  { name: 'totalDebit', label: 'Total', field: 'totalDebit', align: 'right' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

const closePeriodColumns = [
  { name: 'yearMonth', label: 'Periodo', field: 'yearMonth', align: 'left' },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const lineTotals = computed(() => {
  let debit = 0
  let credit = 0
  for (const line of entryForm.lines) {
    const amt = Number(line.amount) || 0
    if (line.lineType === 'db') debit += amt
    else credit += amt
  }
  return { debit, credit, diff: Math.round((debit - credit) * 100) / 100 }
})

function formatYearMonth(ym) {
  const y = Math.floor(Number(ym) / 100)
  const m = Number(ym) % 100
  return `${y}-${String(m).padStart(2, '0')}`
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function entryStatusColor(s) {
  return { borrador: 'grey', contabilizado: 'positive', anulado: 'negative' }[s] || 'grey'
}

function entryStatusLabel(s) {
  return { borrador: 'Borrador', contabilizado: 'Contabilizado', anulado: 'Anulado' }[s] || s
}

function filterAccounts(val, update) {
  update(() => {
    const needle = (val || '').toLowerCase()
    accountFilterOptions.value = accounts.value
      .filter((a) => a.accountType === 'detalle' && a.status === 'activo')
      .filter((a) => !needle || `${a.code} ${a.name}`.toLowerCase().includes(needle))
      .map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id }))
  })
}

function addLine() {
  entryForm.lines.push(emptyLine())
}

function removeLine(idx) {
  if (entryForm.lines.length <= 2) {
    $q.notify({ type: 'warning', message: 'Mínimo dos líneas' })
    return
  }
  entryForm.lines.splice(idx, 1)
}

function resetEntryForm() {
  Object.assign(entryForm, {
    id: null,
    voucherTypeId: null,
    accountingDate: new Date().toISOString().slice(0, 10),
    description: '',
    lines: [emptyLine(), emptyLine()],
  })
}

function openEntryDialog() {
  resetEntryForm()
  filterAccounts('', (fn) => fn())
  entryDialog.value = true
}

async function loadCatalogs() {
  const [acc, vt, cc, pp, cl] = await Promise.all([
    api.contabilidad.accounts(),
    api.contabilidad.voucherTypes(),
    api.contabilidad.costCenters(),
    api.contabilidad.periods(),
    api.contabilidad.catalogClients(),
  ])
  accounts.value = acc
  voucherTypes.value = vt
  costCenters.value = cc
  periods.value = pp
  clients.value = cl
  if (!filterYearMonth.value && pp.length) {
    const open = pp.find((p) => p.status === 'abierto') || pp[0]
    filterYearMonth.value = open.yearMonth
  }
  filterAccounts('', (fn) => fn())
}

async function loadEntries() {
  loading.value = true
  try {
    const params = {}
    if (filterYearMonth.value) params.yearMonth = filterYearMonth.value
    if (filterStatus.value) params.status = filterStatus.value
    journalEntries.value = await api.contabilidad.journalEntries(params)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

async function viewEntry(row) {
  selectedEntry.value = await api.contabilidad.journalEntry(row.id)
  viewDialog.value = true
}

async function editEntry(row) {
  const entry = await api.contabilidad.journalEntry(row.id)
  Object.assign(entryForm, {
    id: entry.id,
    voucherTypeId: entry.voucherTypeId,
    accountingDate: entry.accountingDate?.slice?.(0, 10) || entry.accountingDate,
    description: entry.description || '',
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      lineType: l.lineType,
      amount: l.amount,
      thirdPartyId: l.thirdPartyId,
      costCenterId: l.costCenterId,
      invoiceNumber: l.invoiceNumber || '',
      reference: l.reference || '',
      taxBase: l.taxBase,
      taxAmount: l.taxAmount,
      description: l.description || '',
    })),
  })
  filterAccounts('', (fn) => fn())
  entryDialog.value = true
}

async function saveEntry(post) {
  if (!entryForm.voucherTypeId || !entryForm.accountingDate) {
    $q.notify({ type: 'warning', message: 'Comprobante y fecha son requeridos' })
    return
  }
  saving.value = true
  try {
    const payload = {
      voucherTypeId: entryForm.voucherTypeId,
      accountingDate: entryForm.accountingDate,
      description: entryForm.description,
      lines: entryForm.lines,
      post,
    }
    if (entryForm.id) {
      await api.contabilidad.updateJournalEntry(entryForm.id, payload)
      if (post) await api.contabilidad.postJournalEntry(entryForm.id)
    } else {
      await api.contabilidad.createJournalEntry({ ...payload, post })
    }
    entryDialog.value = false
    await loadEntries()
    $q.notify({ type: 'positive', message: post ? 'Comprobante contabilizado' : 'Borrador guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function postEntry(row) {
  try {
    await api.contabilidad.postJournalEntry(row.id)
    await loadEntries()
    $q.notify({ type: 'positive', message: 'Comprobante contabilizado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function voidEntry(row) {
  $q.dialog({
    title: 'Anular comprobante',
    message: `¿Anular ${row.fullReference}?`,
    cancel: true,
  }).onOk(async () => {
    try {
      await api.contabilidad.voidJournalEntry(row.id)
      await loadEntries()
      $q.notify({ type: 'positive', message: 'Comprobante anulado' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

function closePeriod(row) {
  $q.dialog({
    title: 'Cerrar periodo',
    message: `¿Cerrar el periodo ${formatYearMonth(row.yearMonth)}? Se generarán saldos y no podrá registrar movimientos.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    closingPeriodId.value = row.id
    try {
      const result = await api.contabilidad.closePeriod(row.id)
      await loadCatalogs()
      $q.notify({ type: 'positive', message: result.message || 'Periodo cerrado' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      closingPeriodId.value = null
    }
  })
}

watch([filterYearMonth, filterStatus], () => {
  if (tab.value === 'movimientos') loadEntries()
})

watch(tab, (t) => {
  if (t === 'movimientos') loadEntries()
})

onMounted(async () => {
  try {
    await loadCatalogs()
    await loadEntries()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
})
</script>

<style scoped>
.journal-line-row {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: #fafafa;
}
</style>
