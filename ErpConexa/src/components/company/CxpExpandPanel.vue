<template>
  <div v-if="loading" class="row items-center q-gutter-sm text-grey-7">
    <q-spinner size="20px" color="primary" />
    <span>Cargando detalle…</span>
  </div>
  <div v-else-if="detail">
    <div class="row q-gutter-xs q-mb-sm">
      <q-btn
        v-if="canConfirm"
        color="positive"
        icon="check_circle"
        label="Confirmar"
        unelevated
        dense
        no-caps
        size="sm"
        @click="emit('confirm')"
      />
      <q-btn
        v-if="canSendDian"
        color="teal"
        icon="cloud_upload"
        label="Enviar DIAN"
        unelevated
        dense
        no-caps
        size="sm"
        :loading="sending"
        @click="emit('send-dian')"
      />
      <q-btn
        v-if="canVoid"
        color="negative"
        icon="block"
        label="Anular"
        outline
        dense
        no-caps
        size="sm"
        @click="emit('void')"
      />
      <q-btn
        color="red-8"
        icon="picture_as_pdf"
        label="Imprimir"
        outline
        dense
        no-caps
        size="sm"
        @click="emit('print')"
      />
      <q-btn
        v-if="canShowNotas"
        outline
        dense
        no-caps
        size="sm"
        icon="note_alt"
        label="Notas"
        color="grey-8"
        @click="notesDialogOpen = true"
      />
      <q-btn
        outline
        dense
        no-caps
        size="sm"
        icon="payments"
        label="Abonos"
        color="grey-8"
        @click="abonosDialogOpen = true"
      />
    </div>

    <div v-if="headerExtras.length" class="text-caption text-grey-8 q-mb-sm">
      <span v-for="(item, idx) in headerExtras" :key="item.label">
        <span v-if="idx"> · </span>
        <strong>{{ item.label }}:</strong> {{ item.value }}
      </span>
    </div>

    <q-card v-if="detailSummary.length" flat bordered class="q-mb-sm bg-grey-1 cxp-summary-card">
      <q-card-section class="q-py-sm">
        <div class="row q-col-gutter-md text-body2">
          <div v-for="item in detailSummary" :key="item.label" class="col-auto">
            <strong>{{ item.label }}:</strong>
            <span :class="item.class">{{ item.value }}</span>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <q-card bordered class="q-mb-sm bg-white cxp-section-card">
      <q-card-section class="q-py-xs row items-center justify-between">
        <div class="text-subtitle2">Líneas</div>
        <div v-if="editable" class="row q-gutter-xs">
          <q-btn dense unelevated no-caps size="sm" color="primary" icon="add" label="Agregar" @click="startAddLine" />
          <q-btn
            dense outline no-caps size="sm" color="primary" icon="edit" label="Editar"
            :disable="selectedLineIdx == null"
            @click="startEditLine"
          />
          <q-btn
            dense outline no-caps size="sm" color="negative" icon="delete" label="Eliminar"
            :disable="selectedLineIdx == null || editLines.length <= 1 || saving"
            @click="removeSelectedLine"
          />
        </div>
      </q-card-section>
      <q-separator />
      <q-card-section class="q-pt-sm q-pb-sm">
        <q-markup-table flat dense class="cxp-section-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Descripción</th>
              <th class="text-right">Cant.</th>
              <th class="text-right">Valor</th>
              <th class="text-right">Dcto.</th>
              <th class="text-right">Vlr. IVA</th>
              <th class="text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, idx) in visibleLines"
              :key="d.id || d.item || idx"
              class="cursor-pointer"
              :class="{ 'cxp-section-table__row--selected': selectedLineIdx === idx }"
              @click="selectedLineIdx = idx"
            >
              <td>{{ d.item }}</td>
              <td>{{ d.descripcion || d.serviceDescription || '—' }}</td>
              <td class="text-right">{{ d.cantidad }}</td>
              <td class="text-right">{{ formatCop(d.valor) }}</td>
              <td class="text-right">{{ formatCop(d.vlrDescuento) }}</td>
              <td class="text-right">{{ formatCop(d.vlrIva) }}</td>
              <td class="text-right">{{ formatCop(lineNeto(d)) }}</td>
            </tr>
            <tr v-if="!visibleLines.length">
              <td colspan="7" class="text-grey-7">Sin líneas de detalle</td>
            </tr>
          </tbody>
        </q-markup-table>
      </q-card-section>
    </q-card>

    <q-card bordered class="q-mb-sm bg-white cxp-section-card">
      <q-card-section class="q-py-xs row items-center justify-between">
        <div class="text-subtitle2">Impuestos</div>
        <div v-if="editable" class="row q-gutter-xs">
          <q-btn dense unelevated no-caps size="sm" color="primary" icon="add" label="Agregar" @click="startAddTax" />
          <q-btn
            dense outline no-caps size="sm" color="primary" icon="edit" label="Editar"
            :disable="selectedTaxIdx == null"
            @click="startEditTax"
          />
          <q-btn
            dense outline no-caps size="sm" color="negative" icon="delete" label="Eliminar"
            :disable="selectedTaxIdx == null"
            @click="removeSelectedTax"
          />
          <q-btn
            dense unelevated no-caps size="sm" color="primary" icon="save" label="Guardar"
            :loading="saving"
            @click="emitSave"
          />
        </div>
      </q-card-section>
      <q-separator />
      <q-card-section class="q-pt-sm q-pb-sm">
        <q-markup-table flat dense class="cxp-section-table">
          <thead>
            <tr>
              <th>Impuesto</th>
              <th>Clase</th>
              <th class="text-right">Base</th>
              <th class="text-right">%</th>
              <th class="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(t, idx) in visibleTaxes"
              :key="t.id || t.cnsFcxpi || idx"
              :class="{ 'cxp-section-table__row--selected': selectedTaxIdx === idx }"
              class="cursor-pointer"
              @click="selectedTaxIdx = idx"
            >
              <td>{{ taxLabel(t.idImpuesto) || t.taxCode || '—' }}</td>
              <td>{{ classLabel(t.idImpuesto, t.idClase) || t.classCode || '—' }}</td>
              <td class="text-right">{{ formatCop(t.base) }}</td>
              <td class="text-right">{{ t.vlrCalc }}</td>
              <td class="text-right">{{ formatCop(t.vlrImpuesto) }}</td>
            </tr>
            <tr v-if="!visibleTaxes.length">
              <td colspan="5" class="text-grey-7">Sin impuestos registrados</td>
            </tr>
          </tbody>
        </q-markup-table>
      </q-card-section>
    </q-card>

    <CompanyFormDialog
      :model-value="lineFormOpen"
      :title="lineFormMode === 'edit' ? 'Editar línea' : 'Agregar línea'"
      :icon="lineFormMode === 'edit' ? 'edit' : 'add'"
      compact
      @update:model-value="onLineDialog"
    >
      <div class="cxp-form">
        <div class="cxp-form__label">Ítem</div>
        <q-select
          v-model="lineDraft.idServicio"
          :options="serviceOptionsFiltered"
          label="Servicio"
          outlined
          dense
          emit-value
          map-options
          clearable
          use-input
          input-debounce="200"
          class="cxp-form__full"
          @filter="filterServices"
          @update:model-value="onServicePick(lineDraft, $event)"
        />
        <q-input
          v-model="lineDraft.descripcion"
          label="Descripción *"
          outlined
          dense
          type="textarea"
          autogrow
          class="cxp-form__full"
        />
        <div class="cxp-form__label">Valores</div>
        <q-input
          v-model.number="lineDraft.cantidad"
          type="number"
          min="0"
          step="any"
          label="Cantidad"
          outlined
          dense
          @update:model-value="onLineBaseChange"
        />
        <MoneyInput v-model="lineDraft.valor" label="Valor unitario" @update:model-value="onLineBaseChange" />
        <MoneyInput v-model="lineDraft.vlrDescuento" label="Valor descuento" @update:model-value="onLineBaseChange" />
        <q-input
          v-model.number="lineDraft.ivaPct"
          type="number"
          min="0"
          step="any"
          label="Tarifa IVA %"
          outlined
          dense
          @update:model-value="recalcLineIva"
        />
        <MoneyInput v-model="lineDraft.vlrIva" label="Vlr. IVA" />
        <q-input
          :model-value="formatCop(lineNeto(lineDraft))"
          label="Valor neto"
          outlined
          dense
          readonly
        />
      </div>
      <template #actions>
        <q-btn flat no-caps icon="close" label="Cancelar" color="grey-8" @click="cancelLineForm" />
        <q-btn unelevated no-caps icon="save" label="Guardar" color="primary" :loading="saving" @click="applyLineDraft" />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog
      :model-value="taxFormOpen"
      :title="taxFormMode === 'edit' ? 'Editar impuesto' : 'Agregar impuesto'"
      :icon="taxFormMode === 'edit' ? 'percent' : 'add'"
      compact
      @update:model-value="onTaxDialog"
    >
      <div class="cxp-form">
        <div class="cxp-form__label">Impuesto</div>
        <q-select
          v-model="taxDraft.idImpuesto"
          :options="taxOptions"
          label="Impuesto *"
          outlined
          dense
          emit-value
          map-options
          @update:model-value="onTaxChange(taxDraft)"
        />
        <q-select
          v-model="taxDraft.idClase"
          :options="classOptionsFor(taxDraft.idImpuesto)"
          label="Clase *"
          outlined
          dense
          emit-value
          map-options
          :disable="!taxDraft.idImpuesto"
          @update:model-value="applyTaxCalc(taxDraft)"
        />
        <div class="cxp-form__label">Cálculo</div>
        <MoneyInput v-model="taxDraft.base" label="Base" @update:model-value="recalcTaxAmount(taxDraft)" />
        <q-input
          v-model.number="taxDraft.vlrCalc"
          type="number"
          min="0"
          step="any"
          label="Tarifa %"
          outlined
          dense
          @update:model-value="recalcTaxAmount(taxDraft)"
        />
        <MoneyInput v-model="taxDraft.vlrImpuesto" label="Valor" />
      </div>
      <template #actions>
        <q-btn flat no-caps icon="close" label="Cancelar" color="grey-8" @click="cancelTaxForm" />
        <q-btn unelevated no-caps icon="check" label="Aplicar" color="primary" @click="applyTaxDraft" />
      </template>
    </CompanyFormDialog>

    <CxpNotasPanel
      v-model="notesDialogOpen"
      :fcxp-id="row.id"
      :detail="detail"
      :can-manage="canManageNotas"
      :can-send-dian="canSendDianNotas"
      @updated="emit('notas-updated', $event)"
    />

    <CompanyFormDialog
      v-model="abonosDialogOpen"
      title="Abonos"
      icon="payments"
      compact
    >
      <MoneyInput v-if="editable" v-model="editNotes.vlrAbonos" label="Abonos" />
      <div v-else class="cxp-form__readonly">
        Abonos: <strong>{{ formatCop(detail.vlrAbonos) }}</strong>
      </div>
      <template #actions>
        <q-btn flat no-caps icon="close" label="Cerrar" color="grey-8" v-close-popup />
        <q-btn
          v-if="editable"
          unelevated
          no-caps
          icon="save"
          label="Guardar"
          color="primary"
          :loading="saving"
          @click="emitSave"
        />
      </template>
    </CompanyFormDialog>
  </div>
  <div v-else class="text-grey-7 text-caption">No se pudo cargar el detalle.</div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'
