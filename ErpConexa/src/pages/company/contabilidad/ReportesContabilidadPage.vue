<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <div class="row q-col-gutter-md q-mb-md items-end">
        <div class="col-12 col-md-3">
          <q-select
            v-model="yearMonth"
            :options="periodOptions"
            label="Periodo *"
            outlined dense emit-value map-options
          />
        </div>
        <div v-if="tab === 'libros-auxiliares'" class="col-12 col-md-4">
          <q-select
            v-model="accountId"
            :options="accountOptions"
            label="Cuenta"
            outlined dense emit-value map-options clearable use-input
            @filter="filterAccounts"
          />
        </div>
        <div class="col-auto">
          <q-btn color="primary" icon="search" label="Consultar" unelevated :loading="loading" @click="loadReport" />
        </div>
      </div>

      <template v-if="tab === 'balance-prueba'">
        <q-table :rows="trialRows" :columns="trialColumns" row-key="accountCode" flat bordered class="company-data-table" :loading="loading">
          <template #body-cell-openingBalance="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.openingBalance) }}</q-td>
          </template>
          <template #body-cell-debit="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.debit) }}</q-td>
          </template>
          <template #body-cell-credit="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.credit) }}</q-td>
          </template>
          <template #body-cell-closingBalance="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.closingBalance) }}</q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'libros-auxiliares'">
        <q-table :rows="auxiliaryRows" :columns="auxiliaryColumns" row-key="rowKey" flat bordered class="company-data-table" :loading="loading">
          <template #body-cell-accountingDate="props">
            <q-td :props="props">{{ formatDate(props.row.accountingDate) }}</q-td>
          </template>
          <template #body-cell-amount="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.amount) }}</q-td>
          </template>
          <template #body-cell-lineType="props">
            <q-td :props="props" class="text-center">{{ props.row.lineType === 'db' ? 'DB' : 'CR' }}</q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'balance-general'">
        <q-table :rows="generalRows" :columns="generalColumns" row-key="accountCode" flat bordered class="company-data-table" :loading="loading">
          <template #body-cell-openingBalance="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.openingBalance) }}</q-td>
          </template>
          <template #body-cell-debit="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.debit) }}</q-td>
          </template>
          <template #body-cell-credit="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.credit) }}</q-td>
          </template>
          <template #body-cell-closingBalance="props">
            <q-td :props="props" class="text-right">${{ formatMoney(props.row.closingBalance) }}</q-td>
          </template>
        </q-table>
      </template>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'
import { formatDate } from 'src/utils/date-format.js'

const $q = useQuasar()
const validTabs = ['balance-prueba', 'libros-auxiliares', 'balance-general']
const tab = useCompanyPageTab(validTabs, 'balance-prueba')

const pageMetaMap = {
  'balance-prueba': { title: 'Balance de prueba', icon: 'table_chart' },
  'libros-auxiliares': { title: 'Libros auxiliares', icon: 'menu_book' },
  'balance-general': { title: 'Balance general', icon: 'account_balance' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap['balance-prueba'])

const loading = ref(false)
const yearMonth = ref(null)
const accountId = ref(null)
const periods = ref([])
const accounts = ref([])
const accountOptions = ref([])

const trialRows = ref([])
const auxiliaryRows = ref([])
const generalRows = ref([])

const periodOptions = computed(() =>
  periods.value.map((p) => ({
    label: `${formatYearMonth(p.yearMonth)} (${p.status === 'abierto' ? 'Abierto' : 'Cerrado'})`,
    value: p.yearMonth,
  }))
)

const trialColumns = [
  { name: 'accountCode', label: 'Cuenta', field: 'accountCode', align: 'left', sortable: true },
  { name: 'accountName', label: 'Nombre', field: 'accountName', align: 'left' },
  { name: 'openingBalance', label: 'Saldo inicial', field: 'openingBalance', align: 'right' },
  { name: 'debit', label: 'Débitos', field: 'debit', align: 'right' },
  { name: 'credit', label: 'Créditos', field: 'credit', align: 'right' },
  { name: 'closingBalance', label: 'Saldo final', field: 'closingBalance', align: 'right' },
]

const generalColumns = trialColumns

const auxiliaryColumns = [
  { name: 'accountingDate', label: 'Fecha', field: 'accountingDate', align: 'left' },
  { name: 'voucherTypeCode', label: 'Tipo', field: 'voucherTypeCode', align: 'left' },
  { name: 'voucherNumber', label: 'Nro.', field: 'voucherNumber', align: 'left' },
  { name: 'accountCode', label: 'Cuenta', field: 'accountCode', align: 'left' },
  { name: 'thirdPartyName', label: 'Tercero', field: 'thirdPartyName', align: 'left' },
  { name: 'lineType', label: 'DB/CR', field: 'lineType', align: 'center' },
  { name: 'amount', label: 'Valor', field: 'amount', align: 'right' },
  { name: 'description', label: 'Detalle', field: 'description', align: 'left' },
]

function formatYearMonth(ym) {
  const y = Math.floor(Number(ym) / 100)
  const m = Number(ym) % 100
  return `${y}-${String(m).padStart(2, '0')}`
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function filterAccounts(val, update) {
  update(() => {
    const needle = (val || '').toLowerCase()
    accountOptions.value = accounts.value
      .filter((a) => a.accountType === 'detalle')
      .filter((a) => !needle || `${a.code} ${a.name}`.toLowerCase().includes(needle))
      .map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id }))
  })
}

async function loadReport() {
  if (!yearMonth.value) {
    $q.notify({ type: 'warning', message: 'Seleccione un periodo' })
    return
  }
  loading.value = true
  try {
    if (tab.value === 'balance-prueba') {
      const res = await api.contabilidad.trialBalance(yearMonth.value)
      trialRows.value = res.rows || []
    } else if (tab.value === 'libros-auxiliares') {
      const res = await api.contabilidad.auxiliaryLedger(yearMonth.value, { accountId: accountId.value })
      auxiliaryRows.value = (res.rows || []).map((r, i) => ({ ...r, rowKey: `${r.voucherNumber}-${i}` }))
    } else {
      const res = await api.contabilidad.generalBalance(yearMonth.value)
      generalRows.value = res.rows || []
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

watch(tab, () => {
  trialRows.value = []
  auxiliaryRows.value = []
  generalRows.value = []
})

onMounted(async () => {
  try {
    const [pp, acc] = await Promise.all([
      api.contabilidad.periods(),
      api.contabilidad.accounts(),
    ])
    periods.value = pp
    accounts.value = acc
    const open = pp.find((p) => p.status === 'abierto') || pp[0]
    if (open) yearMonth.value = open.yearMonth
    filterAccounts('', (fn) => fn())
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
})
</script>
