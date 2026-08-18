<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <!-- FACTURAS -->
      <template v-if="tab === 'invoices'">
        <q-table
          :expanded="expandedInvoices"
          class="company-data-table"
          :rows="invoices"
          :columns="invoiceColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingInvoices"
          @update:expanded="setExpandedInvoices"
          @row-click="(_, row) => toggleRowExpand(row.id, expandedInvoices)"
        >
          <template #body="props">
            <q-tr :props="props" class="cursor-pointer">
              <q-td key="actions" :props="props" class="company-data-table__actions" @click.stop>
                <div class="row no-wrap items-center q-gutter-xs">
                  <q-btn flat dense round size="sm" icon="visibility" color="primary" @click="viewInvoice(props.row)">
                    <q-tooltip>Ver detalle</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="props.row.status !== 'borrador'"
                    flat
                    dense
                    round
                    size="sm"
                    icon="picture_as_pdf"
                    color="red-7"
                    @click="openPdf(props.row)"
                  >
                    <q-tooltip>Ver PDF</q-tooltip>
                  </q-btn>
                  <q-btn flat dense round size="sm" icon="history" color="primary" @click="viewDianHistory(props.row)">
                    <q-tooltip>Envíos DIAN</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="props.row.status === 'borrador'"
                    flat
                    dense
                    round
                    size="sm"
                    icon="publish"
                    color="primary"
                    @click="emitInvoice(props.row)"
                  >
                    <q-tooltip>Emitir</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="['emitida', 'rechazada_dian'].includes(props.row.status)"
                    flat
                    dense
                    round
                    size="sm"
                    icon="cloud_upload"
                    color="orange"
                    @click="sendDian(props.row)"
                  >
                    <q-tooltip>Enviar DIAN</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="canVoid(props.row)"
                    flat
                    dense
                    round
                    size="sm"
                    icon="block"
                    color="negative"
                    @click="voidInvoice(props.row)"
                  >
                    <q-tooltip>Anular</q-tooltip>
                  </q-btn>
                </div>
              </q-td>
              <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleRowExpand(props.row.id, expandedInvoices)">
                <q-btn flat dense round size="sm" :icon="props.expand ? 'expand_less' : 'expand_more'" color="grey-7" />
              </q-td>
              <q-td key="fullNumber" :props="props">{{ props.row.fullNumber }}</q-td>
              <q-td key="issueDate" :props="props">{{ formatDate(props.row.issueDate) }}</q-td>
              <q-td key="clientName" :props="props" class="company-data-table__wrap">
                <div class="company-data-table__two-lines">{{ props.row.clientName || '—' }}</div>
              </q-td>
              <q-td key="total" :props="props">${{ formatMoney(props.row.total) }}</q-td>
              <q-td key="status" :props="props">
                <q-badge :color="invoiceStatusColor(props.row.status)">
                  {{ invoiceStatusLabel(props.row.status) }}
                </q-badge>
              </q-td>
            </q-tr>
            <q-tr v-show="props.expand" :props="props" class="company-data-table__expand">
              <q-td colspan="100%">
                <div class="company-data-table__expand-inner">
                  <DocumentExpandPanel
                    :row="props.row"
                    :detail="detailCache[props.row.id]"
                    :loading="detailLoading[props.row.id]"
                  />
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </template>

      <!-- NOTAS CRÉDITO -->
      <template v-else-if="tab === 'credit-notes'">
        <q-btn
          color="primary"
          icon="add"
          label="Nueva nota crédito"
          class="q-mb-md"
          unelevated
          @click="openCreditNoteDialog"
        />
        <q-table
          :expanded="expandedCreditNotes"
          class="company-data-table credit-notes-table"
          :rows="creditNotes"
          :columns="creditNoteColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingCreditNotes"
          @update:expanded="setExpandedCreditNotes"
          @row-click="(_, row) => toggleRowExpand(row.id, expandedCreditNotes)"
        >
          <template #body="props">
            <q-tr :props="props" class="cursor-pointer">
              <q-td key="actions" :props="props" class="company-data-table__actions" @click.stop>
                <div class="row no-wrap items-center q-gutter-xs">
                  <q-btn flat dense round size="sm" icon="visibility" color="primary" @click="viewInvoice(props.row)">
                    <q-tooltip>Ver</q-tooltip>
                  </q-btn>
                  <q-btn flat dense round size="sm" icon="history" color="primary" @click="viewDianHistory(props.row)">
                    <q-tooltip>Envíos DIAN</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="canEditCreditNote(props.row)"
                    flat
                    dense
                    round
                    size="sm"
                    icon="edit"
                    color="primary"
                    @click="openEditCreditNoteDialog(props.row)"
                  >
                    <q-tooltip>Editar</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="canVoidCreditNote(props.row)"
                    flat
                    dense
                    round
                    size="sm"
                    icon="cancel"
                    color="negative"
                    @click="voidCreditNote(props.row)"
                  >
                    <q-tooltip>Anular</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="['emitida', 'rechazada_dian'].includes(props.row.status)"
                    flat
                    dense
                    round
                    size="sm"
                    icon="cloud_upload"
                    color="orange"
                    @click="sendDian(props.row)"
                  >
                    <q-tooltip>Enviar DIAN</q-tooltip>
                  </q-btn>
                </div>
              </q-td>
              <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleRowExpand(props.row.id, expandedCreditNotes)">
                <q-btn flat dense round size="sm" :icon="props.expand ? 'expand_less' : 'expand_more'" color="grey-7" />
              </q-td>
              <q-td key="internalNumber" :props="props">{{ props.row.internalNumber || props.row.fullNumber || '—' }}</q-td>
              <q-td key="creditNoteSequence" :props="props">{{ props.row.creditNoteSequence || '—' }}</q-td>
              <q-td key="sourceFullNumber" :props="props">{{ props.row.sourceFullNumber || '—' }}</q-td>
              <q-td key="concept" :props="props" class="company-data-table__wrap">
                <div class="company-data-table__two-lines">{{ props.row.creditNoteConceptName || '—' }}</div>
                <div v-if="props.row.creditNoteScope" class="text-caption text-grey-7">
                  {{ props.row.creditNoteScope === 'total' ? 'Total' : 'Parcial' }}
                </div>
              </q-td>
              <q-td key="issueDate" :props="props">{{ formatDate(props.row.issueDate) }}</q-td>
              <q-td key="clientName" :props="props" class="company-data-table__wrap">
                <div class="company-data-table__two-lines">{{ props.row.clientName || '—' }}</div>
              </q-td>
              <q-td key="total" :props="props">${{ formatMoney(props.row.total) }}</q-td>
              <q-td key="status" :props="props">
                <q-badge :color="invoiceStatusColor(props.row.status)">
                  {{ invoiceStatusLabel(props.row.status) }}
                </q-badge>
              </q-td>
            </q-tr>
            <q-tr v-show="props.expand" :props="props" class="company-data-table__expand">
              <q-td colspan="100%">
                <div class="company-data-table__expand-inner">
                  <DocumentExpandPanel
                    :row="props.row"
                    :detail="detailCache[props.row.id]"
                    :loading="detailLoading[props.row.id]"
                    credit-note
                  />
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </template>

      <!-- SEGUIMIENTO DIAN -->
      <template v-else-if="tab === 'dian-tracking'">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-4">
            <q-select
              v-model="dianFilter.status"
              :options="dianStatusOptions"
              label="Estado"
              outlined
              dense
              clearable
              emit-value
              map-options
              @update:model-value="loadDianSubmissions"
            />
          </div>
        </div>
        <q-table
          class="company-data-table"
          :rows="dianSubmissions"
          :columns="dianColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingDian"
        >
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="receipt_long"
                color="primary"
                @click="goToInvoice(props.row.invoiceId)"
              >
                <q-tooltip>Ver documento</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #body-cell-createdAt="props">
            <q-td :props="props">{{ formatDate(props.row.createdAt) }}</q-td>
          </template>
          <template #body-cell-invoiceNumber="props">
            <q-td :props="props">{{ props.row.invoiceNumber || '—' }}</q-td>
          </template>
          <template #body-cell-clientName="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.clientName || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="dianStatusColor(props.row.status)">{{ props.row.status }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-statusMessage="props">
            <q-td :props="props" class="company-data-table__wrap">
              <span class="company-data-table__two-lines text-negative">{{ props.row.statusMessage || '—' }}</span>
            </q-td>
          </template>
        </q-table>
      </template>
    </div>

    <!-- Ver factura / NC -->
    <CompanyFormDialog v-model="viewDialog" :title="viewDialogTitle" icon="visibility" wide document-view>
      <template v-if="selectedInvoice">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-7">
            <div class="text-subtitle1 text-weight-medium">{{ selectedInvoice.fullNumber }}</div>
            <div class="text-caption text-grey-7">
              {{ selectedInvoice.clientName }} — {{ invoiceStatusLabel(selectedInvoice.status) }}
            </div>
            <div v-if="selectedInvoice.sourceFullNumber || selectedInvoice.sourceInvoiceFullNumber" class="text-caption q-mt-xs">
              Origen:
              {{ selectedInvoice.sourceInvoiceFullNumber || selectedInvoice.sourceFullNumber || selectedInvoice.sourceInternalNumber }}
              <span v-if="selectedInvoice.sourceInvoicePrefix && selectedInvoice.sourceInvoiceConsecutive">
                ({{ selectedInvoice.sourceInvoicePrefix }} · CNS {{ selectedInvoice.sourceInvoiceConsecutive }})
              </span>
            </div>
            <div v-if="selectedInvoice.creditNoteConceptName" class="text-caption q-mt-xs">
              Concepto DIAN: {{ selectedInvoice.creditNoteConceptName }}
              <span v-if="selectedInvoice.creditNoteScope">
                ({{ selectedInvoice.creditNoteScope === 'total' ? 'Total' : 'Parcial' }})
              </span>
            </div>
          </div>
          <div class="col-12 col-md-5 text-md-right">
            <div class="text-h6">${{ formatMoney(selectedInvoice.total) }}</div>
            <div v-if="selectedInvoice.cufe" class="text-caption text-break-word">
              CUFE/CUDE: {{ selectedInvoice.cufe }}
            </div>
          </div>
        </div>

        <q-markup-table flat bordered dense class="q-mb-md">
          <thead>
            <tr><th>#</th><th>Descripción</th><th class="text-right">Total</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in selectedInvoice.details" :key="d.id">
              <td>{{ d.lineNumber }}</td>
              <td>{{ d.description }}</td>
              <td class="text-right">${{ formatMoney(d.lineTotal) }}</td>
            </tr>
          </tbody>
        </q-markup-table>

        <div class="text-subtitle2 q-mb-sm">Seguimiento DIAN</div>
        <DianSubmissionsPanel :invoice-id="selectedInvoice.id" :items="selectedInvoice.submissions" />
      </template>
      <template #actions>
        <q-btn
          v-if="selectedInvoice && selectedInvoice.status !== 'borrador'"
          flat
          icon="picture_as_pdf"
          label="Ver PDF"
          color="red-7"
          @click="openPdf(selectedInvoice)"
        />
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
      </template>
    </CompanyFormDialog>

    <!-- Solo historial DIAN -->
    <CompanyFormDialog v-model="dianDialog" title="Envíos a la DIAN" icon="cloud_sync" document-view>
      <DianSubmissionsPanel :invoice-id="dianInvoiceId" />
      <template #actions>
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
      </template>
    </CompanyFormDialog>

    <!-- Nueva nota crédito -->
    <CompanyFormDialog
      v-model="creditDialog"
      :title="creditDialogTitle"
      icon="undo"
      wide
      credit-note
    >
      <div class="credit-note-form">
        <q-select
          v-model="creditForm.sourceInvoiceId"
          class="credit-note-form__full"
          :options="invoiceOptions"
          label="Factura origen *"
          outlined
          dense
          emit-value
          map-options
          :disable="Boolean(creditForm.editingId)"
          @update:model-value="onSourceInvoicePick"
        />
        <q-banner
          v-if="creditForm.sourceResolutionLabel"
          dense
          rounded
          class="bg-blue-1 text-blue-10 credit-note-form__full"
        >
          Resolución DIAN de la factura origen: {{ creditForm.sourceResolutionLabel }}.
          La NC usa su propio CNS (NC-000001) y se vincula a la factura por CUFE.
          <span v-if="nextCreditNoteSequenceLabel">
            Será la NC #{{ nextCreditNoteSequenceLabel }} de esta factura.
          </span>
        </q-banner>
        <q-banner
          v-if="creditForm.sourceCreditSummary?.creditNotes?.length"
          dense
          rounded
          class="bg-grey-2 credit-note-form__full"
        >
          NC previas:
          <span
            v-for="(nc, idx) in creditForm.sourceCreditSummary.creditNotes"
            :key="nc.id"
          >
            {{ idx ? ', ' : '' }}{{ nc.internalNumber || nc.fullNumber }}
            ({{ formatMoney(nc.total) }}, {{ invoiceStatusLabel(nc.status) }})
          </span>.
          Saldo disponible:
          {{ formatMoney(creditForm.sourceCreditSummary.remainingTotal) }}
        </q-banner>
        <q-select
          v-model="creditForm.conceptCode"
          :options="creditConceptOptions"
          label="Concepto DIAN *"
          outlined
          dense
          emit-value
          map-options
          options-dense
          @update:model-value="onConceptPick"
        />
        <q-select
          v-if="showCreditScopePicker"
          v-model="creditForm.scope"
          :options="creditScopeOptions"
          label="Alcance *"
          outlined
          dense
          emit-value
          map-options
        />
        <q-expansion-item
          v-if="creditNoteConcepts.length"
          dense
          icon="info"
          label="Catálogo DIAN — conceptos de nota crédito"
          header-class="text-primary credit-note-form__full"
          class="credit-note-form__full"
        >
          <q-markup-table flat bordered dense class="q-ma-sm">
            <thead>
              <tr>
                <th>Cód.</th>
                <th>Concepto</th>
                <th>Alcance</th>
                <th>Homologación UBL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in creditNoteConcepts" :key="c.code">
                <td>{{ c.code }}</td>
                <td>{{ c.name }}</td>
                <td>{{ creditScopeLabel(c.scope) }}</td>
                <td class="text-caption">
                  CustomizationID {{ c.dianCustomizationId }} · Tipo {{ c.dianDocumentTypeCode }}
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-expansion-item>
        <div class="text-subtitle2 credit-note-form__full q-mt-xs">Líneas a acreditar</div>
        <div class="credit-note-form__full credit-note-form__lines-table">
          <q-markup-table flat bordered dense class="q-mb-sm">
            <thead>
              <tr><th>Servicio</th><th>Cant.</th><th>Precio</th><th>IVA %</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in creditForm.lines" :key="idx">
                <td>
                  <q-select
                    v-model="line.serviceId"
                    :options="serviceOptions"
                    dense
                    outlined
                    emit-value
                    map-options
                    options-dense
                    @update:model-value="(v) => onServicePick(line, v)"
                  />
                </td>
                <td>
                  <q-input v-model.number="line.quantity" type="number" dense outlined min="1" style="width: 80px" />
                </td>
                <td>
                  <q-input v-model.number="line.unitPrice" type="number" dense outlined style="width: 120px" />
                </td>
                <td>
                  <q-input v-model.number="line.taxRate" type="number" dense outlined style="width: 80px" />
                </td>
                <td>
                  <q-btn flat dense icon="delete" color="negative" @click="creditForm.lines.splice(idx, 1)" />
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </div>
        <q-btn
          flat
          icon="add"
          label="Agregar línea"
          color="primary"
          class="credit-note-form__full"
          @click="addCreditLine"
        />
        <q-input
          v-model="creditForm.notes"
          class="credit-note-form__full"
          label="Motivo / observaciones"
          outlined
          dense
          type="textarea"
          rows="2"
          autogrow
        />
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn
          color="primary"
          icon="save"
          :label="creditForm.editingId ? 'Guardar cambios' : 'Crear y emitir'"
          :loading="saving"
          unelevated
          @click="saveCreditNote"
        />
      </template>
    </CompanyFormDialog>

    <InvoicePdfDialog
      v-model="pdfDialogOpen"
      :invoice-id="pdfInvoiceId"
      :title="pdfDialogTitle"
    />
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import DianSubmissionsPanel from 'src/components/company/DianSubmissionsPanel.vue'
import DocumentExpandPanel from 'src/components/company/DocumentExpandPanel.vue'
import InvoicePdfDialog from 'src/components/company/InvoicePdfDialog.vue'
import { formatDate } from 'src/utils/date-format.js'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()