import CxpNotasPanel from 'src/components/company/CxpNotasPanel.vue'
import { formatCop } from 'src/utils/money-format.js'
import { formatDate } from 'src/utils/date-format.js'

const props = defineProps({
  row: { type: Object, required: true },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  sending: { type: Boolean, default: false },
  canConfirm: { type: Boolean, default: false },
  canSendDian: { type: Boolean, default: false },
  canManageNotas: { type: Boolean, default: false },
  canSendDianNotas: { type: Boolean, default: false },
  canVoid: { type: Boolean, default: false },
  taxOptions: { type: Array, default: () => [] },
  taxClasses: { type: Array, default: () => [] },
  taxRates: { type: Array, default: () => [] },
  services: { type: Array, default: () => [] },
})

const emit = defineEmits(['save', 'confirm', 'send-dian', 'void', 'print', 'notas-updated'])

const notesDialogOpen = ref(false)
const abonosDialogOpen = ref(false)
const selectedTaxIdx = ref(null)
const selectedLineIdx = ref(null)
const taxFormOpen = ref(false)
const lineFormOpen = ref(false)
const taxFormMode = ref('add')
const lineFormMode = ref('add')
const editTaxes = ref([])
const editLines = ref([])
const serviceFilter = ref('')
const taxDraft = reactive(emptyTax())
const lineDraft = reactive(emptyLine())
const editNotes = reactive({
  vlrAbonos: 0,
})

