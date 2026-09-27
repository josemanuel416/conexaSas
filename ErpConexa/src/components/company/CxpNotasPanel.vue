<template>
  <div>
    <CompanyFormDialog
      :model-value="modelValue"
      title="Notas débito / crédito"
      icon="note_alt"
      cxp-notas-list
      @update:model-value="$emit('update:modelValue', $event)"
    >
    <div v-if="loading" class="text-center q-pa-lg">
      <q-spinner color="primary" size="md" />
    </div>
    <div v-else>
      <div class="row q-gutter-sm q-mb-md items-center">
        <q-btn
          v-if="canManage"
          unelevated
          no-caps
          color="primary"
          icon="add"
          label="Nueva nota"
          size="sm"
          @click="openCreate"
        />
        <q-space />
        <div class="text-caption text-grey-7">
          DB disminuye deuda · CR aumenta deuda
        </div>
      </div>

      <q-markup-table v-if="notas.length" flat bordered dense class="q-mb-md">
        <thead>
          <tr>
            <th>#</th>
            <th>Tipo</th>
            <th>Fecha</th>
            <th>Concepto</th>
            <th class="text-right">Neto</th>
            <th>Estado</th>
            <th class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="n in notas" :key="n.id">
            <td>{{ n.item }}</td>
            <td>
              <q-badge :color="n.tipoNota === 'DB' ? 'teal' : 'orange'" outline>
                {{ n.tipoNota === 'DB' ? 'Débito' : 'Crédito' }}
              </q-badge>
            </td>
            <td>{{ formatDate(n.fechaNota) }}</td>
            <td>{{ formatConceptoLabel(n) }}</td>
            <td class="text-right">{{ formatCop(n.vlrNeto) }}</td>
            <td>
              <q-badge :color="notaStatusColor(n.status)" outline>{{ notaStatusLabel(n.status) }}</q-badge>
              <div v-if="n.cnsDocAjuste" class="text-caption text-grey-7">{{ n.cnsDocAjuste }}</div>
            </td>
            <td class="text-right">
              <q-btn flat dense round icon="visibility" color="grey-8" @click="viewNota(n)">
                <q-tooltip>Ver / editar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canShowPdfForNota(n)"
                flat dense round icon="picture_as_pdf" color="red-8"
                @click="openNotaPdf(n)"
              >
                <q-tooltip>Ver PDF</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canSendDianForNota(n)"
                flat dense round icon="cloud_upload" color="teal"
                :loading="sendingDianId === n.id"
                @click="sendDianFromList(n)"
              >
                <q-tooltip>Enviar DIAN</q-tooltip>
              </q-btn>
            </td>
          </tr>
        </tbody>
      </q-markup-table>
      <q-banner v-else dense rounded class="bg-grey-2 text-grey-8 q-mb-md">
        Sin notas registradas.
      </q-banner>

      <q-card flat bordered class="bg-grey-1 q-pa-sm text-body2">
        <div class="row q-col-gutter-md">
          <div class="col-6 col-md-3"><strong>Notas DB:</strong> {{ formatCop(detail?.vlrNotaDb) }}</div>
          <div class="col-6 col-md-3"><strong>Notas CR:</strong> {{ formatCop(detail?.vlrNotaCr) }}</div>
          <div class="col-6 col-md-3"><strong>Saldo CxP:</strong> {{ formatCop(detail?.saldo) }}</div>
        </div>
      </q-card>
    </div>

    <template #actions>
      <q-btn flat no-caps icon="close" label="Cerrar" color="grey-8" v-close-popup />
    </template>
  </CompanyFormDialog>

    <CompanyFormDialog
      v-model="formOpen"
      :title="formTitle"
      icon="edit_note"
      cxp-nota-form
      actions-wrap
      @hide="resetForm"
    >
    <div class="cxp-nota-form">
      <div class="cxp-nota-form__row cxp-nota-form__full">
        <q-select
          v-model="form.tipoNota"
          :options="tipoOptions"
          label="Tipo de nota *"
          outlined dense emit-value map-options
          :disable="!isDraft"
          class="cxp-nota-form__field"
        />
        <q-select
          v-model="form.cndbcrId"
          :options="conceptoOptions"
          label="Concepto nota *"
          outlined dense emit-value map-options
          class="cxp-nota-form__field cxp-nota-form__field--wide"
          :disable="!isDraft"
          @update:model-value="onConceptoChange"
        />
        <q-input
          v-model="form.fechaNota"
          type="date"
          label="Fecha"
          outlined dense
          class="cxp-nota-form__field cxp-nota-form__field--date"
          :disable="!isDraft"
        />
      </div>
      <q-input
        v-model="form.detalle"
        label="Observaciones"
        outlined dense type="textarea" autogrow class="cxp-nota-form__full"
        :disable="!isDraft"
      />
      <div class="cxp-nota-form__toggles cxp-nota-form__full">
        <q-toggle v-model="form.mdetalle" label="Detalle por líneas" dense :disable="!isDraft" @update:model-value="onMdetalleChange" />
        <q-toggle
          v-model="form.afectaIva"
          label="Afecta IVA"
          dense
          :disable="!isDraft || !canAfectaIva"
          @update:model-value="onAfectaIvaChange"
        >
          <q-tooltip v-if="!canAfectaIva">La CxP no tiene IVA registrado</q-tooltip>
        </q-toggle>
        <q-toggle
          v-model="form.afectaImp"
          label="Afecta impuestos (retenciones)"
          dense
          :disable="!isDraft || !canAfectaImp"
          @update:model-value="onAfectaImpChange"
        >
          <q-tooltip v-if="!canAfectaImp">La CxP no tiene retenciones registradas</q-tooltip>
        </q-toggle>
      </div>

      <template v-if="form.mdetalle">
        <div class="cxp-nota-form__label cxp-nota-form__full">Líneas a afectar</div>
        <q-markup-table flat bordered dense class="cxp-nota-form__full">
          <thead>
            <tr>
              <th>#</th>
              <th>Descripción</th>
              <th class="text-right">Disponible</th>
              <th class="text-right">Afectar</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lineRows" :key="line.fcxpdId">
              <td>{{ line.item }}</td>
              <td>{{ line.descripcion || '—' }}</td>
              <td class="text-right">{{ formatCop(line.disponible) }}</td>
              <td class="text-right">
                <MoneyInput
                  v-model="line.vlrAfecta"
                  dense
                  :disable="!isDraft"
                  @update:model-value="onLineAmountChange"
                />
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </template>
      <template v-else>
        <div class="cxp-nota-form__money cxp-nota-form__full">
          <MoneyInput v-model="form.vlrNota" label="Valor nota *" :disable="!isDraft" @update:model-value="onVlrNotaChange" />
          <MoneyInput
            v-if="form.afectaIva"
            v-model="form.vlrIva"
            :label="ivaFieldLabel"
            :disable="!isDraft"
            readonly
          />
        </div>
      </template>

      <template v-if="form.afectaImp">
        <div class="cxp-nota-form__label cxp-nota-form__full">Impuestos a afectar</div>
        <q-markup-table flat bordered dense class="cxp-nota-form__full">
          <thead>
            <tr>
              <th>Impuesto</th>
              <th class="text-right">Disponible</th>
              <th class="text-right">Afectar</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tax in taxRows" :key="tax.fcxpiId">
              <td>{{ tax.taxCode || '—' }} / {{ tax.classCode || '—' }}</td>
              <td class="text-right">{{ formatCop(tax.disponible) }}</td>
              <td class="text-right">
                <MoneyInput
                  v-model="tax.vlrImpuesto"
                  dense
                  :disable="!isDraft"
                  readonly
                />
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </template>

      <q-card flat bordered class="bg-grey-1 q-pa-sm cxp-nota-form__full">
        <div><strong>Valor neto nota:</strong> {{ formatCop(form.vlrNeto) }}</div>
        <div v-if="selectedNota?.cnsDocAjuste" class="text-caption q-mt-xs">
          NAS: {{ selectedNota.cnsDocAjuste }}
          <span v-if="selectedNota.cude"> · CUDS: {{ selectedNota.cude }}</span>
        </div>
      </q-card>

      <div v-if="selectedNota && detail?.manejaDocSoporte" class="cxp-nota-form__full q-mt-sm">
        <div class="text-subtitle2 q-mb-xs">Envíos DIAN</div>
        <DianSubmissionsPanel
          :fcxp-nota-id="selectedNota.id"
          :fcxp-id="fcxpId"
          :items="submissionItems"
          :show-pdf="canShowPdf"
          :pdf-title="notaPdfTitle(selectedNota)"
          :pdf-fallback-name="notaPdfFallbackName(selectedNota)"
        />
      </div>
    </div>

    <template #actions>
      <q-btn flat no-caps icon="close" label="Cerrar" color="grey-8" @click="formOpen = false" />
      <q-btn
        v-if="isDraft && canManage"
        unelevated no-caps icon="save" label="Guardar borrador"
        color="primary" :loading="saving" @click="saveNota"
      />
      <q-btn
        v-if="isDraft && canManage"
        unelevated no-caps icon="check_circle" label="Confirmar"
        color="positive" :loading="confirming" @click="confirmNota"
      />
      <q-btn
        v-if="canSendDian"
        unelevated no-caps icon="cloud_upload" label="Enviar DIAN"
        color="teal" size="sm" :loading="sendingDian" @click="sendDian"
      />
      <q-btn
        v-if="canShowPdf"
        flat no-caps icon="picture_as_pdf" label="Ver PDF"
        color="red-8" @click="openSelectedNotaPdf"
      />
      <q-btn
        v-if="canVoidNota"
        flat no-caps icon="block" label="Anular"
        color="negative" :loading="voiding" @click="voidNota"
      />
    </template>
    </CompanyFormDialog>

    <InventarioReportPdfDialog
      v-model="pdfDialogOpen"
      :title="pdfDialogTitle"
      :loader="pdfLoader"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'
