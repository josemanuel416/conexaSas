<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      :title="pageMeta.title"
      :icon="pageMeta.icon"
      :subtitle="pageMeta.subtitle"
    />

    <div class="company-page-card">
      <div class="q-mb-md">
        <q-btn
          color="primary"
          icon="add"
          :label="tab === 'cotizaciones' ? 'Nueva cotización' : 'Nueva prefactura'"
          unelevated
          @click="openDocumentDialog(tab === 'cotizaciones' ? 'cotizacion' : 'prefactura')"
        />
      </div>

      <q-table
        :expanded="expanded"
        class="company-data-table"
        :rows="currentDocuments"
        :columns="tableColumns(tab)"
        row-key="id"
        flat
        bordered
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        @update:expanded="setExpanded"
        @row-click="(_, row) => toggleRowExpand(row.id)"
      >
        <template #no-data>
          <div class="full-width column items-center q-pa-xl text-grey-6">
            <q-icon :name="pageMeta.icon" size="48px" class="q-mb-sm" />
            <div class="text-subtitle2">
              No hay {{ tab === 'cotizaciones' ? 'cotizaciones' : 'prefacturas' }} registradas
            </div>
            <div class="text-caption q-mb-md">Cree la primera para iniciar el proceso de venta.</div>
            <q-btn
              color="primary"
              icon="add"
              :label="tab === 'cotizaciones' ? 'Nueva cotización' : 'Nueva prefactura'"
              unelevated
              @click="openDocumentDialog(tab === 'cotizaciones' ? 'cotizacion' : 'prefactura')"
            />
          </div>
        </template>
        <template #body="props">
          <q-tr :props="props" class="cursor-pointer">
            <q-td key="actions" :props="props" class="company-data-table__actions" @click.stop>
              <div class="row no-wrap items-center q-gutter-xs">
                <q-btn flat dense round size="sm" icon="visibility" color="primary" @click="viewDocument(props.row)">
                  <q-tooltip>Ver</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="canViewDocumentPdf(props.row)"
                  flat
                  dense
                  round
                  size="sm"
                  icon="picture_as_pdf"
                  color="red-8"
                  @click="openDocumentPdf(props.row)"
                >
                  <q-tooltip>Ver PDF</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="canEditDocument(props.row)"
                  flat
                  dense
                  round
                  size="sm"
                  icon="edit"
                  color="primary"
                  @click="editDocument(props.row)"
                >
                  <q-tooltip>Editar</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="canConfirmCotizacion(props.row)"
                  flat
                  dense
                  round
                  size="sm"
                  icon="check_circle"
                  color="positive"
                  @click="confirmCotizacion(props.row)"
                >
                  <q-tooltip>Confirmar</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="canSendCotizacion(props.row)"
                  flat
                  dense
                  round
                  size="sm"
                  icon="mail"
                  color="secondary"
                  @click="openSendDialog(props.row)"
                >
                  <q-tooltip>Enviar al cliente</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="canFacturarDocument(props.row)"
                  flat
                  dense
                  round
                  size="sm"
                  icon="receipt_long"
                  color="primary"
                  @click="openConvertDialog(props.row)"
                >
                  <q-tooltip>Facturar</q-tooltip>
                </q-btn>
              </div>
            </q-td>
            <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleRowExpand(props.row.id)">
              <q-btn flat dense round size="sm" :icon="props.expand ? 'expand_less' : 'expand_more'" color="grey-7" />
            </q-td>
            <q-td key="internalNumber" :props="props">{{ props.row.internalNumber }}</q-td>
            <q-td key="issueDate" :props="props">{{ formatDate(props.row.issueDate) }}</q-td>
            <q-td key="clientName" :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.clientName || '—' }}</div>
            </q-td>
            <q-td key="dueDate" :props="props">{{ formatDate(props.row.dueDate) }}</q-td>
            <q-td key="total" :props="props">${{ formatMoney(props.row.total) }}</q-td>
            <q-td key="status" :props="props">
              <q-badge :color="docStatusColor(props.row.status, props.row.documentKind)">
                {{ docStatusLabel(props.row.status, props.row.documentKind) }}
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
    </div>

    <CompanyFormDialog
      v-model="docDialog"
      :title="docDialogTitle"
      :icon="docForm.kind === 'cotizacion' ? 'request_quote' : 'description'"
      wide
      sales-document
    >
      <q-banner v-if="docSaveError" class="bg-red-1 text-negative q-mb-md" dense rounded>
        <template #avatar>
          <q-icon name="error" color="negative" />
        </template>
        {{ docSaveError }}
      </q-banner>

      <div class="sales-doc-header q-mb-lg">
        <q-select
          v-model="docForm.clientId"
          :options="clientOptions"
          label="Cliente *"
          outlined
          dense
          emit-value
          map-options
          use-input
          input-debounce="0"
          hide-bottom-space
          @filter="filterClients"
        />
        <q-input
          v-model="docForm.dueDate"
          type="date"
          :label="docForm.kind === 'cotizacion' ? 'Válida hasta' : 'Vencimiento'"
          outlined
          dense
          hide-bottom-space
        />
      </div>

      <div v-if="docForm.kind === 'cotizacion'" class="q-mb-md">
        <div class="text-caption text-grey-7 q-mb-xs">Tipo de ítems</div>
        <q-option-group
          v-model="lineItemMode"
          :options="lineItemModeOptions"
          type="radio"
          inline
          dense
        />
      </div>

      <div class="sales-doc-section-title">
        <q-icon name="list_alt" size="xs" class="q-mr-xs" /> {{ detailSectionTitle }}
      </div>

      <div class="sales-doc-lines" :class="{ 'sales-doc-lines--with-type': showLineTypeColumn }">
        <div class="sales-doc-lines__head">
          <span v-if="showLineTypeColumn">Tipo</span>
          <span>{{ lineItemColumnLabel }}</span>
          <span>Cant.</span>
          <span>Precio unit.</span>
          <span>IVA %</span>
          <span class="text-right">Subtotal</span>
          <span></span>
        </div>
        <div v-for="(line, idx) in docForm.lines" :key="idx" class="sales-doc-lines__row">
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
          <q-input
            v-model.number="line.quantity"
            type="number"
            dense
            outlined
            min="1"
            hide-bottom-space
          />
          <MoneyInput v-model="line.unitPrice" label="Precio" />
          <q-input
            v-model.number="line.taxRate"
            type="number"
            dense
            outlined
            min="0"
            hide-bottom-space
          />
          <div class="sales-doc-lines__subtotal">${{ formatMoney(lineCalc(line).lineTotal) }}</div>
          <div class="col-actions">
            <q-btn
              flat
              dense
              round
              icon="delete"
              color="negative"
              :disable="docForm.lines.length === 1"
              @click="docForm.lines.splice(idx, 1)"
            />
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

      <div class="sales-doc-summary">
        <div class="sales-doc-summary__box">
          <div class="sales-doc-summary__row">
            <span>Subtotal</span>
            <span>${{ formatMoney(docTotals.base) }}</span>
          </div>
          <div class="sales-doc-summary__row">
            <span>IVA</span>
            <span>${{ formatMoney(docTotals.tax) }}</span>
          </div>
          <div class="sales-doc-summary__row sales-doc-summary__row--total">
            <span>Total</span>
            <span>${{ formatMoney(docTotals.total) }}</span>
          </div>
        </div>
      </div>

      <q-input
        v-model="docForm.notes"
        class="q-mt-md"
        label="Observaciones"
        outlined
        dense
        type="textarea"
        autogrow
      />
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar borrador" :loading="saving" unelevated @click="saveDocument(false)" />
        <q-btn
          v-if="docForm.kind !== 'cotizacion'"
          color="grey-8"
          icon="send"
          label="Emitir"
          :loading="saving"
          unelevated
          @click="saveDocument(true)"
        />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog v-model="convertDialog" title="Generar factura" icon="receipt_long" wide sales-document>
      <div class="q-gutter-md">
        <q-banner dense rounded class="bg-blue-1 text-blue-10">
          Se creará una factura electrónica a partir de
          <strong>{{ convertTarget?.internalNumber }}</strong>
          por ${{ formatMoney(convertTarget?.total) }}.
        </q-banner>
        <q-select
          v-model="convertForm.dianResolutionId"
          :options="invoiceResolutionOptions"
          label="Resolución DIAN (factura) *"
          outlined
          dense
          emit-value
          map-options
        />
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="receipt_long" label="Facturar" :loading="saving" unelevated @click="convertToInvoice" />
      </template>
    </CompanyFormDialog>

    <q-dialog v-model="sendDialog" persistent>
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">Enviar cotización al cliente</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            {{ sendTarget?.internalNumber }} — {{ sendTarget?.clientName }}
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none q-gutter-md">
          <q-input
            v-model="sendForm.email"
            type="email"
            label="Correo destino *"
            outlined dense
            :hint="clientEmailHint"
          />
          <q-input
            v-model="sendForm.subject"
            label="Asunto"
            outlined dense
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" icon="mail" label="Enviar" :loading="saving" unelevated @click="submitSendToClient" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <CompanyFormDialog v-model="viewDialog" :title="viewTitle" icon="visibility" wide sales-document>
      <template v-if="selectedDoc">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-4">
            <div class="text-caption text-grey-7">Número</div>
            <div class="text-subtitle1">{{ selectedDoc.internalNumber }}</div>
          </div>
          <div class="col-12 col-md-4">
            <div class="text-caption text-grey-7">Cliente</div>
            <div>{{ selectedDoc.clientName }}</div>
          </div>
          <div class="col-12 col-md-4">
            <div class="text-caption text-grey-7">Estado</div>
            <q-badge :color="docStatusColor(selectedDoc.status, selectedDoc.documentKind)">
              {{ docStatusLabel(selectedDoc.status, selectedDoc.documentKind) }}
            </q-badge>
          </div>
        </div>
        <q-markup-table flat bordered dense>
          <thead>
            <tr>
              <th>#</th>
              <th>Descripción</th>
              <th class="text-right">Cant.</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in selectedDoc.details" :key="d.id">
              <td>{{ d.lineNumber }}</td>
              <td>{{ d.description }}</td>
              <td class="text-right">{{ d.quantity }}</td>
              <td class="text-right">${{ formatMoney(d.lineTotal) }}</td>
            </tr>
          </tbody>
        </q-markup-table>
        <div class="sales-doc-summary q-mt-md">
          <div class="sales-doc-summary__box">
            <div class="sales-doc-summary__row sales-doc-summary__row--total">
              <span>Total</span>
              <span>${{ formatMoney(selectedDoc.total) }}</span>
            </div>
          </div>
        </div>
      </template>
      <template #actions>
        <q-btn
          v-if="selectedDoc && canViewDocumentPdf(selectedDoc)"
          flat
          icon="picture_as_pdf"
          label="Ver PDF"
          color="red-8"
          @click="openDocumentPdf(selectedDoc)"
        />
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
      </template>
    </CompanyFormDialog>

    <SalesDocumentPdfDialog
      v-model="pdfDialogOpen"
      :document-id="pdfDocumentId"
      :title="pdfDialogTitle"
    />
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import DocumentExpandPanel from 'src/components/company/DocumentExpandPanel.vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'
import SalesDocumentPdfDialog from 'src/components/company/SalesDocumentPdfDialog.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'
import { useExpandableRows } from 'src/composables/useExpandableRows.js'
import { formatDate } from 'src/utils/date-format.js'