const validTabs = ['invoices', 'credit-notes', 'dian-tracking']
const tab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'invoices')

const pageMetaMap = {
  invoices: { title: 'Facturas', icon: 'receipt' },
  'credit-notes': { title: 'Notas crédito', icon: 'undo' },
  'dian-tracking': { title: 'Seguimiento DIAN', icon: 'cloud_sync' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.invoices)

const expandedInvoices = ref([])
const expandedCreditNotes = ref([])
const detailCache = reactive({})
const detailLoading = reactive({})

const loadingInvoices = ref(false)
const loadingCreditNotes = ref(false)
const loadingDian = ref(false)
const saving = ref(false)

const invoices = ref([])
const creditNotes = ref([])
const creditNoteConcepts = ref([])
const dianSubmissions = ref([])
const services = ref([])
const resolutions = ref([])

const viewDialog = ref(false)
const dianDialog = ref(false)
const creditDialog = ref(false)
const selectedInvoice = ref(null)
const dianInvoiceId = ref('')
const pdfDialogOpen = ref(false)
const pdfInvoiceId = ref('')
const pdfDialogTitle = ref('Representación gráfica')

const dianFilter = reactive({ status: null })

const creditForm = reactive({
  editingId: null,
  sourceInvoiceId: null,
  sourceResolutionLabel: '',
  sourceCreditSummary: null,
  conceptCode: '1',
  scope: 'parcial',
  notes: '',
  lines: [],
})

const invoiceColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 168px' },
  { name: 'expand', label: '', field: 'expand', align: 'center', style: 'width: 36px' },
  { name: 'fullNumber', label: 'Número', field: 'fullNumber', align: 'left', style: 'width: 120px' },
  { name: 'issueDate', label: 'Fecha', field: 'issueDate', align: 'left', style: 'width: 92px' },
  { name: 'clientName', label: 'Cliente', field: 'clientName', align: 'left', style: 'max-width: 220px' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', style: 'width: 100px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width: 110px' },
]

const creditNoteColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 168px' },
  { name: 'expand', label: '', field: 'expand', align: 'center', style: 'width: 36px' },
  { name: 'internalNumber', label: 'CNS', field: 'internalNumber', align: 'left', style: 'width: 96px' },
  { name: 'creditNoteSequence', label: 'NC #', field: (row) => row.creditNoteSequence || '—', align: 'center', style: 'width: 56px' },
  { name: 'sourceFullNumber', label: 'Factura origen', field: 'sourceFullNumber', align: 'left', style: 'width: 120px' },
  { name: 'concept', label: 'Concepto DIAN', field: 'creditNoteConceptName', align: 'left', style: 'max-width: 220px' },
  { name: 'issueDate', label: 'Fecha', field: 'issueDate', align: 'left', style: 'width: 92px' },
  { name: 'clientName', label: 'Cliente', field: 'clientName', align: 'left', style: 'max-width: 200px' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', style: 'width: 100px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width: 110px' },
]

const dianColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'createdAt', label: 'Fecha', field: 'createdAt', align: 'left', style: 'width: 100px' },
  { name: 'invoiceNumber', label: 'Documento', field: 'invoiceNumber', align: 'left', style: 'width: 130px' },
  { name: 'clientName', label: 'Cliente', field: 'clientName', align: 'left', style: 'max-width: 200px' },
  { name: 'attemptNumber', label: 'Intento', field: 'attemptNumber', align: 'center', style: 'width: 72px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width: 100px' },
  { name: 'statusMessage', label: 'Mensaje / error', field: 'statusMessage', align: 'left', style: 'max-width: 280px' },
]

