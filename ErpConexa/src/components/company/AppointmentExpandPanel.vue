<template>
  <div v-if="row" class="row q-col-gutter-md">
    <div class="col-12 col-md-8">
      <div class="text-subtitle2 text-weight-medium">{{ row.clientName }} — {{ row.serviceDesc }}</div>
      <div class="text-caption text-grey-7">
        {{ row.professionalName }} · {{ row.startTime }}
        <span v-if="row.endTime"> — {{ row.endTime }}</span>
      </div>
      <div v-if="row.notes" class="text-caption q-mt-xs">{{ row.notes }}</div>
    </div>
    <div class="col-12 col-md-4 text-md-right">
      <div class="text-h6">${{ formatMoney(row.finalPrice) }}</div>
      <q-badge :color="statusColor(row.status)">{{ statusLabel(row.status) }}</q-badge>
    </div>
  </div>
</template>

<script setup>
defineProps({
  row: { type: Object, required: true },
  statusColor: { type: Function, required: true },
  statusLabel: { type: Function, required: true },
})

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO')
}
</script>