const $q = useQuasar()
const router = useRouter()

const kinds = ['cotizaciones', 'prefacturas']
const validTabs = kinds
const tab = useCompanyPageTab(validTabs, 'cotizaciones')

const pageMetaMap = {
  cotizaciones: {
    title: 'Cotizaciones',
    icon: 'request_quote',
    subtitle: 'Propuestas comerciales para el cliente. Puede convertirlas en prefactura o factura.',
  },
  prefacturas: {
    title: 'Prefacturas',
    icon: 'description',
    subtitle: 'Documentos previos a facturación. Al emitir, quedan listos para convertir en factura DIAN.',
  },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.cotizaciones)

const {
  expanded,
  detailCache,
  detailLoading,
  toggleRowExpand,
  setExpanded,
} = useExpandableRows((id) => api.ventas.document(id), {
  onError: (e) => $q.notify({ type: 'negative', message: e.message }),
})

const currentDocuments = computed(() =>
  documentsByKind(tab.value === 'cotizaciones' ? 'cotizacion' : 'prefactura')
)

const loading = ref(false)
const saving = ref(false)
const documents = ref([])
const clients = ref([])
const services = ref([])
const articles = ref([])
const resolutions = ref([])

const lineItemMode = ref('servicios')

const lineItemModeOptions = [
  { label: 'Servicios', value: 'servicios' },
  { label: 'Artículos', value: 'articulos' },
  { label: 'Ambos', value: 'ambos' },
]