const dianStatusOptions = [
  { label: 'Pendiente', value: 'pendiente' },
  { label: 'Enviado', value: 'enviado' },
  { label: 'Aprobado', value: 'aprobado' },
  { label: 'Rechazado', value: 'rechazado' },
  { label: 'Error', value: 'error' },
]

const blockedSourceInvoiceIds = computed(() => {
  const blocked = new Set()
  for (const nc of creditNotes.value) {
    if (
      nc.sourceInvoiceId
      && nc.creditNoteConceptCode === '2'
      && nc.creditNoteScope === 'total'
      && nc.status === 'aprobada_dian'
    ) {
      blocked.add(nc.sourceInvoiceId)
    }
  }
  return blocked
})

const invoiceOptions = computed(() =>
  invoices.value
    .filter((i) => ['emitida', 'enviada_dian', 'aprobada_dian', 'rechazada_dian'].includes(i.status))
    .filter((i) => !blockedSourceInvoiceIds.value.has(i.id))
    .map((i) => ({ label: `${i.fullNumber} — ${i.clientName}`, value: i.id }))
)

const nextCreditNoteSequenceLabel = computed(() => {
  const summary = creditForm.sourceCreditSummary
  if (!summary) return null
  return (summary.creditNotes?.length || 0) + 1
})