const canShowNotas = computed(() => {
  const status = props.detail?.status || props.row?.status
  return status && status !== 'borrador' && status !== 'anulada'
})

const visibleTaxes = computed(() => (props.editable ? editTaxes.value : (props.detail?.taxes || [])))
const visibleLines = computed(() => (props.editable ? editLines.value : (props.detail?.details || [])))

const serviceOptions = computed(() =>
  props.services.map((s) => ({
    label: `${s.code} — ${s.description}`,
    value: s.id,
    description: s.description,
    basePrice: s.basePrice,
  }))
)

const serviceOptionsFiltered = computed(() => {
  const q = serviceFilter.value.trim().toLowerCase()
  if (!q) return serviceOptions.value
  return serviceOptions.value.filter((o) => o.label.toLowerCase().includes(q))
})

const headerExtras = computed(() => {
  const d = props.detail
  if (!d) return []
  const items = []
  if (d.fechaFactura) items.push({ label: 'Fecha factura', value: formatDate(d.fechaFactura) })
  if (d.fechaVence) items.push({ label: 'Vence', value: formatDate(d.fechaVence) })
  if (d.cnsInterno) items.push({ label: 'Interno', value: d.cnsInterno })
  if (d.cnsDocSoporte) items.push({ label: 'DS', value: d.cnsDocSoporte })
  if (d.detalle) items.push({ label: 'Concepto', value: d.detalle })
  if (d.cude) items.push({ label: 'CUDS', value: d.cude })
  if (d.estDian) items.push({ label: 'DIAN', value: d.estDian })
  return items
})