const lineTypeOptions = [
  { label: 'Servicio', value: 'service' },
  { label: 'Artículo', value: 'article' },
]

const docDialog = ref(false)
const convertDialog = ref(false)
const sendDialog = ref(false)
const viewDialog = ref(false)
const pdfDialogOpen = ref(false)
const pdfDocumentId = ref('')
const pdfDialogTitle = ref('Cotización')
const docSaveError = ref('')
const docId = ref(null)
const convertTarget = ref(null)
const sendTarget = ref(null)
const selectedDoc = ref(null)

const docForm = reactive({
  kind: 'cotizacion',
  clientId: null,
  dueDate: '',
  notes: '',
  lines: [],
})

const convertForm = reactive({ dianResolutionId: null })
const sendForm = reactive({ email: '', subject: '' })

const clientEmailHint = computed(() => {
  if (!sendTarget.value?.clientId) return 'Configure SMTP en Emisor DIAN'
  const client = clients.value.find((c) => c.id === sendTarget.value.clientId)
  return client?.email ? `Cliente: ${client.email}` : 'El cliente no tiene email registrado'
})

const baseColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 200px' },
  { name: 'expand', label: '', field: 'expand', align: 'center', style: 'width: 36px' },
  { name: 'internalNumber', label: 'Número', field: 'internalNumber', align: 'left', sortable: true, style: 'width: 110px' },
  { name: 'issueDate', label: 'Fecha', field: 'issueDate', align: 'left', sortable: true, style: 'width: 92px' },
  { name: 'clientName', label: 'Cliente', field: 'clientName', align: 'left', sortable: true, style: 'max-width: 220px' },
  { name: 'dueDate', label: 'Vencimiento', field: 'dueDate', align: 'left', sortable: true, style: 'width: 100px' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', sortable: true, style: 'width: 100px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width: 100px' },
]

