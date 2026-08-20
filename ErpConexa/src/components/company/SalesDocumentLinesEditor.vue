<template>
  <div :class="{ 'sales-doc-lines-editor--compact': compact }">
    <div v-if="documentKind === 'cotizacion'" class="q-mb-sm">
      <div class="text-caption text-grey-7 q-mb-xs">Tipo de ítems</div>
      <q-option-group
        :model-value="lineItemMode"
        :options="lineItemModeOptions"
        type="radio"
        inline
        dense
        @update:model-value="$emit('update:lineItemMode', $event)"
      />
    </div>

    <div
      class="sales-doc-lines"
      :class="{
        'sales-doc-lines--with-type': showLineTypeColumn,
        'sales-doc-lines--compact': compact,
      }"
    >
      <div class="sales-doc-lines__head">
        <span v-if="showLineTypeColumn">Tipo</span>
        <span>{{ lineItemColumnLabel }}</span>
        <span>Cant.</span>
        <span>Precio unit.</span>
        <span>IVA %</span>
        <span class="text-right">Subtotal</span>
        <span></span>
      </div>
      <div v-for="(line, idx) in lines" :key="idx" class="sales-doc-lines__row">
        <div v-if="showLineTypeColumn" class="col-type">
          <q-select
            v-model="line.lineType"
            :options="lineTypeOptions"
            dense
            outlined
            emit-value
            map-options
            hide-bottom-space
            options-dense
            @update:model-value="onLineTypeChange(line)"
          />
        </div>
        <div class="col-service">
          <q-select
            v-if="effectiveLineType(line) === 'service'"
            v-model="line.serviceId"
            :options="serviceOptions"
            dense
            outlined
            emit-value
            map-options
            hide-bottom-space
            options-dense
            @update:model-value="(v) => onServicePick(line, v)"
          />
          <q-select
            v-else
            v-model="line.articleId"
            :options="articleOptions"
            dense
            outlined
            emit-value
            map-options
            hide-bottom-space
            options-dense
            @update:model-value="(v) => onArticlePick(line, v)"
          />
        </div>
        <div class="col-qty">
          <q-input
            v-model.number="line.quantity"
            type="number"
            dense
            outlined
            min="1"
            hide-bottom-space
          />
        </div>
        <div class="col-price">
          <MoneyInput v-model="line.unitPrice" :compact="compact" :label="compact ? '' : 'Precio'" />
        </div>
        <div class="col-tax">
          <q-input
            v-model.number="line.taxRate"
            type="number"
            dense
            outlined
            min="0"
            hide-bottom-space
          />
        </div>
        <div class="sales-doc-lines__subtotal">${{ formatMoney(lineCalc(line).lineTotal) }}</div>
        <div class="col-actions">
          <q-btn
            flat
            dense
            round
            icon="delete"
            color="negative"
            :disable="lines.length === 1"
            @click="removeLine(idx)"
          >
            <q-tooltip>Quitar línea</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>

    <q-btn
      flat
      icon="add"
      label="Agregar línea"
      color="primary"
      class="q-mt-sm"
      @click="addLine"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'

const props = defineProps({
  lines: { type: Array, required: true },
  documentKind: { type: String, default: 'cotizacion' },
  lineItemMode: { type: String, default: 'servicios' },
  services: { type: Array, default: () => [] },
  articles: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:lines', 'update:lineItemMode'])

const lineItemModeOptions = [
  { label: 'Servicios', value: 'servicios' },
  { label: 'Artículos', value: 'articulos' },
  { label: 'Ambos', value: 'ambos' },
]

const lineTypeOptions = [
  { label: 'Servicio', value: 'service' },
  { label: 'Artículo', value: 'article' },
]

const serviceOptions = computed(() =>
  props.services
    .filter((s) => s.isActive)
    .map((s) => ({
      label: `${s.code} — ${s.description}`,
      value: s.id,
      caption: `$${formatMoney(s.basePrice)}`,
    }))
)

const articleOptions = computed(() =>
  props.articles
    .filter((a) => a.isActive)
    .map((a) => ({
      label: `${a.code} — ${a.name}`,
      value: a.id,
      caption: `$${formatMoney(a.averageCost)}`,
    }))
)

const showLineTypeColumn = computed(() =>
  props.documentKind === 'cotizacion' && props.lineItemMode === 'ambos'
)

const lineItemColumnLabel = computed(() => {
  if (props.documentKind !== 'cotizacion' || props.lineItemMode === 'servicios') return 'Servicio'
  if (props.lineItemMode === 'articulos') return 'Artículo'
  return 'Ítem'
})

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function lineCalc(line) {
  const base = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
  const taxAmount = base * ((Number(line.taxRate) || 0) / 100)
  const lineTotal = Math.round((base + taxAmount) * 100) / 100
  return { base, taxAmount, lineTotal }
}

function effectiveLineType(line) {
  if (props.documentKind !== 'cotizacion') return 'service'
  if (props.lineItemMode === 'articulos') return 'article'
  if (props.lineItemMode === 'servicios') return 'service'
  return line.lineType || 'service'
}

function emptyLine(lineType = 'service') {
  return {
    lineType,
    serviceId: null,
    articleId: null,
    itemCode: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxRate: 19,
  }
}

function updateLines(next) {
  emit('update:lines', next)
}

function addLine() {
  let lineType = 'service'
  if (props.documentKind === 'cotizacion') {
    if (props.lineItemMode === 'articulos') lineType = 'article'
  }
  updateLines([...props.lines, emptyLine(lineType)])
}

function removeLine(idx) {
  const next = [...props.lines]
  next.splice(idx, 1)
  updateLines(next)
}

function onServicePick(line, serviceId) {
  const svc = props.services.find((s) => s.id === serviceId)
  if (svc) {
    line.unitPrice = svc.basePrice
    line.articleId = null
    line.itemCode = ''
    line.description = ''
  }
}

function onArticlePick(line, articleId) {
  const art = props.articles.find((a) => a.id === articleId)
  if (art) {
    line.itemCode = art.code
    line.description = art.name
    line.unitPrice = art.averageCost || 0
    line.serviceId = null
  }
}

function onLineTypeChange(line) {
  if (line.lineType === 'service') {
    line.articleId = null
    line.itemCode = ''
    line.description = ''
  } else {
    line.serviceId = null
  }
  line.unitPrice = 0
}
</script>