import DianSubmissionsPanel from 'src/components/company/DianSubmissionsPanel.vue'
import InventarioReportPdfDialog from 'src/components/company/inventario/InventarioReportPdfDialog.vue'
import { api } from 'src/services/api.js'
import { formatCop } from 'src/utils/money-format.js'
import { formatDate } from 'src/utils/date-format.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  fcxpId: { type: String, required: true },
  detail: { type: Object, default: null },
  canManage: { type: Boolean, default: false },
  canSendDian: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'updated'])

const $q = useQuasar()

const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const sendingDian = ref(false)
const sendingDianId = ref(null)
const voiding = ref(false)
const notas = ref([])
const formOpen = ref(false)
const pdfDialogOpen = ref(false)
const pdfDialogTitle = ref('Nota de ajuste')
const pdfLoader = ref(null)
const selectedNota = ref(null)
const disponibilidad = ref({ lines: [], taxes: [] })
const submissionItems = ref(null)
const conceptos = ref([])

const conceptoOptions = computed(() =>
  conceptos.value.map((c) => ({
    label: `${c.concepto} — ${c.descripcion}`,
    value: c.id,
    caption: `DIAN ${c.dianCode}`,
  })),
)

const tipoOptions = [
  { label: 'Débito (disminuye deuda)', value: 'DB' },
  { label: 'Crédito (aumenta deuda)', value: 'CR' },
]