function tableColumns(kind) {
  if (kind === 'cotizaciones') {
    return baseColumns.map((col) =>
      col.name === 'dueDate' ? { ...col, label: 'Válida hasta' } : col
    )
  }
  return baseColumns
}

const clientOptions = ref([])
const serviceOptions = computed(() =>
  services.value
    .filter((s) => s.isActive)
    .map((s) => ({
      label: `${s.code} — ${s.description}`,
      value: s.id,
      caption: `$${formatMoney(s.basePrice)}`,
    }))
)

const articleOptions = computed(() =>
  articles.value
    .filter((a) => a.isActive)
    .map((a) => ({
      label: `${a.code} — ${a.name}`,
      value: a.id,
      caption: `$${formatMoney(a.averageCost)}`,
    }))
)

const showLineTypeColumn = computed(() =>
  docForm.kind === 'cotizacion' && lineItemMode.value === 'ambos'
)

const detailSectionTitle = computed(() => {
  if (docForm.kind !== 'cotizacion') return 'Detalle de servicios'
  if (lineItemMode.value === 'articulos') return 'Detalle de artículos'
  if (lineItemMode.value === 'ambos') return 'Detalle de ítems'
  return 'Detalle de servicios'
})

const lineItemColumnLabel = computed(() => {
  if (docForm.kind !== 'cotizacion' || lineItemMode.value === 'servicios') return 'Servicio'
  if (lineItemMode.value === 'articulos') return 'Artículo'
  return 'Ítem'
})