const detailSummary = computed(() => {
  const d = props.detail
  if (!d) return []
  const items = [
    { label: 'Neto', value: formatCop(d.valorNeto), class: '' },
  ]
  if (Number(d.vlrNotaDb) > 0) {
    items.push({ label: 'Notas DB', value: formatCop(d.vlrNotaDb), class: 'text-teal-8 text-weight-medium' })
  }
  if (Number(d.vlrNotaCr) > 0) {
    items.push({ label: 'Notas CR', value: formatCop(d.vlrNotaCr), class: 'text-orange-9 text-weight-medium' })
  }
  if (Number(d.vlrAbonos) > 0) {
    items.push({ label: 'Abonos', value: formatCop(d.vlrAbonos), class: 'text-weight-medium' })
  }
  items.push({ label: 'Saldo', value: formatCop(d.saldo), class: 'text-weight-bold' })
  return items
})

watch(
  () => props.detail,
  (detail) => {
    if (!detail) return
    editLines.value = (detail.details || []).map((d, i) => mapLine(d, i))
    editTaxes.value = (detail.taxes || []).map((t, i) => ({
      cnsFcxpi: t.cnsFcxpi ?? i + 1,
      idImpuesto: t.idImpuesto || null,
      idClase: t.idClase || null,
      taxCode: t.taxCode,
      classCode: t.classCode,
      vlrCalc: t.vlrCalc ?? 0,
      base: t.base ?? 0,
      vlrImpuesto: t.vlrImpuesto ?? 0,
      cuentaConta: t.cuentaConta || null,
    }))
    editNotes.vlrAbonos = detail.vlrAbonos || 0
    selectedTaxIdx.value = null
    selectedLineIdx.value = null
    cancelTaxForm()
    cancelLineForm()
  },
  { immediate: true },
)