const form = reactive(emptyForm())
const lineRows = ref([])
const taxRows = ref([])

const isDraft = computed(() => !selectedNota.value || selectedNota.value.status === 'borrador')
const formTitle = computed(() => {
  if (!selectedNota.value) return 'Nueva nota'
  return `Nota #${selectedNota.value.item} — ${selectedNota.value.tipoNota === 'DB' ? 'Débito' : 'Crédito'}`
})
const canSendDian = computed(() =>
  props.canSendDian
  && props.detail?.manejaDocSoporte
  && props.detail?.cude
  && selectedNota.value
  && ['confirmada', 'rechazada_dian'].includes(selectedNota.value.status),
)

function canSendDianForNota(nota) {
  return props.canSendDian
    && props.detail?.manejaDocSoporte
    && props.detail?.cude
    && ['confirmada', 'rechazada_dian'].includes(nota.status)
}

function canShowPdfForNota(nota) {
  return nota?.status && nota.status !== 'borrador'
}

const canShowPdf = computed(() => canShowPdfForNota(selectedNota.value))

function notaPdfTitle(nota) {
  const tipo = nota?.tipoNota === 'CR' ? 'Crédito' : 'Débito'
  const num = nota?.cnsDocAjuste || `#${nota?.item || ''}`
  return `NAS ${tipo} ${num}`
}