const invoiceResolutionOptions = computed(() =>
  resolutions.value
    .filter((r) => r.isActive && r.documentType === '01')
    .map((r) => ({
      label: `${r.prefix} — Res. ${r.resolutionNumber}`,
      value: r.id,
    }))
)

const docDialogTitle = computed(() => {
  const label = docForm.kind === 'cotizacion' ? 'cotización' : 'prefactura'
  return docId.value ? `Editar ${label}` : `Nueva ${label}`
})

const viewTitle = computed(() =>
  selectedDoc.value?.documentKind === 'cotizacion' ? 'Cotización' : 'Prefactura'
)

const docTotals = computed(() => {
  let base = 0
  let tax = 0
  let total = 0
  for (const line of docForm.lines) {
    const calc = lineCalc(line)
    base += calc.base
    tax += calc.taxAmount
    total += calc.lineTotal
  }
  return {
    base: Math.round(base * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  }
})

watch(tab, () => {
  expanded.value = []
})

watch(docDialog, (open) => {
  if (!open) docSaveError.value = ''
})

watch(lineItemMode, (mode) => {
  if (!docDialog.value || docForm.kind !== 'cotizacion') return
  const lineType = mode === 'articulos' ? 'article' : 'service'
  docForm.lines = [emptyLine(lineType)]
})

onMounted(loadAll)

function lineCalc(line) {
  const base = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
  const taxAmount = base * ((Number(line.taxRate) || 0) / 100)
  const lineTotal = Math.round((base + taxAmount) * 100) / 100
  return { base, taxAmount, lineTotal }
}

function documentsByKind(kind) {
  return documents.value.filter((d) => d.documentKind === kind)
}

async function loadAll() {
  loading.value = true
  try {
    const [cot, pre, cli, svc, arts, res] = await Promise.all([
      api.ventas.documents('cotizacion'),
      api.ventas.documents('prefactura'),
      api.ventas.clients(),
      api.ventas.services(),
      api.ventas.catalogArticles().catch(() => []),
      api.ventas.resolutions(),
    ])
    documents.value = [...cot, ...pre]
    clients.value = cli
    services.value = svc
    articles.value = arts
    resolutions.value = res
    clientOptions.value = cli.map((c) => ({
      label: `${c.fullName} (${c.documentNumber})`,
      value: c.id,
    }))
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

function filterClients(val, update) {
  update(() => {
    const needle = val.toLowerCase()
    clientOptions.value = clients.value
      .filter((c) => c.fullName.toLowerCase().includes(needle) || c.documentNumber.includes(val))
      .map((c) => ({ label: `${c.fullName} (${c.documentNumber})`, value: c.id }))
  })
}

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
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

function inferLineItemMode(lines) {
  if (!lines?.length) return 'servicios'
  const hasService = lines.some((l) => l.serviceId)
  const hasArticle = lines.some((l) => !l.serviceId)
  if (hasService && hasArticle) return 'ambos'
  if (hasArticle) return 'articulos'
  return 'servicios'
}

function mapDetailToLine(d) {
  const isArticle = !d.serviceId
  const article = isArticle
    ? articles.value.find((a) => a.code === d.itemCode)
    : null
  return {
    lineType: isArticle ? 'article' : 'service',
    serviceId: d.serviceId || null,
    articleId: article?.id || null,
    itemCode: d.itemCode || '',
    description: d.description || '',
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    taxRate: d.taxRate,
  }
}

function effectiveLineType(line) {
  if (docForm.kind !== 'cotizacion') return 'service'
  if (lineItemMode.value === 'articulos') return 'article'
  if (lineItemMode.value === 'servicios') return 'service'
  return line.lineType || 'service'
}

function openDocumentDialog(kind, row = null) {
  docSaveError.value = ''
  docForm.kind = kind
  docId.value = row?.id || null
  docForm.clientId = row?.clientId || null
  docForm.dueDate = row?.dueDate?.slice?.(0, 10) || defaultDueDate()
  docForm.notes = row?.notes || ''
  if (row?.details?.length) {
    docForm.lines = row.details.map(mapDetailToLine)
    lineItemMode.value = kind === 'cotizacion' ? inferLineItemMode(row.details) : 'servicios'
  } else {
    lineItemMode.value = kind === 'cotizacion' ? 'servicios' : 'servicios'
    docForm.lines = [emptyLine('service')]
  }
  docDialog.value = true
}

async function editDocument(row) {
  try {
    const full = await api.ventas.document(row.id)
    openDocumentDialog(full.documentKind, full)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function viewDocument(row) {
  try {
    selectedDoc.value = await api.ventas.document(row.id)
    viewDialog.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function addLine() {
  let lineType = 'service'
  if (docForm.kind === 'cotizacion') {
    if (lineItemMode.value === 'articulos') lineType = 'article'
    else if (lineItemMode.value === 'ambos') lineType = 'service'
  }
  docForm.lines.push(emptyLine(lineType))
}

function onServicePick(line, serviceId) {
  const svc = services.value.find((s) => s.id === serviceId)
  if (svc) {
    line.unitPrice = svc.basePrice
    line.articleId = null
    line.itemCode = ''
    line.description = ''
  }
}

function onArticlePick(line, articleId) {
  const art = articles.value.find((a) => a.id === articleId)
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

function validateDocumentForm() {
  const missing = []
  if (!docForm.clientId) missing.push('Cliente')
  if (!docForm.lines.length) missing.push('Al menos una línea')
  for (let i = 0; i < docForm.lines.length; i += 1) {
    const line = docForm.lines[i]
    const type = effectiveLineType(line)
    if (type === 'service' && !line.serviceId) missing.push(`Servicio en línea ${i + 1}`)
    if (type === 'article' && !line.articleId) missing.push(`Artículo en línea ${i + 1}`)
    if (!line.quantity || line.quantity <= 0) missing.push(`Cantidad en línea ${i + 1}`)
  }
  return missing
}

function buildLinePayload(line) {
  const type = effectiveLineType(line)
  if (type === 'article') {
    return {
      articleId: line.articleId,
      itemCode: line.itemCode,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
    }
  }
  return {
    serviceId: line.serviceId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
  }
}

async function saveDocument(emit) {
  saving.value = true
  docSaveError.value = ''
  try {
    const missing = validateDocumentForm()
    if (missing.length) {
      throw new Error(`Complete: ${missing.join(', ')}`)
    }
    const payload = {
      kind: docForm.kind,
      clientId: docForm.clientId,
      dueDate: docForm.dueDate,
      notes: docForm.notes,
      lines: docForm.lines.map(buildLinePayload),
      emit,
    }
    if (docId.value) {
      await api.ventas.updateDocument(docId.value, payload)
    } else {
      await api.ventas.createDocument(payload)
    }
    docDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: emit ? 'Documento emitido' : 'Borrador guardado' })
  } catch (e) {
    docSaveError.value = e.message || 'No se pudo guardar el documento'
    $q.notify({ type: 'negative', message: docSaveError.value })
  } finally {
    saving.value = false
  }
}

function openConvertDialog(row) {
  convertTarget.value = row
  convertForm.dianResolutionId = invoiceResolutionOptions.value[0]?.value || null
  if (!invoiceResolutionOptions.value.length) {
    $q.notify({
      type: 'warning',
      message: 'Configure una resolución DIAN de factura en Configuración',
    })
    return
  }
  convertDialog.value = true
}

async function convertToInvoice() {
  if (!convertForm.dianResolutionId) {
    $q.notify({ type: 'warning', message: 'Seleccione resolución DIAN' })
    return
  }
  saving.value = true
  try {
    const invoice = await api.ventas.convertDocument(convertTarget.value.id, {
      dianResolutionId: convertForm.dianResolutionId,
      emit: true,
    })
    convertDialog.value = false
    await loadAll()
    $q.notify({
      type: 'positive',
      message: `Factura ${invoice.fullNumber} generada`,
      actions: [{ label: 'Ver facturación', color: 'white', handler: () => router.push('/facturacion') }],
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function isCotizacionRow(row) {
  return row?.documentKind === 'cotizacion' || tab.value === 'cotizaciones'
}

function canEditDocument(row) {
  if (['convertida', 'anulada'].includes(row.status)) return false
  if (isCotizacionRow(row)) return row.status === 'borrador'
  return ['borrador', 'emitida'].includes(row.status)
}

function canViewDocumentPdf(row) {
  return isCotizacionRow(row) && !['convertida', 'anulada'].includes(row.status)
}

function openDocumentPdf(row) {
  if (!row?.id) return
  pdfDocumentId.value = row.id
  pdfDialogTitle.value = `Cotización ${row.internalNumber || ''}`.trim()
  pdfDialogOpen.value = true
}

function canConfirmCotizacion(row) {
  return isCotizacionRow(row) && row.status === 'borrador'
}

function canSendCotizacion(row) {
  return isCotizacionRow(row) && row.status === 'emitida'
}

function canFacturarDocument(row) {
  if (['convertida', 'anulada'].includes(row.status)) return false
  if (isCotizacionRow(row)) return row.status === 'emitida'
  return row.status !== 'convertida'
}

async function confirmCotizacion(row) {
  $q.dialog({
    title: 'Confirmar cotización',
    message: `¿Confirma la cotización ${row.internalNumber}? Podrá enviarla al cliente y facturar después.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    saving.value = true
    try {
      await api.ventas.confirmDocument(row.id)
      await loadAll()
      $q.notify({ type: 'positive', message: 'Cotización confirmada' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      saving.value = false
    }
  })
}

function openSendDialog(row) {
  sendTarget.value = row
  const client = clients.value.find((c) => c.id === row.clientId)
  sendForm.email = client?.email || ''
  sendForm.subject = `Cotización ${row.internalNumber}`
  sendDialog.value = true
}

async function submitSendToClient() {
  if (!sendTarget.value?.id) return
  if (!sendForm.email?.trim()) {
    $q.notify({ type: 'warning', message: 'Indique el correo de destino' })
    return
  }
  saving.value = true
  try {
    const result = await api.ventas.sendDocumentToClient(sendTarget.value.id, {
      email: sendForm.email.trim(),
      subject: sendForm.subject?.trim() || undefined,
    })
    sendDialog.value = false
    $q.notify({ type: 'positive', message: `Enviado a ${result.to}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function docStatusColor(s) {
  return {
    borrador: 'grey',
    emitida: 'blue',
    convertida: 'positive',
    anulada: 'negative',
  }[s] || 'grey'
}

function docStatusLabel(s, kind = null) {
  const docKind = kind || (tab.value === 'cotizaciones' ? 'cotizacion' : 'prefactura')
  if (s === 'emitida' && docKind === 'cotizacion') return 'Confirmada'
  return {
    borrador: 'Borrador',
    emitida: 'Emitida',
    convertida: 'Facturada',
    anulada: 'Anulada',
  }[s] || s
}
</script>