function emptyTax() {
  return {
    cnsFcxpi: 1,
    idImpuesto: null,
    idClase: null,
    vlrCalc: 0,
    base: 0,
    vlrImpuesto: 0,
    cuentaConta: null,
  }
}

function emptyLine() {
  return {
    item: 1,
    idServicio: null,
    descripcion: '',
    cantidad: 1,
    valor: 0,
    vlrIva: 0,
    vlrDescuento: 0,
    vlrImpConsumo: 0,
    ivaPct: 0,
  }
}

function mapLine(d, i) {
  return {
    item: d.item ?? i + 1,
    idServicio: d.idServicio || null,
    descripcion: d.descripcion || d.serviceDescription || '',
    serviceDescription: d.serviceDescription,
    cantidad: d.cantidad ?? 1,
    valor: d.valor ?? 0,
    vlrIva: d.vlrIva ?? 0,
    vlrDescuento: d.vlrDescuento ?? 0,
    vlrImpConsumo: d.vlrImpConsumo ?? 0,
    vlrNeto: d.vlrNeto,
  }
}

function lineBase(d) {
  const qty = Number(d.cantidad) || 0
  const unit = Number(d.valor) || 0
  const discount = Number(d.vlrDescuento) || 0
  return Math.max(0, qty * unit - discount)
}

function lineNeto(d) {
  if (d.vlrNeto != null && !props.editable) return d.vlrNeto
  const iva = Number(d.vlrIva) || 0
  const consumo = Number(d.vlrImpConsumo) || 0
  return Math.round((lineBase(d) + iva + consumo) * 100) / 100
}

function inferIvaPct(d) {
  const base = lineBase(d)
  const iva = Number(d.vlrIva) || 0
  if (!base) return 0
  return Math.round((iva / base) * 10000) / 100
}

function recalcLineIva() {
  const base = lineBase(lineDraft)
  const pct = Number(lineDraft.ivaPct) || 0
  lineDraft.vlrIva = Math.round((base * pct) * 100) / 10000
}

function onLineBaseChange() {
  if (Number(lineDraft.ivaPct) > 0) recalcLineIva()
}

function taxLabel(taxId) {
  return props.taxOptions.find((o) => o.value === taxId)?.label || ''
}

function classLabel(taxId, classId) {
  return classOptionsFor(taxId).find((o) => o.value === classId)?.label || ''
}

function classOptionsFor(taxId) {
  if (!taxId) return []
  return props.taxClasses
    .filter((c) => c.taxId === taxId && c.status === 'activo')
    .map((c) => ({
      label: `${c.classCode}${c.description ? ` — ${c.description}` : ''}`,
      value: c.id,
    }))
}

function findTaxRate(taxId, classId) {
  if (!taxId || !classId) return null
  const dateStr = String(props.detail?.fechaFactura || props.detail?.fechaCxp || '').slice(0, 10)
  return props.taxRates
    .filter((r) => r.taxId === taxId && r.taxClassId === classId && r.status === 'activo')
    .filter((r) => {
      const start = String(r.startDate || '').slice(0, 10)
      const end = r.endDate ? String(r.endDate).slice(0, 10) : ''
      return (!start || start <= dateStr) && (!end || end >= dateStr)
    })
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))[0] || null
}