function notaPdfFallbackName(nota) {
  return `${nota?.tipoNota || 'DB'}-${nota?.cnsDocAjuste || nota?.item || 'nota'}`
}

function openNotaPdf(nota) {
  if (!nota?.id) return
  pdfDialogTitle.value = notaPdfTitle(nota)
  pdfLoader.value = () => api.cuentasPagar.notas.fetchPdf(props.fcxpId, nota.id, notaPdfFallbackName(nota))
  pdfDialogOpen.value = true
}

function openSelectedNotaPdf() {
  if (selectedNota.value) openNotaPdf(selectedNota.value)
}
const canVoidNota = computed(() =>
  props.canManage
  && selectedNota.value
  && selectedNota.value.status !== 'aprobada_dian'
  && selectedNota.value.status !== 'anulada',
)

const canAfectaIva = computed(() => {
  if (Number(props.detail?.vlrIva) > 0) return true
  return disponibilidad.value.lines.some((l) => Number(l.ivaPct) > 0)
})

const canAfectaImp = computed(() => {
  const taxes = disponibilidad.value.taxes.length
    ? disponibilidad.value.taxes
    : (props.detail?.taxes || [])
  return taxes.some((t) => Number(t.disponible ?? t.vlrImpuesto) > 0)
})

const effectiveIvaPct = computed(() => getEffectiveIvaPct())

const ivaFieldLabel = computed(() => {
  const pct = effectiveIvaPct.value
  return pct > 0 ? `IVA (${pct}%)` : 'IVA'
})

watch(canAfectaIva, (allowed) => {
  if (!allowed && form.afectaIva) {
    form.afectaIva = false
    form.vlrIva = 0
    recalcTotals()
  }
})

watch(canAfectaImp, (allowed) => {
  if (!allowed && form.afectaImp) {
    form.afectaImp = false
    clearAutoTaxes()
    recalcTotals()
  }
})

watch(
  () => [props.modelValue, props.fcxpId],
  async ([open]) => {
    if (open && props.fcxpId) {
      await Promise.all([loadConceptos(), refreshList()])
    }
  },
  { immediate: true },
)

function emptyForm() {
  return {
    cndbcrId: null,
    tipoNota: 'DB',
    fechaNota: new Date().toISOString().slice(0, 10),
    detalle: '',
    mdetalle: false,
    afectaIva: false,
    afectaImp: false,
    vlrNota: 0,
    vlrIva: 0,
    vlrImpuesto: 0,
    vlrNeto: 0,
  }
}

function formatConceptoLabel(nota) {
  if (nota.concepto) {
    const dian = nota.dianCode ? ` (DIAN ${nota.dianCode})` : ''
    return `${nota.concepto}${dian}`
  }
  return nota.detalle || '—'
}

function onConceptoChange(id) {
  const item = conceptos.value.find((c) => c.id === id)
  if (item && !form.detalle) {
    form.detalle = item.descripcion
  }
}

async function loadConceptos() {
  try {
    conceptos.value = await api.cuentasPagar.conceptosNotas.list(true)
  } catch {
    conceptos.value = []
  }
}

function notaStatusColor(status) {
  return {
    borrador: 'grey',
    confirmada: 'blue',
    enviada_dian: 'orange',
    aprobada_dian: 'positive',
    rechazada_dian: 'negative',
    anulada: 'grey-7',
  }[status] || 'grey'
}

