<template>
  <q-dialog v-model="visible" maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="cash-receipt-print">
      <q-bar class="bg-primary text-white no-print">
        <q-space />
        <q-btn flat icon="print" label="Imprimir" @click="doPrint" />
        <q-btn flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section v-if="data" class="cash-receipt-print__body">
        <div class="receipt-header text-center q-mb-md">
          <div class="text-h6 text-weight-bold">{{ data.company.name }}</div>
          <div class="text-caption">NIT {{ data.company.nit }}</div>
          <div v-if="data.company.address" class="text-caption">{{ data.company.address }}</div>
          <div v-if="data.company.phone" class="text-caption">Tel: {{ data.company.phone }}</div>
        </div>

        <q-separator class="q-mb-md" />

        <div class="receipt-meta q-mb-md">
          <div><strong>Recibo:</strong> {{ data.receipt.receiptNumber }}</div>
          <div><strong>Fecha:</strong> {{ formatDate(data.receipt.receiptDate) }}</div>
          <div><strong>Caja:</strong> {{ data.session.registerName }}</div>
          <div><strong>Apertura:</strong> {{ data.session.sessionNumber }}</div>
          <div v-if="data.receipt.clientName"><strong>Cliente:</strong> {{ data.receipt.clientName }}</div>
          <div v-if="data.receipt.clientDocument"><strong>Documento:</strong> {{ data.receipt.clientDocument }}</div>
        </div>

        <div class="receipt-concept q-mb-lg">
          <div class="text-subtitle2">Concepto</div>
          <div class="text-body1">{{ data.receipt.concept }}</div>
        </div>

        <div class="receipt-amount text-center q-mb-lg">
          <div class="text-caption text-grey-7">Valor recibido</div>
          <div class="text-h4 text-weight-bold">
            ${{ formatMoney(data.receipt.amount) }}
          </div>
          <div class="text-caption q-mt-xs">{{ data.receipt.paymentMethodLabel }}</div>
        </div>

        <div v-if="data.receipt.notes" class="q-mb-md">
          <div class="text-caption text-grey-7">Observaciones</div>
          <div>{{ data.receipt.notes }}</div>
        </div>

        <div class="text-center text-caption text-grey-7 q-mt-xl">
          Documento de recibo de caja — no válido como factura electrónica
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  data: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(props.modelValue)

watch(() => props.modelValue, (v) => { visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function formatDate(d) {
  if (!d) return '—'
  const match = String(d).match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) {
    return new Date(`${match[1]}T12:00:00`).toLocaleDateString('es-CO')
  }
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO')
}

function doPrint() {
  window.print()
}
</script>

<style scoped>
.cash-receipt-print__body {
  max-width: 380px;
  margin: 0 auto;
  font-family: 'Courier New', Courier, monospace;
}

@media print {
  .no-print {
    display: none !important;
  }

  .cash-receipt-print {
    box-shadow: none !important;
  }

  .cash-receipt-print__body {
    max-width: 80mm;
    padding: 0;
  }
}
</style>