const serviceOptions = computed(() =>
  services.value
    .filter((s) => s.isActive)
    .map((s) => ({
      label: `${s.code} — ${s.description}`,
      value: s.id,
    }))
)

const creditConceptOptions = computed(() =>
  creditNoteConcepts.value.map((c) => ({
    label: `${c.code} — ${c.name}`,
    value: c.code,
  }))
)

const selectedCreditConcept = computed(() =>
  creditNoteConcepts.value.find((c) => c.code === creditForm.conceptCode)
)

const showCreditScopePicker = computed(() => selectedCreditConcept.value?.scope === 'ambos')

const creditScopeOptions = [
  { label: 'Parcial', value: 'parcial' },
  { label: 'Total', value: 'total' },
]

const viewDialogTitle = computed(() =>
  selectedInvoice.value?.documentKind === 'nota_credito' ? 'Nota crédito' : 'Factura'
)

const creditDialogTitle = computed(() => {
  if (creditForm.editingId) {
    return 'Editar nota crédito'
  }
  return 'Nueva nota crédito'
})

watch(tab, (value) => {
  if (route.query.tab !== value) router.replace({ query: { tab: value } })
  if (value === 'dian-tracking') loadDianSubmissions()
})

watch(
  () => route.query.tab,
  (value) => {
    if (validTabs.includes(value) && value !== tab.value) tab.value = value
  }
)