function notaStatusLabel(status) {
  return {
    borrador: 'Borrador',
    confirmada: 'Confirmada',
    enviada_dian: 'Enviada DIAN',
    aprobada_dian: 'Aprobada DIAN',
    rechazada_dian: 'Rechazada DIAN',
    anulada: 'Anulada',
  }[status] || status
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function getEffectiveIvaPct() {
  const lines = disponibilidad.value.lines.filter((l) => Number(l.ivaPct) > 0)
  if (!lines.length) return 0
  const totalWeight = lines.reduce((s, l) => s + Number(l.disponible || 0), 0)
  if (totalWeight <= 0) {
    return round2(lines.reduce((s, l) => s + Number(l.ivaPct), 0) / lines.length)
  }
  const weighted = lines.reduce((s, l) => s + Number(l.disponible) * Number(l.ivaPct), 0)
  return round2(weighted / totalWeight)
}

function noteBaseAmount() {
  if (form.mdetalle) {
    return round2(lineRows.value.reduce((s, l) => s + (Number(l.vlrAfecta) || 0), 0))
  }
  return round2(form.vlrNota)
}

function applyAutoIva() {
  if (!form.afectaIva || !canAfectaIva.value) {
    form.vlrIva = 0
    return
  }
  if (form.mdetalle) return
  const base = noteBaseAmount()
  const pct = getEffectiveIvaPct()
  form.vlrIva = pct > 0 && base > 0 ? round2(base * pct / 100) : 0
}

function clearAutoTaxes() {
  for (const tax of taxRows.value) {
    tax.vlrImpuesto = 0
  }
}

function applyAutoTaxes() {
  if (!form.afectaImp || !canAfectaImp.value) {
    clearAutoTaxes()
    return
  }
  const base = noteBaseAmount()
  for (const tax of taxRows.value) {
    const disponible = Number(tax.disponible) || 0
    if (disponible <= 0) {
      tax.vlrImpuesto = 0
      continue
    }
    const rate = Number(tax.vlrCalc) || 0
    const calculated = rate > 0 && base > 0 ? round2(base * rate / 100) : 0
    tax.vlrImpuesto = Math.min(calculated, disponible)
  }
}

function onLineAmountChange() {
  applyAutoTaxes()
  recalcTotals()
}

function onMdetalleChange() {
  applyAutoIva()
  applyAutoTaxes()
  recalcTotals()
}

function onAfectaIvaChange(enabled) {
  if (!enabled) {
    form.vlrIva = 0
  } else {
    applyAutoIva()
  }
  recalcTotals()
}

function onAfectaImpChange(enabled) {
  if (!enabled) {
    clearAutoTaxes()
  } else {
    applyAutoTaxes()
  }
  recalcTotals()
}

function onVlrNotaChange() {
  applyAutoIva()
  applyAutoTaxes()
  recalcTotals()
}

function recalcTotals() {
  let vlrNota = 0
  let vlrIva = 0
  let vlrImpuesto = 0

  if (form.mdetalle) {
    for (const line of lineRows.value) {
      vlrNota += Number(line.vlrAfecta) || 0
      if (form.afectaIva) {
        vlrIva += round2((Number(line.vlrAfecta) || 0) * (Number(line.ivaPct) || 0) / 100)
      }
    }
    vlrNota = round2(vlrNota)
    vlrIva = round2(vlrIva)
    if (form.afectaImp) {
      applyAutoTaxes()
    }
  } else {
    vlrNota = round2(form.vlrNota)
    if (form.afectaIva) {
      applyAutoIva()
    }
    vlrIva = form.afectaIva ? round2(form.vlrIva) : 0
  }

  if (form.afectaImp) {
    vlrImpuesto = round2(taxRows.value.reduce((s, t) => s + (Number(t.vlrImpuesto) || 0), 0))
  }

  form.vlrNota = vlrNota
  form.vlrIva = vlrIva
  form.vlrImpuesto = vlrImpuesto
  form.vlrNeto = round2(vlrNota + vlrIva + vlrImpuesto)
}

async function loadDisponibilidad(excludeNotaId = null) {
  disponibilidad.value = await api.cuentasPagar.notas.disponibilidad(props.fcxpId, excludeNotaId)
}

function buildLineRows(existingDetails = []) {
  lineRows.value = disponibilidad.value.lines.map((line) => {
    const existing = existingDetails.find((d) => d.fcxpdId === line.fcxpdId)
    return {
      ...line,
      vlrAfecta: existing?.vlrAfecta ?? 0,
      ivaPct: line.ivaPct ?? 0,
    }
  })
}

function buildTaxRows(existingTaxes = []) {
  taxRows.value = disponibilidad.value.taxes.map((tax) => {
    const existing = existingTaxes.find((t) => t.fcxpiId === tax.fcxpiId)
    return {
      ...tax,
      vlrImpuesto: existing?.vlrImpuesto ?? 0,
    }
  })
}

async function refreshList() {
  loading.value = true
  try {
    notas.value = await api.cuentasPagar.notas.list(props.fcxpId)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudieron cargar las notas' })
    notas.value = []
  } finally {
    loading.value = false
  }
}

function resetForm() {
  selectedNota.value = null
  submissionItems.value = null
  Object.assign(form, emptyForm())
  lineRows.value = []
  taxRows.value = []
}

async function openCreate() {
  resetForm()
  await loadDisponibilidad()
  buildLineRows()
  buildTaxRows()
  enforceToggleAvailability()
  formOpen.value = true
}

async function viewNota(nota) {
  selectedNota.value = nota
  await loadDisponibilidad(nota.status === 'borrador' ? nota.id : null)
  Object.assign(form, {
    cndbcrId: nota.cndbcrId || null,
    tipoNota: nota.tipoNota,
    fechaNota: nota.fechaNota?.slice?.(0, 10) || nota.fechaNota,
    detalle: nota.detalle || '',
    mdetalle: nota.mdetalle,
    afectaIva: nota.afectaIva,
    afectaImp: nota.afectaImp,
    vlrNota: nota.vlrNota,
    vlrIva: nota.vlrIva,
    vlrImpuesto: nota.vlrImpuesto,
    vlrNeto: nota.vlrNeto,
  })
  buildLineRows(nota.details || [])
  buildTaxRows(nota.taxes || [])
  enforceToggleAvailability()
  if (isDraft.value) {
    if (form.afectaIva) applyAutoIva()
    if (form.afectaImp) applyAutoTaxes()
    recalcTotals()
  }
  if (props.detail?.manejaDocSoporte && nota.status !== 'borrador') {
    try {
      submissionItems.value = await api.cuentasPagar.notas.submissions(props.fcxpId, nota.id)
    } catch {
      submissionItems.value = []
    }
  }
  formOpen.value = true
}

function enforceToggleAvailability() {
  if (!canAfectaIva.value) {
    form.afectaIva = false
    form.vlrIva = 0
  }
  if (!canAfectaImp.value) {
    form.afectaImp = false
    clearAutoTaxes()
  }
}

function buildPayload() {
  recalcTotals()
  const payload = {
    cndbcrId: form.cndbcrId,
    tipoNota: form.tipoNota,
    fechaNota: form.fechaNota,
    detalle: form.detalle,
    mdetalle: form.mdetalle,
    afectaIva: form.afectaIva,
    afectaImp: form.afectaImp,
    vlrNota: form.vlrNota,
    vlrIva: form.vlrIva,
    vlrImpuesto: form.vlrImpuesto,
    vlrNeto: form.vlrNeto,
    details: form.mdetalle
      ? lineRows.value
        .filter((l) => Number(l.vlrAfecta) > 0)
        .map((l) => ({ fcxpdId: l.fcxpdId, vlrAfecta: l.vlrAfecta }))
      : [],
    taxes: form.afectaImp
      ? taxRows.value
        .filter((t) => Number(t.vlrImpuesto) > 0)
        .map((t) => ({
          fcxpiId: t.fcxpiId,
          vlrImpuesto: t.vlrImpuesto,
          base: t.base,
          vlrCalc: t.vlrCalc,
        }))
      : [],
  }
  return payload
}

async function saveNota() {
  saving.value = true
  try {
    const payload = buildPayload()
    if (selectedNota.value?.id) {
      selectedNota.value = await api.cuentasPagar.notas.update(props.fcxpId, selectedNota.value.id, payload)
    } else {
      selectedNota.value = await api.cuentasPagar.notas.create(props.fcxpId, payload)
    }
    await refreshList()
    $q.notify({ type: 'positive', message: 'Nota guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo guardar la nota' })
  } finally {
    saving.value = false
  }
}

async function confirmNotaAction() {
  if (isDraft.value) await saveNota()
  confirming.value = true
  try {
    const result = await api.cuentasPagar.notas.confirm(props.fcxpId, selectedNota.value.id)
    selectedNota.value = result.nota
    await refreshList()
    emit('updated', result.fcxp)
    $q.notify({ type: 'positive', message: 'Nota confirmada' })
    if (props.detail?.manejaDocSoporte) {
      submissionItems.value = await api.cuentasPagar.notas.submissions(props.fcxpId, selectedNota.value.id)
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo confirmar la nota' })
  } finally {
    confirming.value = false
  }
}

async function sendDianFromList(nota) {
  sendingDianId.value = nota.id
  try {
    const result = await api.cuentasPagar.notas.sendDian(props.fcxpId, nota.id)
    await refreshList()
    if (result.fcxp) emit('updated', result.fcxp)
    if (selectedNota.value?.id === nota.id) {
      selectedNota.value = result.nota || selectedNota.value
      submissionItems.value = result.submission ? [result.submission] : submissionItems.value
    }
    $q.notify({
      type: result.approved ? 'positive' : 'warning',
      message: result.submission?.statusMessage || (result.approved ? 'Aprobada DIAN' : 'Envío registrado'),
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo enviar a DIAN' })
  } finally {
    sendingDianId.value = null
  }
}

async function sendDian() {
  sendingDian.value = true
  try {
    const result = await api.cuentasPagar.notas.sendDian(props.fcxpId, selectedNota.value.id)
    selectedNota.value = result.nota || selectedNota.value
    submissionItems.value = result.submission ? [result.submission] : submissionItems.value
    await refreshList()
    if (result.fcxp) emit('updated', result.fcxp)
    $q.notify({
      type: result.approved ? 'positive' : 'warning',
      message: result.submission?.statusMessage || (result.approved ? 'Aprobada DIAN' : 'Envío registrado'),
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo enviar a DIAN' })
  } finally {
    sendingDian.value = false
  }
}

async function voidNotaAction() {
  voiding.value = true
  try {
    const result = await api.cuentasPagar.notas.void(props.fcxpId, selectedNota.value.id)
    selectedNota.value = result.nota
    await refreshList()
    emit('updated', result.fcxp)
    $q.notify({ type: 'positive', message: 'Nota anulada' })
    formOpen.value = false
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo anular la nota' })
  } finally {
    voiding.value = false
  }
}

function voidNota() {
  const nota = selectedNota.value
  if (!nota) return
  $q.dialog({
    title: 'Anular nota',
    message: `¿Está seguro de anular la nota ${nota.tipoNota === 'DB' ? 'débito' : 'crédito'} #${nota.item} por ${formatCop(nota.vlrNeto)}? Esta acción no se puede deshacer.`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true },
    ok: { label: 'Sí, anular', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(() => voidNotaAction())
}

// alias for template
const confirmNota = confirmNotaAction
</script>

<style scoped>
.cxp-nota-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cxp-nota-form__full {
  width: 100%;
}

.cxp-nota-form__row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(220px, 2fr) minmax(130px, 0.9fr);
  gap: 12px 14px;
  align-items: start;
}

.cxp-nota-form__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 4px 0;
}

.cxp-nota-form__money {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 14px;
}

.cxp-nota-form__label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
}

@media (max-width: 720px) {
  .cxp-nota-form__row {
    grid-template-columns: 1fr;
  }
}
</style>