function recalcTaxAmount(tax) {
  const base = Number(tax.base) || 0
  const pct = Number(tax.vlrCalc) || 0
  tax.vlrImpuesto = Math.round((base * pct) * 100) / 10000
}

function applyTaxCalc(tax) {
  const rate = findTaxRate(tax.idImpuesto, tax.idClase)
  if (rate) {
    tax.vlrCalc = rate.rateValue
    tax.cuentaConta = rate.accountId || tax.cuentaConta
  }
  recalcTaxAmount(tax)
}

function onTaxChange(tax) {
  tax.idClase = null
  tax.vlrCalc = 0
  tax.vlrImpuesto = 0
  const classes = classOptionsFor(tax.idImpuesto)
  if (classes.length === 1) {
    tax.idClase = classes[0].value
    applyTaxCalc(tax)
  }
}

function currentBruto() {
  return Math.round(editLines.value.reduce((sum, d) => sum + lineBase(d), 0) * 100) / 100
}

function syncTaxesFromLines() {
  const bruto = currentBruto()
  editTaxes.value = editTaxes.value.map((tax) => {
    const next = { ...tax, base: bruto }
    const pct = Number(next.vlrCalc) || 0
    next.vlrImpuesto = Math.round((bruto * pct) * 100) / 10000
    return next
  })
}

function assignTaxDraft(src) {
  Object.assign(taxDraft, {
    cnsFcxpi: src.cnsFcxpi ?? 1,
    idImpuesto: src.idImpuesto || null,
    idClase: src.idClase || null,
    vlrCalc: src.vlrCalc ?? 0,
    base: src.base ?? 0,
    vlrImpuesto: src.vlrImpuesto ?? 0,
    cuentaConta: src.cuentaConta || null,
  })
}

function assignLineDraft(src) {
  const next = {
    item: src.item ?? 1,
    idServicio: src.idServicio || null,
    descripcion: src.descripcion || '',
    cantidad: src.cantidad ?? 1,
    valor: src.valor ?? 0,
    vlrIva: src.vlrIva ?? 0,
    vlrDescuento: src.vlrDescuento ?? 0,
    vlrImpConsumo: src.vlrImpConsumo ?? 0,
    ivaPct: src.ivaPct,
  }
  Object.assign(lineDraft, next)
  if (lineDraft.ivaPct == null) lineDraft.ivaPct = inferIvaPct(lineDraft)
}

function startAddTax() {
  taxFormMode.value = 'add'
  const draft = { ...emptyTax(), base: currentBruto(), cnsFcxpi: editTaxes.value.length + 1 }
  assignTaxDraft(draft)
  recalcTaxAmount(taxDraft)
  taxFormOpen.value = true
}

function startEditTax() {
  if (selectedTaxIdx.value == null) return
  const current = editTaxes.value[selectedTaxIdx.value]
  if (!current) return
  taxFormMode.value = 'edit'
  assignTaxDraft({ ...current, base: currentBruto() })
  recalcTaxAmount(taxDraft)
  taxFormOpen.value = true
}

function applyTaxDraft() {
  if (!taxDraft.idImpuesto) return
  const next = {
    cnsFcxpi: taxDraft.cnsFcxpi,
    idImpuesto: taxDraft.idImpuesto,
    idClase: taxDraft.idClase,
    vlrCalc: taxDraft.vlrCalc,
    base: taxDraft.base,
    vlrImpuesto: taxDraft.vlrImpuesto,
    cuentaConta: taxDraft.cuentaConta,
  }
  if (taxFormMode.value === 'edit' && selectedTaxIdx.value != null) {
    editTaxes.value.splice(selectedTaxIdx.value, 1, next)
  } else {
    editTaxes.value.push(next)
    selectedTaxIdx.value = editTaxes.value.length - 1
  }
  editTaxes.value.forEach((t, i) => { t.cnsFcxpi = i + 1 })
  cancelTaxForm()
}

