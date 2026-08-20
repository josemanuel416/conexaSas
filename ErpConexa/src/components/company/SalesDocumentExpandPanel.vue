<template>
  <div v-if="loading" class="row items-center q-gutter-sm text-grey-7">
    <q-spinner size="20px" color="primary" />
    <span>Cargando detalle…</span>
  </div>
  <div v-else-if="detail">
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-md-8">
        <div class="text-subtitle2 text-weight-medium">{{ detail.internalNumber }}</div>
        <div class="text-caption text-grey-7">
          {{ detail.clientName }} · {{ formatDate(detail.issueDate) }}
          <span v-if="detail.dueDate"> · Válida hasta {{ formatDate(detail.dueDate) }}</span>
        </div>
        <div v-if="!editable && detail.notes" class="text-caption q-mt-xs">{{ detail.notes }}</div>
      </div>
      <div class="col-12 col-md-4 text-md-right">
        <div class="text-h6">${{ formatMoney(detail.total) }}</div>
        <q-badge :color="statusColor" class="q-mt-xs">{{ statusLabel }}</q-badge>
      </div>
    </div>

    <template v-if="editable">
      <SalesDocumentLinesEditor
        compact
        :lines="editLines"
        :document-kind="detail.documentKind"
        :line-item-mode="editLineItemMode"
        :services="services"
        :articles="articles"
        @update:lines="editLines = $event"
        @update:line-item-mode="onLineItemModeChange"
      />

      <div class="sales-doc-summary q-mt-md">
        <div class="sales-doc-summary__box">
          <div class="sales-doc-summary__row">
            <span>Subtotal</span>
            <span>${{ formatMoney(editTotals.base) }}</span>
          </div>
          <div class="sales-doc-summary__row">
            <span>IVA</span>
            <span>${{ formatMoney(editTotals.tax) }}</span>
          </div>
          <div class="sales-doc-summary__row sales-doc-summary__row--total">
            <span>Total</span>
            <span>${{ formatMoney(editTotals.total) }}</span>
          </div>
        </div>
      </div>

      <div class="row q-gutter-sm q-mt-md">
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

    <template v-else>
      <q-markup-table flat bordered dense class="company-data-table__expand-lines company-data-table__expand-lines--wide">
        <thead>
          <tr>
            <th>#</th>
            <th v-if="showReadonlyTypeCol">Tipo</th>
            <th>Código</th>
            <th>Descripción</th>
            <th class="text-right">Cant.</th>
            <th class="text-right">Precio</th>
            <th class="text-right">IVA %</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in detail.details || []" :key="line.id || line.lineNumber">
            <td>{{ line.lineNumber }}</td>
            <td v-if="showReadonlyTypeCol">{{ line.serviceId ? 'Servicio' : 'Artículo' }}</td>
            <td>{{ line.itemCode || '—' }}</td>
            <td>{{ line.description }}</td>
            <td class="text-right">{{ line.quantity }}</td>
            <td class="text-right">${{ formatMoney(line.unitPrice) }}</td>
            <td class="text-right">{{ line.taxRate }}%</td>
            <td class="text-right">${{ formatMoney(line.lineTotal) }}</td>
          </tr>
        </tbody>
      </q-markup-table>
      <div v-if="detail.notes" class="text-caption text-grey-8 q-mt-sm">{{ detail.notes }}</div>
    </template>
  </div>
  <div v-else class="text-grey-7 text-caption">No se pudo cargar el detalle.</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import SalesDocumentLinesEditor from 'src/components/company/SalesDocumentLinesEditor.vue'
import { formatDate } from 'src/utils/date-format.js'
import {
  inferLineItemMode,
  mapDetailToLine,
  calcDocumentTotals,
} from 'src/utils/sales-document-lines.js'

const props = defineProps({
  row: { type: Object, required: true },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  services: { type: Array, default: () => [] },
  articles: { type: Array, default: () => [] },
})

const emit = defineEmits(['save'])

const editLines = ref([])
const editLineItemMode = ref('servicios')

const editTotals = computed(() => calcDocumentTotals(editLines.value))

const statusColor = computed(() => ({
  borrador: 'grey',
  emitida: 'blue',
  convertida: 'positive',
  anulada: 'negative',
}[props.row.status] || 'grey'))

const statusLabel = computed(() => {
  if (props.row.status === 'emitida' && props.row.documentKind === 'cotizacion') return 'Confirmada'
  return {
    borrador: 'Borrador',
    emitida: 'Emitida',
    convertida: 'Facturada',
    anulada: 'Anulada',
  }[props.row.status] || props.row.status
})

const showReadonlyTypeCol = computed(() => {
  const details = props.detail?.details || []
  const hasService = details.some((line) => line.serviceId)
  const hasArticle = details.some((line) => !line.serviceId)
  return hasService && hasArticle
})

watch(
  () => [props.detail, props.editable],
  () => {
    if (!props.detail || !props.editable) return
    editLines.value = (props.detail.details || []).map((d) =>
      mapDetailToLine(d, props.articles)
    )
    editLineItemMode.value = props.detail.documentKind === 'cotizacion'
      ? inferLineItemMode(props.detail.details)
      : 'servicios'
  },
  { immediate: true }
)

function onLineItemModeChange(mode) {
  editLineItemMode.value = mode
  if (props.detail?.documentKind !== 'cotizacion') return
  const lineType = mode === 'articulos' ? 'article' : 'service'
  editLines.value = [{
    lineType,
    serviceId: null,
    articleId: null,
    itemCode: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxRate: 19,
  }]
}

function emitSave() {
  emit('save', {
    lines: editLines.value,
    lineItemMode: editLineItemMode.value,
  })
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}
</script>
