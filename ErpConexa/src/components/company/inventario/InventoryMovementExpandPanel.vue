<template>
  <div v-if="loading" class="row items-center q-gutter-sm text-grey-7">
    <q-spinner size="20px" color="primary" />
    <span>Cargando detalle…</span>
  </div>
  <div v-else-if="detail">
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-md-8">
        <div class="text-subtitle2 text-weight-medium">{{ detail.documentNumber }}</div>
        <div class="text-caption text-grey-7">
          {{ detail.movementTypeCode }} — {{ detail.movementTypeName }}
          · {{ detail.warehouseName }}
          · {{ formatDate(detail.movementDate) }}
          <span v-if="detail.thirdPartyName"> · {{ detail.thirdPartyName }}</span>
        </div>
        <div v-if="detail.supplierInvoiceNumber" class="text-caption text-grey-8 q-mt-xs">
          N. factura {{ detail.supplierInvoiceNumber }}
          · Generación {{ formatDate(detail.supplierInvoiceDate) }}
          · Vence {{ formatDate(detail.supplierInvoiceDueDate) }}
        </div>
        <div v-if="detail.fcxpNumber" class="text-caption text-grey-8">
          Cuenta por pagar {{ detail.fcxpNumber }}
        </div>
        <div v-if="!editable && detail.notes" class="text-caption q-mt-xs">{{ detail.notes }}</div>
      </div>
      <div class="col-12 col-md-4 text-md-right">
        <div class="text-h6">{{ formatMoney(editable ? editTotal : detail.totalValue) }}</div>
        <q-badge :color="statusColor" class="q-mt-xs">{{ statusLabel }}</q-badge>
      </div>
    </div>

    <template v-if="editable">
      <div
        class="sales-doc-lines sales-doc-lines--compact"
        :class="gridClass"
      >
        <div class="sales-doc-lines__head">
          <span>Artículo</span>
          <span v-if="!isEntry">Lote</span>
          <span>Cant.</span>
          <span v-if="isEntry">Costo</span>
          <span v-if="isEntry">Lote prov.</span>
          <span v-if="isEntry">Vence</span>
          <span v-if="isSale">Precio venta</span>
          <span class="text-right">Total</span>
          <span></span>
        </div>
        <div v-for="(line, idx) in editLines" :key="idx" class="sales-doc-lines__row">
          <div class="col-article">
            <q-select
              v-model="line.articleId"
              :options="articleOptionsFor(line, idx)"
              dense outlined emit-value map-options hide-bottom-space options-dense
              use-input input-debounce="200"
              @filter="(val, update) => filterArticles(val, update, idx)"
              @update:model-value="onArticleChange(line)"
            />
          </div>
          <div v-if="!isEntry">
            <q-select
              v-model="line.lotId"
              :options="lotOptions(line)"
              dense outlined emit-value map-options hide-bottom-space options-dense
              @update:model-value="onLotChange(line, idx)"
            />
          </div>
          <div>
            <q-input
              v-model.number="line.quantity"
              type="number"
              min="0"
              step="any"
              dense outlined hide-bottom-space
              :max="isEntry ? undefined : maxQuantity(line, idx)"
              @update:model-value="onQuantityChange(line, idx)"
            />
          </div>
          <div v-if="isEntry">
            <q-input v-model.number="line.unitCost" type="number" min="0" step="any" dense outlined hide-bottom-space />
          </div>
          <div v-if="isEntry">
            <q-input
              v-if="needsSupplierLot(line)"
              v-model="line.supplierLotNumber"
              dense outlined hide-bottom-space
            />
            <span v-else class="text-grey-5">—</span>
          </div>
          <div v-if="isEntry">
            <q-input
              v-if="needsExpiry(line)"
              v-model="line.expiryDate"
              type="date"
              dense outlined hide-bottom-space
            />
            <span v-else class="text-grey-5">—</span>
          </div>
          <div v-if="isSale">
            <q-input v-model.number="line.unitPrice" type="number" min="0" step="any" dense outlined hide-bottom-space />
          </div>
          <div class="sales-doc-lines__subtotal">{{ formatMoney(lineAmount(line)) }}</div>
          <div class="col-actions">
            <q-btn flat round dense icon="delete" color="negative" @click="removeLine(idx)" />
          </div>
        </div>
      </div>

      <div class="row q-gutter-sm q-mt-md">
        <q-btn flat dense icon="add" label="Agregar línea" color="primary" @click="addLine" />
        <q-space />
        <q-btn
          color="primary"
          icon="save"
          label="Guardar ítems"
          unelevated
          :loading="saving"
          @click="emitSave"
        />
      </div>
    </template>

    <q-markup-table v-else flat bordered dense class="company-data-table__expand-lines company-data-table__expand-lines--wide">
      <thead>
        <tr>
          <th>Artículo</th>
          <th>Lote</th>
          <th class="text-right">Cant.</th>
          <th class="text-right">{{ isSale ? 'Precio venta' : 'Costo' }}</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in detail.details || []" :key="line.id">
          <td>{{ line.articleCode }} — {{ line.articleName }}</td>
          <td>{{ line.internalLotNumber || line.supplierLotNumber || '—' }}</td>
          <td class="text-right">{{ line.quantity }}</td>
          <td class="text-right">{{ formatMoney(line.unitCost) }}</td>
          <td class="text-right">{{ formatMoney(line.totalCost) }}</td>
        </tr>
      </tbody>
    </q-markup-table>
  </div>
  <div v-else class="text-grey-7 text-caption">No se pudo cargar el detalle.</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { formatDate } from 'src/utils/date-format.js'