function removeSelectedTax() {
  if (selectedTaxIdx.value == null) return
  editTaxes.value.splice(selectedTaxIdx.value, 1)
  editTaxes.value.forEach((t, i) => { t.cnsFcxpi = i + 1 })
  selectedTaxIdx.value = null
  cancelTaxForm()
}

function cancelTaxForm() {
  taxFormOpen.value = false
  taxFormMode.value = 'add'
  assignTaxDraft(emptyTax())
}

function filterServices(val, update) {
  update(() => { serviceFilter.value = val })
}

function onServicePick(line, serviceId) {
  const svc = props.services.find((s) => s.id === serviceId)
  if (!svc) return
  if (!line.descripcion) line.descripcion = svc.description
  if (!line.valor) line.valor = svc.basePrice || 0
}

function startAddLine() {
  lineFormMode.value = 'add'
  assignLineDraft({ ...emptyLine(), item: editLines.value.length + 1 })
  lineFormOpen.value = true
}

function startEditLine() {
  if (selectedLineIdx.value == null) return
  const current = editLines.value[selectedLineIdx.value]
  if (!current) return
  lineFormMode.value = 'edit'
  assignLineDraft(current)
  lineFormOpen.value = true
}

function applyLineDraft() {
  if (!String(lineDraft.descripcion || '').trim()) return
  const next = mapLine(lineDraft, editLines.value.length)
  if (lineFormMode.value === 'edit' && selectedLineIdx.value != null) {
    editLines.value.splice(selectedLineIdx.value, 1, next)
  } else {
    editLines.value.push(next)
    selectedLineIdx.value = editLines.value.length - 1
  }
  editLines.value.forEach((l, i) => { l.item = i + 1 })
  syncTaxesFromLines()
  cancelLineForm()
  emitSave()
}

function removeSelectedLine() {
  if (selectedLineIdx.value == null || editLines.value.length <= 1) return
  editLines.value.splice(selectedLineIdx.value, 1)
  editLines.value.forEach((l, i) => { l.item = i + 1 })
  selectedLineIdx.value = null
  syncTaxesFromLines()
  cancelLineForm()
  emitSave()
}

function cancelLineForm() {
  lineFormOpen.value = false
  lineFormMode.value = 'add'
  assignLineDraft(emptyLine())
}

function onLineDialog(open) {
  if (!open) cancelLineForm()
}

function onTaxDialog(open) {
  if (!open) cancelTaxForm()
}

function emitSave() {
  emit('save', {
    details: editLines.value.filter((d) => String(d.descripcion || '').trim()),
    taxes: editTaxes.value.filter((t) => t.idImpuesto),
    vlrAbonos: editNotes.vlrAbonos || 0,
  })
  notesDialogOpen.value = false
  abonosDialogOpen.value = false
}
</script>

<style scoped>
.cxp-section-card {
  border: 1px solid rgba(0, 0, 0, 0.16);
  box-shadow: none;
}

.cxp-section-table {
  width: 100%;
}

.cxp-section-table :deep(table) {
  width: 100%;
}

.cxp-section-table__row--selected {
  background: rgba(25, 118, 210, 0.08);
}

.cxp-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 14px;
  align-items: start;
}

.cxp-form--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cxp-form__full {
  grid-column: 1 / -1;
}

.cxp-form__label {
  grid-column: 1 / -1;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
  margin-top: 4px;
}

.cxp-form__summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.62);
}

.cxp-form__readonly {
  color: rgba(0, 0, 0, 0.7);
  line-height: 1.7;
}

@media (max-width: 560px) {
  .cxp-form,
  .cxp-form--two {
    grid-template-columns: 1fr;
  }
}
</style>