watch(expandedInvoices, (ids) => {
  for (const id of ids) loadDetailIfNeeded(id)
})

watch(expandedCreditNotes, (ids) => {
  for (const id of ids) loadDetailIfNeeded(id)
})

async function loadDetailIfNeeded(id) {
  if (!id || detailCache[id] || detailLoading[id]) return
  detailLoading[id] = true
  try {
    detailCache[id] = await api.ventas.invoice(id)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    detailLoading[id] = false
  }
}

function toggleRowExpand(id, expandedRef) {
  const idx = expandedRef.indexOf(id)
  if (idx >= 0) expandedRef.splice(idx, 1)
  else expandedRef.push(id)
}

function setExpandedInvoices(val) {
  expandedInvoices.value = val
}

function setExpandedCreditNotes(val) {
  expandedCreditNotes.value = val
}

onMounted(async () => {
  await loadInvoices()
  await loadCreditNotes()
  await loadCatalog()
  if (tab.value === 'dian-tracking') await loadDianSubmissions()
})

async function loadCatalog() {
  ;[services.value, resolutions.value, creditNoteConcepts.value] = await Promise.all([
    api.ventas.services(),
    api.ventas.resolutions(),
    api.ventas.creditNoteConcepts(),
  ])
}

async function loadInvoices() {
  loadingInvoices.value = true
  try {
    invoices.value = await api.ventas.invoices({ kind: 'factura' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loadingInvoices.value = false
  }
}

async function loadCreditNotes() {
  loadingCreditNotes.value = true
  try {
    creditNotes.value = await api.ventas.creditNotes()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loadingCreditNotes.value = false
  }
}

async function loadDianSubmissions() {
  loadingDian.value = true
  try {
    const params = {}
    if (dianFilter.status) params.status = dianFilter.status
    dianSubmissions.value = await api.ventas.allSubmissions(params)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loadingDian.value = false
  }
}

function canVoid(row) {
  if (row.documentKind === 'factura') {
    return row.status === 'aprobada_dian' || row.status === 'anulada'
  }
  return false
}

async function viewInvoice(row) {
  selectedInvoice.value = await api.ventas.invoice(row.id)
  viewDialog.value = true
}

function openPdf(row) {
  if (!row?.id) return
  pdfInvoiceId.value = row.id
  pdfDialogTitle.value = `Factura ${row.fullNumber || row.internalNumber || ''}`.trim()
  pdfDialogOpen.value = true
}

function viewDianHistory(row) {
  dianInvoiceId.value = row.id
  dianDialog.value = true
}

async function goToInvoice(id) {
  selectedInvoice.value = await api.ventas.invoice(id)
  viewDialog.value = true
}

async function emitInvoice(row) {
  try {
    await api.ventas.emitInvoice(row.id)
    await loadInvoices()
    $q.notify({ type: 'positive', message: 'Factura emitida' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function sendDian(row) {
  const docLabel = row.fullNumber || row.internalNumber || 'Documento'
  $q.loading.show({ message: `Enviando ${docLabel} a la DIAN...` })

  try {
    const res = await api.ventas.sendDian(row.id)
    await loadInvoices()
    await loadCreditNotes()
    if (tab.value === 'dian-tracking') await loadDianSubmissions()

    const submission = res.submission
    let type = 'positive'
    let message = `${docLabel} enviada a la DIAN`

    if (submission?.isSuccess) {
      message = `${docLabel} enviada y aprobada por la DIAN`
      type = 'positive'
    } else if (submission?.status === 'enviado') {
      message = `${docLabel} enviada a la DIAN. Validación en proceso.`
      type = 'info'
    } else if (res.message) {
      message = `${docLabel} enviada a la DIAN. ${res.message}`
      type = 'warning'
    }

    $q.notify({ type, message, timeout: 7000 })
  } catch (e) {
    await loadInvoices()
    await loadCreditNotes()
    if (tab.value === 'dian-tracking') await loadDianSubmissions()

    const submission = e.details?.submission
    if (e.status === 202 || submission?.status === 'enviado') {
      $q.notify({
        type: 'info',
        message: `${docLabel} enviada a la DIAN. Validación en proceso.`,
        timeout: 7000,
      })
    } else if (submission) {
      $q.notify({
        type: submission.isSuccess ? 'positive' : 'warning',
        message: submission.isSuccess
          ? `${docLabel} enviada y aprobada por la DIAN`
          : `${docLabel} enviada a la DIAN. ${e.message}`,
        timeout: 7000,
      })
    } else {
      $q.notify({ type: 'negative', message: e.message })
    }
  } finally {
    $q.loading.hide()
  }
}

function voidInvoice(row) {
  const isRetry = row.status === 'anulada'
  $q.dialog({
    title: isRetry ? 'Reintentar anulación' : 'Anular factura',
    message: isRetry
      ? `La factura ${row.fullNumber} quedó anulada sin nota crédito. ¿Crear NC y enviar a DIAN?`
      : `¿Anular ${row.fullNumber}? Se creará una nota crédito y se enviará automáticamente a la DIAN.`,
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: isRetry ? 'Reintentar' : 'Anular', icon: 'block' },
    persistent: true,
  }).onOk(async () => {
    $q.loading.show({ message: `Anulando ${row.fullNumber} — creando nota crédito y enviando a DIAN...` })
    try {
      const res = await api.ventas.voidInvoice(row.id)
      await loadInvoices()
      await loadCreditNotes()
      if (tab.value === 'dian-tracking') await loadDianSubmissions()

      const nc = res.creditNote
      let type = 'positive'
      let message = res.message || 'Factura anulada'

      if (nc?.status === 'enviada_dian' || res.pending) {
        type = 'info'
        message = res.message || `Nota crédito ${nc?.fullNumber} en validación DIAN`
      } else if (nc?.status === 'rechazada_dian' || res.error) {
        type = 'warning'
        message = res.message || res.error || 'Nota crédito rechazada por DIAN'
      }

      $q.notify({ type, message, timeout: 8000 })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      $q.loading.hide()
    }
  })
}

function openCreditNoteDialog() {
  if (!invoiceOptions.value.length) {
    $q.notify({ type: 'warning', message: 'No hay facturas emitidas para acreditar' })
    return
  }
  creditForm.editingId = null
  creditForm.sourceInvoiceId = invoiceOptions.value[0].value
  creditForm.conceptCode = '1'
  creditForm.scope = 'parcial'
  creditForm.notes = ''
  creditForm.lines = [{ serviceId: null, quantity: 1, unitPrice: 0, taxRate: 19 }]
  onConceptPick('1')
  onSourceInvoicePick(creditForm.sourceInvoiceId)
  creditDialog.value = true
}

async function openEditCreditNoteDialog(row) {
  if (!canEditCreditNote(row)) return
  try {
    const nc = await api.ventas.invoice(row.id)
    creditForm.editingId = nc.id
    creditForm.sourceInvoiceId = nc.sourceInvoiceId
    creditForm.conceptCode = nc.creditNoteConceptCode || '1'
    creditForm.scope = nc.creditNoteScope || 'parcial'
    creditForm.notes = nc.notes || ''
    creditForm.lines = nc.details.map((d) => ({
      serviceId: d.serviceId,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
      taxRate: d.taxRate,
    }))
    onConceptPick(creditForm.conceptCode)
    await onSourceInvoicePick(nc.sourceInvoiceId)
    creditDialog.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function onConceptPick(code) {
  const concept = creditNoteConcepts.value.find((c) => c.code === code)
  if (!concept) return
  if (concept.scope === 'total') creditForm.scope = 'total'
  else if (concept.scope === 'parcial') creditForm.scope = 'parcial'
}

async function onSourceInvoicePick(id) {
  creditForm.sourceCreditSummary = null
  if (!id) {
    creditForm.sourceResolutionLabel = ''
    return
  }
  const [inv, summary] = await Promise.all([
    api.ventas.invoice(id),
    api.ventas.invoiceCreditNotes(id),
  ])
  creditForm.sourceCreditSummary = summary
  const res = resolutions.value.find((r) => r.id === inv.dianResolutionId)
  creditForm.sourceResolutionLabel = res
    ? `${res.prefix} — Res. ${res.resolutionNumber}`
    : '—'
  if (!creditForm.editingId) {
    creditForm.lines = inv.details.map((d) => ({
      serviceId: d.serviceId,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
      taxRate: d.taxRate,
    }))
  }
}

function addCreditLine() {
  creditForm.lines.push({ serviceId: null, quantity: 1, unitPrice: 0, taxRate: 19 })
}

function onServicePick(line, serviceId) {
  const svc = services.value.find((s) => s.id === serviceId)
  if (svc) line.unitPrice = svc.basePrice
}

function canEditCreditNote(row) {
  return row.documentKind === 'nota_credito'
    && row.status !== 'aprobada_dian'
    && row.status !== 'anulada'
}

function canVoidCreditNote(row) {
  return canEditCreditNote(row)
}

function voidCreditNote(row) {
  const label = row.internalNumber || row.fullNumber || 'Nota crédito'
  $q.dialog({
    title: 'Anular nota crédito',
    message: `¿Anular ${label}? Solo aplica si no ha sido aprobada por la DIAN.`,
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Anular', icon: 'cancel' },
    persistent: true,
  }).onOk(async () => {
    try {
      await api.ventas.voidCreditNote(row.id)
      await loadCreditNotes()
      $q.notify({ type: 'positive', message: `${label} anulada` })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

async function saveCreditNote() {
  if (!creditForm.conceptCode) {
    $q.notify({ type: 'warning', message: 'Seleccione el concepto DIAN' })
    return
  }
  saving.value = true
  try {
    if (creditForm.editingId) {
      await api.ventas.updateCreditNote(creditForm.editingId, {
        conceptCode: creditForm.conceptCode,
        scope: creditForm.scope,
        notes: creditForm.notes,
        lines: creditForm.lines,
      })
      creditDialog.value = false
      creditForm.editingId = null
      await loadCreditNotes()
      $q.notify({ type: 'positive', message: 'Nota crédito actualizada' })
      return
    }

    const nc = await api.ventas.createCreditNote({
      sourceInvoiceId: creditForm.sourceInvoiceId,
      conceptCode: creditForm.conceptCode,
      scope: creditForm.scope,
      notes: creditForm.notes,
      lines: creditForm.lines,
      emit: true,
    })
    creditDialog.value = false
    await loadCreditNotes()
    $q.loading.show({ message: `Enviando nota crédito ${nc.fullNumber} a DIAN...` })
    try {
      const res = await api.ventas.sendDian(nc.id)
      $q.notify({
        type: res.submission?.isSuccess ? 'positive' : 'info',
        message: res.message || 'Nota crédito enviada a DIAN',
        timeout: 7000,
      })
    } catch (e) {
      $q.notify({ type: 'warning', message: `NC creada pero DIAN: ${e.message}` })
    } finally {
      $q.loading.hide()
    }
    await loadCreditNotes()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function creditScopeLabel(scope) {
  return { parcial: 'Parcial', total: 'Total', ambos: 'Parcial o total' }[scope] || scope
}

function invoiceStatusColor(s) {
  return {
    borrador: 'grey',
    emitida: 'blue',
    enviada_dian: 'orange',
    aprobada_dian: 'positive',
    rechazada_dian: 'negative',
    anulada: 'dark',
    convertida: 'positive',
  }[s] || 'grey'
}

function invoiceStatusLabel(s) {
  return {
    borrador: 'Borrador',
    emitida: 'Emitida',
    enviada_dian: 'Enviada DIAN',
    aprobada_dian: 'Aprobada DIAN',
    rechazada_dian: 'Rechazada',
    anulada: 'Anulada',
    convertida: 'Convertida',
  }[s] || s
}

function dianStatusColor(s) {
  return {
    pendiente: 'orange',
    enviado: 'blue',
    aprobado: 'positive',
    rechazado: 'negative',
    error: 'negative',
  }[s] || 'grey'
}
</script>
