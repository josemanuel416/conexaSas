<template>
  <div v-if="loading" class="row items-center q-gutter-sm text-grey-7">
    <q-spinner size="20px" color="primary" />
    <span>Cargando detalle…</span>
  </div>
  <div v-else-if="detail">
    <div class="row q-col-gutter-md q-mb-sm">
      <div class="col-12 col-md-8">
        <div class="text-subtitle2 text-weight-medium">
          {{ detail.fullNumber || row.fullNumber }}
          <span v-if="detail.internalNumber && detail.internalNumber !== detail.fullNumber" class="text-caption text-grey-7 q-ml-sm">
            CNS {{ detail.internalNumber }}
          </span>
        </div>
        <div class="text-caption text-grey-7">
          {{ detail.clientName }} · {{ formatDate(detail.issueDate) }}
        </div>
        <div v-if="creditNote && detail.sourceFullNumber" class="text-caption q-mt-xs">
          Factura origen: {{ detail.sourceFullNumber || detail.sourceInvoiceFullNumber }}
        </div>
        <div v-if="detail.creditNoteConceptName" class="text-caption q-mt-xs">
          Concepto: {{ detail.creditNoteConceptName }}
          <span v-if="detail.creditNoteScope">({{ detail.creditNoteScope === 'total' ? 'Total' : 'Parcial' }})</span>
        </div>
        <div v-if="detail.notes" class="text-caption q-mt-xs">{{ detail.notes }}</div>
      </div>
      <div class="col-12 col-md-4 text-md-right">
        <div class="text-h6">${{ formatMoney(detail.total) }}</div>
        <div v-if="detail.cufe" class="text-caption text-break-word">CUFE/CUDE: {{ detail.cufe }}</div>
      </div>
    </div>
    <q-markup-table flat bordered dense class="company-data-table__expand-lines q-mb-sm">
      <thead>
        <tr>
          <th>#</th>
          <th>Descripción</th>
          <th class="text-right">Cant.</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in detail.details || []" :key="line.id || line.lineNumber">
          <td>{{ line.lineNumber }}</td>
          <td>{{ line.description }}</td>
          <td class="text-right">{{ line.quantity }}</td>
          <td class="text-right">${{ formatMoney(line.lineTotal) }}</td>
        </tr>
      </tbody>
    </q-markup-table>
  </div>
  <div v-else class="text-grey-7 text-caption">No se pudo cargar el detalle.</div>
</template>

<script setup>
import { formatDate } from 'src/utils/date-format.js'

defineProps({
  row: { type: Object, required: true },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  creditNote: { type: Boolean, default: false },
})

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}
</script>