const props = defineProps({
  row: { type: Object, required: true },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  articles: { type: Array, default: () => [] },
  movementConfig: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['save'])
const $q = useQuasar()

const editLines = ref([])
const balances = ref([])
const filteredOptions = ref({})

const isEntry = computed(() => props.detail?.direction === 'entrada')
const isSale = computed(() => props.detail?.movementTypeCode === props.movementConfig?.saleOut)
const isPurchase = computed(() =>
  props.detail?.movementTypeCode === (props.movementConfig?.purchaseIn || '01')
)

const gridClass = computed(() => {
  if (isEntry.value) return 'inv-move-lines--entry'
  if (isSale.value) return 'inv-move-lines--sale'
  return 'inv-move-lines--exit'
})

const statusColor = computed(() => ({
  borrador: 'grey-7',
  confirmado: 'positive',
  anulado: 'negative',
}[props.row.status] || 'grey'))

const statusLabel = computed(() => ({
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  anulado: 'Anulado',
}[props.row.status] || props.row.status))

const editTotal = computed(() =>
  editLines.value.reduce((sum, line) => sum + lineAmount(line), 0)
)

const activeArticles = computed(() =>
  props.articles.filter((article) => article.isActive)
)

watch(
  () => [props.detail, props.editable],
  async () => {
    if (!props.detail) return
    editLines.value = (props.detail.details?.length ? props.detail.details : [emptyLine()]).map((line) => ({
      articleId: line.articleId,
      quantity: Number(line.quantity) || 1,
      unitCost: Number(line.unitCost) || 0,
      unitPrice: Number(line.unitCost) || 0,
      supplierLotNumber: line.supplierLotNumber || '',
      expiryDate: line.expiryDate ? String(line.expiryDate).slice(0, 10) : '',
      lotId: line.lotId || null,
    }))
    filteredOptions.value = {}
    if (props.editable && props.detail.direction !== 'entrada' && props.detail.warehouseId) {
      try {
        balances.value = await api.inventario.balances({ warehouseId: props.detail.warehouseId })
      } catch (e) {
        balances.value = []
        $q.notify({ type: 'negative', message: e.message })
      }
    } else {
      balances.value = []
    }
  },
  { immediate: true },
)

function emptyLine() {
  return {
    articleId: null,
    quantity: 1,
    unitCost: 0,
    unitPrice: 0,
    supplierLotNumber: '',
    expiryDate: '',
    lotId: null,
  }
}

function articleById(id) {
  return props.articles.find((article) => article.id === id)
}

function stockIds() {
  const ids = new Set()
  for (const balance of balances.value) {
    if (Number(balance.quantityOnHand) > 0) ids.add(balance.articleId)
  }
  return ids
}

function stockTotal(articleId) {
  return balances.value
    .filter((balance) => balance.articleId === articleId)
    .reduce((sum, balance) => sum + Number(balance.quantityOnHand), 0)
}

function buildArticleOptions() {
  if (isEntry.value) {
    return activeArticles.value.map((article) => ({
      label: `${article.code} — ${article.name}`,
      value: article.id,
    }))
  }
  const ids = stockIds()
  return activeArticles.value
    .filter((article) => ids.has(article.id))
    .map((article) => ({
      label: `${article.code} — ${article.name} (${stockTotal(article.id)} und.)`,
      value: article.id,
    }))
}

function articleOptionsFor(line, idx) {
  return filteredOptions.value[idx] ?? buildArticleOptions()
}

function filterArticles(val, update, idx) {
  update(() => {
    const needle = (val || '').toLowerCase()
    filteredOptions.value = {
      ...filteredOptions.value,
      [idx]: buildArticleOptions().filter((option) => option.label.toLowerCase().includes(needle)),
    }
  })
}

function needsSupplierLot(line) {
  const article = articleById(line.articleId)
  return Boolean(article && !article.withoutSupplierLot)
}

function needsExpiry(line) {
  return Boolean(articleById(line.articleId)?.requiresExpiryDate)
}

function lotOptions(line) {
  if (!line.articleId) return []
  return balances.value
    .filter((balance) => balance.articleId === line.articleId && Number(balance.quantityOnHand) > 0)
    .map((balance) => ({
      label: `${balance.internalLotNumber} (${balance.quantityOnHand} und.)`,
      value: balance.lotId,
    }))
}

function balanceFor(line) {
  if (!line.lotId) return null
  return balances.value.find((balance) =>
    balance.lotId === line.lotId && balance.articleId === line.articleId
  ) || null
}

function maxQuantity(line, lineIndex) {
  const balance = balanceFor(line)
  if (!balance) return undefined
  let available = Number(balance.quantityOnHand)
  editLines.value.forEach((other, idx) => {
    if (idx !== lineIndex && other.lotId === line.lotId) {
      available -= Number(other.quantity) || 0
    }
  })
  return Math.max(0, available)
}

function lineAmount(line) {
  const qty = Number(line.quantity) || 0
  if (isSale.value) return qty * (Number(line.unitPrice) || 0)
  if (!isEntry.value) {
    const balance = balanceFor(line)
    const cost = balance ? Number(balance.purchaseUnitCost) : Number(line.unitCost)
    return qty * (cost || 0)
  }
  return qty * (Number(line.unitCost) || 0)
}

function onArticleChange(line) {
  line.lotId = null
  if (isSale.value && !isEntry.value) {
    const article = articleById(line.articleId)
    if (article && !line.unitPrice) line.unitPrice = Number(article.averageCost) || 0
  }
}

function onLotChange(line, idx) {
  const max = maxQuantity(line, idx)
  if (max != null && Number(line.quantity) > max) line.quantity = max
}

function onQuantityChange(line, idx) {
  if (isEntry.value) return
  const max = maxQuantity(line, idx)
  if (max == null) return
  if (Number(line.quantity) > max) {
    line.quantity = max
    $q.notify({ type: 'warning', message: `Cantidad máxima disponible: ${max}` })
  }
}

function addLine() {
  editLines.value.push(emptyLine())
}

function removeLine(idx) {
  editLines.value.splice(idx, 1)
  if (!editLines.value.length) editLines.value.push(emptyLine())
}

function isoDate(value) {
  if (!value) return null
  return String(value).slice(0, 10)
}

function emitSave() {
  const lines = editLines.value.filter((line) => line.articleId)
  if (!lines.length) {
    $q.notify({ type: 'warning', message: 'Agregue al menos una línea' })
    return
  }
  for (const line of lines) {
    if (!Number(line.quantity) || Number(line.quantity) <= 0) {
      $q.notify({ type: 'warning', message: 'Indique cantidad mayor a cero en cada línea' })
      return
    }
    if (isEntry.value) {
      if (!Number(line.unitCost) || Number(line.unitCost) <= 0) {
        $q.notify({ type: 'warning', message: 'Indique costo de compra en cada línea' })
        return
      }
      if (needsSupplierLot(line) && !String(line.supplierLotNumber || '').trim()) {
        $q.notify({ type: 'warning', message: 'Indique el lote del proveedor' })
        return
      }
      if (needsExpiry(line) && !line.expiryDate) {
        $q.notify({ type: 'warning', message: 'Indique la fecha de vencimiento del lote' })
        return
      }
    } else {
      if (!line.lotId) {
        $q.notify({ type: 'warning', message: 'Seleccione el lote en cada línea de salida' })
        return
      }
      const max = maxQuantity(line, editLines.value.indexOf(line))
      if (max != null && Number(line.quantity) > max) {
        $q.notify({ type: 'warning', message: `Cantidad excede existencia (máx. ${max})` })
        return
      }
      if (isSale.value && (!Number(line.unitPrice) || Number(line.unitPrice) <= 0)) {
        $q.notify({ type: 'warning', message: 'Indique precio de venta en cada línea' })
        return
      }
    }
  }

  const detail = props.detail
  emit('save', {
    warehouseId: detail.warehouseId,
    targetWarehouseId: detail.targetWarehouseId,
    movementTypeId: detail.movementTypeId,
    movementDate: isoDate(detail.movementDate),
    referenceNumber: detail.referenceNumber,
    clientId: detail.clientId,
    supplierInvoiceNumber: isPurchase.value ? detail.supplierInvoiceNumber : null,
    supplierInvoiceDate: isPurchase.value ? isoDate(detail.supplierInvoiceDate) : null,
    supplierInvoiceDueDate: isPurchase.value ? isoDate(detail.supplierInvoiceDueDate) : null,
    notes: detail.notes,
    lines: lines.map((line) => ({
      articleId: line.articleId,
      quantity: line.quantity,
      lotId: line.lotId,
      unitCost: line.unitCost,
      unitPrice: line.unitPrice,
      supplierLotNumber: line.supplierLotNumber,
      expiryDate: line.expiryDate || null,
    })),
  })
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}
</script>
