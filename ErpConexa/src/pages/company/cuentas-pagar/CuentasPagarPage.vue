<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      title="Cuentas por pagar"
      icon="payments"
      subtitle="Facturas de proveedor y documento soporte DIAN"
    />

    <div class="company-page-card">
      <div class="row q-col-gutter-md q-mb-md items-end">
        <div class="col-12 col-md-3">
          <q-select
            v-model="filterStatus"
            :options="statusFilterOptions"
            label="Estado"
            outlined
            dense
            emit-value
            map-options
            clearable
            @update:model-value="loadList"
          />
        </div>
        <div class="col-12 col-md-9 row q-gutter-sm justify-end">
          <q-btn
            v-if="hasPermission('cuentas_pagar.registrar')"
            color="primary"
            icon="add"
            label="Nueva CxP"
            unelevated
            @click="openForm()"
          />
        </div>
      </div>

      <q-table
        class="company-data-table cxp-table"
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        bordered
        dense
        wrap-cells
        :loading="loading"
        @row-click="(_, row) => toggleRowExpand(row.id)"
      >
        <template #body="props">
          <q-tr :props="props" class="cursor-pointer">
            <q-td key="actions" :props="props" class="cxp-table__actions" @click.stop>
              <div class="row no-wrap items-center">
                <q-btn flat dense round size="sm" icon="visibility" color="grey-8" @click="openView(props.row)">
                  <q-tooltip>Ver</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="picture_as_pdf"
                  color="red-8"
                  @click="openPdf(props.row)"
                >
                  <q-tooltip>Imprimir PDF</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="hasPermission('cuentas_pagar.registrar') && props.row.status === 'borrador'"
                  flat dense round size="sm" icon="edit" color="primary"
                  @click="openForm(props.row)"
                >
                  <q-tooltip>Editar</q-tooltip>
                </q-btn>
              </div>
            </q-td>
            <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleRowExpand(props.row.id)">
              <q-btn flat dense round size="sm" :icon="expanded.includes(props.row.id) ? 'expand_less' : 'expand_more'" color="grey-7" />
            </q-td>
            <q-td key="cnsFcxp" :props="props">{{ formatCxpNumber(props.row.cnsFcxp) }}</q-td>
            <q-td key="fechaCxp" :props="props">{{ formatDate(props.row.fechaCxp) }}</q-td>
            <q-td key="terceroNombre" :props="props" class="cxp-tercero-cell">
              <div class="company-data-table__two-lines">{{ props.row.terceroNombre || '—' }}</div>
            </q-td>
            <q-td key="nroFactura" :props="props">{{ props.row.nroFactura }}</q-td>
            <q-td key="manejaDocSoporte" :props="props" @click.stop>
              <q-btn
                v-if="props.row.manejaDocSoporte"
                flat
                dense
                round
                size="sm"
                icon="cloud_upload"
                color="primary"
                @click="openDianHistory(props.row)"
              >
                <q-tooltip>Envíos DIAN</q-tooltip>
              </q-btn>
              <q-icon v-else name="description" color="grey-6" size="sm">
                <q-tooltip>Solo registro</q-tooltip>
              </q-icon>
            </q-td>
            <q-td key="status" :props="props">
              <q-badge :color="statusColor(props.row.status)">{{ statusLabel(props.row.status) }}</q-badge>
            </q-td>
            <q-td key="valorNeto" :props="props" class="text-right">{{ formatCop(props.row.valorNeto) }}</q-td>
            <q-td key="vlrNotaDb" :props="props" class="text-right">
              <span v-if="Number(props.row.vlrNotaDb) > 0" class="text-teal-8 text-weight-medium">
                {{ formatCop(props.row.vlrNotaDb) }}
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
            <q-td key="vlrNotaCr" :props="props" class="text-right">
              <span v-if="Number(props.row.vlrNotaCr) > 0" class="text-orange-9 text-weight-medium">
                {{ formatCop(props.row.vlrNotaCr) }}
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
            <q-td key="saldo" :props="props" class="text-right text-weight-medium">{{ formatCop(props.row.saldo) }}</q-td>
          </q-tr>
          <q-tr v-show="expanded.includes(props.row.id)" class="company-data-table__expand">
            <q-td colspan="12" class="cxp-table__expand-cell">
              <div class="company-data-table__expand-inner company-data-table__expand-inner--sales">
                <CxpExpandPanel
                  :row="props.row"
                  :detail="detailCache[props.row.id]"
                  :loading="detailLoading[props.row.id]"
                  :editable="canEditExpand(props.row)"
                  :saving="expandSaving === props.row.id"
                  :sending="sendingId === props.row.id"
                  :can-confirm="hasPermission('cuentas_pagar.confirmar') && props.row.status === 'borrador'"
                  :can-send-dian="canSendDian(props.row)"
                  :can-manage-notas="hasPermission('cuentas_pagar.notas') && canManageNotas(props.row)"
                  :can-send-dian-notas="canSendDianNotas(props.row)"
                  :can-void="hasPermission('cuentas_pagar.anular') && canVoid(props.row)"
                  @notas-updated="(fcxp) => onNotasUpdated(props.row, fcxp)"
                  :tax-options="taxOptions"
                  :tax-classes="taxClasses"
                  :tax-rates="taxRates"
                  :services="services"
                  @save="(payload) => saveExpanded(props.row, payload)"
                  @confirm="confirmRow(props.row)"
                  @send-dian="sendDian(props.row)"
                  @void="voidRow(props.row)"
                  @print="openPdf(props.row)"
                />
              </div>
            </q-td>
          </q-tr>
        </template>
      </q-table>
    </div>

    <CompanyFormDialog
      v-model="formDialog"
      :title="formId ? 'Editar cuenta por pagar' : 'Nueva cuenta por pagar'"
      icon="payments"
      wide
      sales-document
    >
      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-4">
          <q-select
            v-model="form.idTercero"
            :options="clientOptionsFiltered"
            label="Tercero / proveedor *"
            outlined dense emit-value map-options use-input input-debounce="200"
            @filter="filterClients"
          />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="form.fechaCxp" type="date" label="Fecha CxP *" outlined dense />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="form.nroFactura" label="Nº factura proveedor *" outlined dense />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="form.fechaFactura" type="date" label="Fecha factura *" outlined dense />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="form.fechaVence" type="date" label="Fecha vence *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="form.cnsInterno" label="Consecutivo interno" outlined dense />
        </div>
        <div class="col-12 col-md-8">
          <q-input v-model="form.detalle" label="Detalle / concepto" outlined dense type="textarea" autogrow />
        </div>
        <div v-if="selectedTercero?.manejaDocSoporte" class="col-12">
          <q-banner dense rounded class="bg-blue-1 text-blue-10">
            Este tercero requiere <strong>documento soporte DIAN</strong> al confirmar.
          </q-banner>
        </div>
      </div>

      <div class="text-subtitle2 q-mb-sm">Líneas de detalle</div>
      <q-banner
        v-if="!headerReady"
        dense
        rounded
        class="bg-orange-1 text-orange-10 q-mb-md"
      >
        Complete el encabezado (tercero, fechas y número de factura) para agregar líneas de detalle.
      </q-banner>
      <div
        v-for="(line, idx) in form.details"
        :key="idx"
        class="row q-col-gutter-sm q-mb-sm items-start"
      >
        <div class="col-12 col-md-4">
          <q-select
            v-model="line.idServicio"
            :options="serviceOptionsFiltered"
            label="Servicio"
            outlined dense emit-value map-options clearable
            use-input input-debounce="200"
            :disable="!headerReady"
            @filter="filterServices"
            @update:model-value="onServicePick(line, $event)"
          />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="line.descripcion" label="Descripción *" outlined dense :disable="!headerReady" />
        </div>
        <div class="col-4 col-md-1">
          <q-input v-model.number="line.cantidad" type="number" min="0" step="any" label="Cant." outlined dense :disable="!headerReady" />
        </div>
        <div class="col-4 col-md-2">
          <q-input v-model.number="line.valor" type="number" min="0" step="any" label="Valor unit." outlined dense :disable="!headerReady" />
        </div>
        <div class="col-4 col-md-1">
          <q-input v-model.number="line.vlrDescuento" type="number" min="0" step="any" label="Dcto." outlined dense :disable="!headerReady" />
        </div>
        <div class="col-4 col-md-2">
          <q-input v-model.number="line.vlrIva" type="number" min="0" step="any" label="Vlr. IVA" outlined dense :disable="!headerReady" />
        </div>
        <div class="col-auto">
          <q-btn flat round dense icon="delete" color="negative" :disable="!headerReady" @click="removeLine(idx)" />
        </div>
      </div>
      <q-btn
        flat
        dense
        icon="add"
        label="Agregar línea"
        color="primary"
        class="q-mb-md"
        :disable="!headerReady"
        @click="addLine"
      />

      <div class="text-subtitle2 q-mb-sm">Impuestos</div>
      <div
        v-for="(tax, idx) in form.taxes"
        :key="'tax-' + idx"
        class="row q-col-gutter-sm q-mb-sm items-start"
      >
        <div class="col-12 col-md-3">
          <q-select
            v-model="tax.idImpuesto"
            :options="taxOptions"
            label="Impuesto *"
            outlined dense emit-value map-options
            :disable="!headerReady"
            @update:model-value="onTaxChange(tax)"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-select
            v-model="tax.idClase"
            :options="classOptionsFor(tax.idImpuesto)"
            label="Clase *"
            outlined dense emit-value map-options
            :disable="!headerReady || !tax.idImpuesto"
            @update:model-value="onTaxClassChange(tax)"
          />
        </div>
        <div class="col-4 col-md-2">
          <q-input
            v-model.number="tax.base"
            type="number"
            min="0"
            step="any"
            label="Base"
            outlined dense
            :disable="!headerReady"
            @update:model-value="recalcTaxAmount(tax)"
          />
        </div>
        <div class="col-4 col-md-1">
          <q-input
            v-model.number="tax.vlrCalc"
            type="number"
            min="0"
            step="any"
            label="%"
            outlined dense
            :disable="!headerReady"
            @update:model-value="recalcTaxAmount(tax)"
          />
        </div>
        <div class="col-4 col-md-2">
          <q-input
            v-model.number="tax.vlrImpuesto"
            type="number"
            min="0"
            step="any"
            label="Valor"
            outlined dense
            :disable="!headerReady"
          />
        </div>
        <div class="col-auto">
          <q-btn flat round dense icon="delete" color="negative" :disable="!headerReady" @click="removeTax(idx)" />
        </div>
      </div>
      <q-btn
        flat
        dense
        icon="add"
        label="Agregar impuesto"
        color="primary"
        class="q-mb-md"
        :disable="!headerReady"
        @click="addTax"
      />

      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-6 col-md-3">
          <q-input v-model.number="form.vlrAbonos" type="number" min="0" label="Abonos" outlined dense />
        </div>
      </div>

      <q-card flat bordered class="q-pa-sm bg-grey-1">
        <div class="row q-col-gutter-md text-body2">
          <div class="col-6 col-md-3"><strong>Bruto:</strong> {{ formatCop(totals.vlrBruto) }}</div>
          <div class="col-6 col-md-3"><strong>IVA:</strong> {{ formatCop(totals.vlrIva) }}</div>
          <div class="col-6 col-md-3"><strong>Impuestos:</strong> {{ formatCop(totals.vlrImpuestos) }}</div>
          <div class="col-6 col-md-3"><strong>Neto:</strong> {{ formatCop(totals.valorNeto) }}</div>
          <div class="col-6 col-md-3"><strong>Notas DB:</strong> {{ formatCop(form.vlrNotaDb) }}</div>
          <div class="col-6 col-md-3"><strong>Notas CR:</strong> {{ formatCop(form.vlrNotaCr) }}</div>
          <div class="col-6 col-md-3"><strong>Saldo:</strong> {{ formatCop(totals.saldo) }}</div>
        </div>
      </q-card>

      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn
          color="primary"
          icon="save"
          :label="formId ? 'Guardar cambios' : 'Guardar borrador'"
          :loading="saving"
          unelevated
          @click="saveForm"
        />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog
      v-model="viewDialog"
      :title="viewItem ? formatCxpNumber(viewItem.cnsFcxp) : 'Cuenta por pagar'"
      icon="visibility"
      wide
      document-view
    >
      <div v-if="viewItem" class="q-gutter-y-xs q-mb-md">
        <div><strong>Tercero:</strong> {{ viewItem.terceroNombre }} ({{ viewItem.terceroDocumento }})</div>
        <div><strong>Estado:</strong> <q-badge :color="statusColor(viewItem.status)">{{ statusLabel(viewItem.status) }}</q-badge></div>
        <div v-if="viewItem.nroFactura"><strong>Factura proveedor:</strong> {{ viewItem.nroFactura }}</div>
        <div v-if="viewItem.manejaDocSoporte">
          <strong>Documento soporte:</strong>
          {{ viewItem.cnsDocSoporte || '—' }}
          <span v-if="viewItem.resolutionPrefix"> ({{ viewItem.resolutionPrefix }})</span>
        </div>
        <div v-if="viewItem.cude"><strong>CUDS:</strong> <span class="text-caption">{{ viewItem.cude }}</span></div>
        <div v-if="viewItem.estDian"><strong>Estado DIAN:</strong> {{ viewItem.estDian }}</div>
        <div><strong>Neto:</strong> {{ formatCop(viewItem.valorNeto) }} · <strong>Saldo:</strong> {{ formatCop(viewItem.saldo) }}</div>
      </div>

      <q-markup-table v-if="viewItem?.details?.length" flat bordered dense class="q-mb-md">
        <thead>
          <tr>
            <th>#</th>
            <th>Descripción</th>
            <th class="text-right">Cant.</th>
            <th class="text-right">Valor</th>
            <th class="text-right">IVA</th>
            <th class="text-right">Neto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in viewItem.details" :key="d.id || d.item">
            <td>{{ d.item }}</td>
            <td>{{ d.descripcion || d.serviceDescription || '—' }}</td>
            <td class="text-right">{{ d.cantidad }}</td>
            <td class="text-right">{{ formatCop(d.valor) }}</td>
            <td class="text-right">{{ formatCop(d.vlrIva) }}</td>
            <td class="text-right">{{ formatCop(d.vlrNeto) }}</td>
          </tr>
        </tbody>
      </q-markup-table>

      <q-markup-table v-if="viewItem?.taxes?.length" flat bordered dense class="q-mb-md">
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
          <tr v-for="t in viewItem.taxes" :key="t.id || t.cnsFcxpi">
            <td>{{ t.taxCode || '—' }}</td>
            <td>{{ t.classCode || '—' }}</td>
            <td class="text-right">{{ formatCop(t.base) }}</td>
            <td class="text-right">{{ t.vlrCalc }}</td>
            <td class="text-right">{{ formatCop(t.vlrImpuesto) }}</td>
          </tr>
        </tbody>
      </q-markup-table>

      <div v-if="viewItem?.submissions?.length" class="q-mt-md">
        <div class="text-subtitle2 q-mb-sm">Envíos DIAN</div>
        <q-list bordered separator class="rounded-borders">
          <q-item v-for="s in viewItem.submissions" :key="s.id">
            <q-item-section avatar>
              <q-icon :name="submissionIcon(s.status)" :color="submissionColor(s.status)" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Intento #{{ s.attemptNumber }} — {{ submissionLabel(s.status) }}</q-item-label>
              <q-item-label v-if="s.statusMessage" caption :class="s.isSuccess ? '' : 'text-negative'">
                {{ s.statusMessage }}
              </q-item-label>
              <q-item-label v-if="s.uuid" caption>CUDE: {{ s.uuid }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge :color="submissionColor(s.status)">{{ s.statusCode || s.status }}</q-badge>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <template #actions>
        <q-btn
          v-if="viewItem"
          flat
          icon="picture_as_pdf"
          label="Imprimir"
          color="red-8"
          @click="openPdf(viewItem)"
        />
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
        <q-btn
          v-if="viewItem && canSendDian(viewItem)"
          color="teal"
          icon="cloud_upload"
          label="Enviar DIAN"
          :loading="sendingId === viewItem.id"
          unelevated
          @click="sendDian(viewItem, true)"
        />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog v-model="dianDialog" title="Envíos a la DIAN" icon="cloud_sync" document-view>
      <DianSubmissionsPanel
        :fcxp-id="dianRow?.id || ''"
        :pdf-title="dianPdfTitle"
      />
      <template #actions>
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
      </template>
    </CompanyFormDialog>

    <InventarioReportPdfDialog
      v-model="pdfDialogOpen"
      :title="pdfDialogTitle"
      :loader="pdfLoader"
    />
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CxpExpandPanel from 'src/components/company/CxpExpandPanel.vue'
import DianSubmissionsPanel from 'src/components/company/DianSubmissionsPanel.vue'
import InventarioReportPdfDialog from 'src/components/company/inventario/InventarioReportPdfDialog.vue'
import { useExpandableRows } from 'src/composables/useExpandableRows.js'
import { api } from 'src/services/api.js'
import { hasPermission } from 'src/utils/auth.js'
import { formatCop } from 'src/utils/money-format.js'
import { formatDate } from 'src/utils/date-format.js'

const $q = useQuasar()

const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const expandSaving = ref(null)
const sendingId = ref(null)
const filterStatus = ref(null)
const formDialog = ref(false)
const viewDialog = ref(false)
const formId = ref(null)
const viewItem = ref(null)
const pdfDialogOpen = ref(false)
const pdfDialogTitle = ref('Cuenta por pagar')
const pdfLoader = ref(null)
const dianDialog = ref(false)
const dianRow = ref(null)
const dianPdfTitle = computed(() => (
  dianRow.value ? `CxP ${formatCxpNumber(dianRow.value.cnsFcxp)}` : 'Documento soporte'
))

const clients = ref([])
const services = ref([])
const taxesCatalog = ref([])
const taxClasses = ref([])
const taxRates = ref([])
const clientFilter = ref('')
const serviceFilter = ref('')

const emptyLine = () => ({
  item: 1,
  idServicio: null,
  descripcion: '',
  cantidad: 1,
  valor: 0,
  vlrIva: 0,
  vlrDescuento: 0,
  vlrImpConsumo: 0,
})

const emptyTax = () => ({
  cnsFcxpi: 1,
  idImpuesto: null,
  idClase: null,
  vlrCalc: 0,
  base: 0,
  vlrImpuesto: 0,
  cuentaConta: null,
})

function formatCxpNumber(cns) {
  const n = Number(cns)
  if (!n) return '—'
  return `CXP-${String(n).padStart(6, '0')}`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

const form = reactive({
  idTercero: null,
  fechaCxp: todayIso(),
  nroFactura: '',
  fechaFactura: '',
  fechaVence: '',
  cnsInterno: '',
  detalle: '',
  vlrNotaCr: 0,
  vlrNotaDb: 0,
  vlrAbonos: 0,
  details: [],
  taxes: [],
})

const statusFilterOptions = [
  { label: 'Borrador', value: 'borrador' },
  { label: 'Confirmada', value: 'confirmada' },
  { label: 'Enviada DIAN', value: 'enviada_dian' },
  { label: 'Aprobada DIAN', value: 'aprobada_dian' },
  { label: 'Rechazada DIAN', value: 'rechazada_dian' },
  { label: 'Anulada', value: 'anulada' },
]

const {
  expanded,
  detailCache,
  detailLoading,
  toggleRowExpand,
  invalidateDetail,
} = useExpandableRows(
  (id) => api.cuentasPagar.get(id),
  { onError: (e) => $q.notify({ type: 'negative', message: e.message }) },
)

const columns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 108px' },
  { name: 'expand', label: '', field: 'expand', align: 'center', style: 'width: 36px' },
  { name: 'cnsFcxp', label: 'Consec.', field: 'cnsFcxp', align: 'left', style: 'width: 96px' },
  { name: 'fechaCxp', label: 'Fecha', field: 'fechaCxp', align: 'left', style: 'width: 88px' },
  { name: 'terceroNombre', label: 'Tercero', field: 'terceroNombre', align: 'left' },
  { name: 'nroFactura', label: 'Factura', field: 'nroFactura', align: 'left', style: 'width: 92px' },
  { name: 'manejaDocSoporte', label: 'DS', field: 'manejaDocSoporte', align: 'center', style: 'width: 40px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'left', style: 'width: 110px' },
  { name: 'valorNeto', label: 'Neto', field: 'valorNeto', align: 'right', style: 'width: 92px' },
  { name: 'vlrNotaDb', label: 'Notas DB', field: 'vlrNotaDb', align: 'right', style: 'width: 96px' },
  { name: 'vlrNotaCr', label: 'Notas CR', field: 'vlrNotaCr', align: 'right', style: 'width: 96px' },
  { name: 'saldo', label: 'Saldo', field: 'saldo', align: 'right', style: 'width: 92px' },
]

const clientOptions = computed(() =>
  clients.value.map((c) => ({
    label: `${c.fullName || c.businessName} (${c.documentType} ${c.documentNumber})`,
    value: c.id,
  }))
)

const clientOptionsFiltered = computed(() => {
  const q = clientFilter.value.trim().toLowerCase()
  if (!q) return clientOptions.value
  return clientOptions.value.filter((o) => o.label.toLowerCase().includes(q))
})

const serviceOptions = computed(() =>
  services.value.map((s) => ({
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

const selectedTercero = computed(() =>
  clients.value.find((c) => c.id === form.idTercero) || null
)

const taxOptions = computed(() =>
  taxesCatalog.value
    .filter((t) => t.status === 'activo')
    .map((t) => ({ label: `${t.code} — ${t.name}`, value: t.id }))
)

function classOptionsFor(taxId) {
  if (!taxId) return []
  return taxClasses.value
    .filter((c) => c.taxId === taxId && c.status === 'activo')
    .map((c) => ({
      label: `${c.classCode}${c.description ? ` — ${c.description}` : ''}`,
      value: c.id,
    }))
}

const headerReady = computed(() => Boolean(
  form.idTercero
  && form.fechaCxp
  && String(form.nroFactura || '').trim()
  && form.fechaFactura
  && form.fechaVence
))

const totals = computed(() => {
  let vlrBruto = 0
  let vlrIva = 0
  for (const line of form.details) {
    const qty = Number(line.cantidad) || 0
    const unit = Number(line.valor) || 0
    const discount = Number(line.vlrDescuento) || 0
    vlrBruto += Math.max(0, qty * unit - discount)
    vlrIva += Number(line.vlrIva) || 0
  }
  const vlrImpuestos = form.taxes.reduce((sum, t) => sum + (Number(t.vlrImpuesto) || 0), 0)
  const valorNeto = Math.round((vlrBruto + vlrIva + vlrImpuestos) * 100) / 100
  const saldo = Math.round((valorNeto - (Number(form.vlrNotaDb) || 0) + (Number(form.vlrNotaCr) || 0) - (Number(form.vlrAbonos) || 0)) * 100) / 100
  return { vlrBruto, vlrIva, vlrImpuestos, valorNeto, saldo }
})

onMounted(async () => {
  await Promise.all([loadClients(), loadServices(), loadTaxCatalog(), loadList()])
})

async function loadList() {
  loading.value = true
  try {
    const params = {}
    if (filterStatus.value) params.status = filterStatus.value
    rows.value = await api.cuentasPagar.list(params)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

async function loadClients() {
  clients.value = await api.ventas.clients()
}

async function loadServices() {
  services.value = await api.ventas.services()
}

async function loadTaxCatalog() {
  try {
    const [tx, classes, rates] = await Promise.all([
      api.contabilidad.taxes(),
      api.contabilidad.taxClasses(),
      api.contabilidad.taxRates(),
    ])
    taxesCatalog.value = tx
    taxClasses.value = classes
    taxRates.value = rates
  } catch {
    taxesCatalog.value = []
    taxClasses.value = []
    taxRates.value = []
  }
}

function filterClients(val, update) {
  update(() => { clientFilter.value = val })
}

function filterServices(val, update) {
  update(() => { serviceFilter.value = val })
}

function resetForm() {
  formId.value = null
  Object.assign(form, {
    idTercero: null,
    fechaCxp: todayIso(),
    nroFactura: '',
    fechaFactura: '',
    fechaVence: '',
    cnsInterno: '',
    detalle: '',
    vlrNotaCr: 0,
    vlrNotaDb: 0,
    vlrAbonos: 0,
    details: [],
    taxes: [],
  })
}

async function openForm(row = null) {
  if (row?.id) {
    formId.value = row.id
    let data = row
    if (!row.details?.length) {
      try {
        data = await api.cuentasPagar.get(row.id)
      } catch (e) {
        $q.notify({ type: 'negative', message: e.message })
        return
      }
    }
    Object.assign(form, {
      idTercero: data.idTercero,
      fechaCxp: data.fechaCxp?.slice?.(0, 10) || todayIso(),
      nroFactura: data.nroFactura || '',
      fechaFactura: data.fechaFactura?.slice?.(0, 10) || '',
      fechaVence: data.fechaVence?.slice?.(0, 10) || '',
      cnsInterno: data.cnsInterno || '',
      detalle: data.detalle || '',
      vlrNotaCr: data.vlrNotaCr || 0,
      vlrNotaDb: data.vlrNotaDb || 0,
      vlrAbonos: data.vlrAbonos || 0,
      details: data.details?.length
        ? data.details.map((d, i) => ({
          item: d.item ?? i + 1,
          idServicio: d.idServicio || null,
          descripcion: d.descripcion || d.serviceDescription || '',
          cantidad: d.cantidad ?? 1,
          valor: d.valor ?? 0,
          vlrIva: d.vlrIva ?? 0,
          vlrDescuento: d.vlrDescuento ?? 0,
          vlrImpConsumo: d.vlrImpConsumo ?? 0,
        }))
        : [emptyLine()],
      taxes: data.taxes?.length
        ? data.taxes.map((t, i) => ({
          cnsFcxpi: t.cnsFcxpi ?? i + 1,
          idImpuesto: t.idImpuesto || null,
          idClase: t.idClase || null,
          vlrCalc: t.vlrCalc ?? 0,
          base: t.base ?? 0,
          vlrImpuesto: t.vlrImpuesto ?? 0,
          cuentaConta: t.cuentaConta || null,
        }))
        : [],
    })
  } else {
    resetForm()
  }
  formDialog.value = true
}

async function openView(row) {
  try {
    viewItem.value = await api.cuentasPagar.get(row.id)
    viewDialog.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function openPdf(row) {
  if (!row?.id) return
  pdfDialogTitle.value = `CxP ${formatCxpNumber(row.cnsFcxp)}`
  pdfLoader.value = () => api.cuentasPagar.fetchPdf(row.id)
  pdfDialogOpen.value = true
}

function openDianHistory(row) {
  if (!row?.id) return
  dianRow.value = row
  dianDialog.value = true
}

function addLine() {
  if (!headerReady.value) return
  form.details.push({ ...emptyLine(), item: form.details.length + 1 })
}

function removeLine(idx) {
  if (form.details.length <= 1) return
  form.details.splice(idx, 1)
  form.details.forEach((l, i) => { l.item = i + 1 })
}

function onServicePick(line, serviceId) {
  const svc = services.value.find((s) => s.id === serviceId)
  if (!svc) return
  if (!line.descripcion) line.descripcion = svc.description
  if (!line.valor) line.valor = svc.basePrice || 0
}

function addTax() {
  if (!headerReady.value) return
  form.taxes.push({
    ...emptyTax(),
    cnsFcxpi: form.taxes.length + 1,
    base: totals.value.vlrBruto,
  })
}

function removeTax(idx) {
  form.taxes.splice(idx, 1)
  form.taxes.forEach((t, i) => { t.cnsFcxpi = i + 1 })
}

function findTaxRate(taxId, classId) {
  if (!taxId || !classId) return null
  const dateStr = String(form.fechaFactura || form.fechaCxp || '').slice(0, 10)
  return taxRates.value
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

function onTaxClassChange(tax) {
  applyTaxCalc(tax)
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

async function saveForm() {
  if (!headerReady.value) {
    $q.notify({ type: 'warning', message: 'Complete el encabezado antes de guardar' })
    return
  }
  const details = form.details.filter((d) => d.descripcion?.trim())
  if (!details.length) {
    $q.notify({ type: 'warning', message: 'Agregue al menos una línea con descripción' })
    return
  }

  saving.value = true
  try {
    const payload = {
      idTercero: form.idTercero,
      fechaCxp: form.fechaCxp,
      nroFactura: form.nroFactura || null,
      fechaFactura: form.fechaFactura || null,
      fechaVence: form.fechaVence || null,
      cnsInterno: form.cnsInterno || null,
      detalle: form.detalle || null,
      vlrAbonos: form.vlrAbonos || 0,
      details,
      taxes: form.taxes.filter((t) => t.idImpuesto),
    }
    if (formId.value) {
      await api.cuentasPagar.update(formId.value, payload)
      invalidateDetail(formId.value)
    } else {
      await api.cuentasPagar.create(payload)
    }
    formDialog.value = false
    await loadList()
    $q.notify({ type: 'positive', message: 'CxP guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function canEditExpand(row) {
  return hasPermission('cuentas_pagar.registrar') && row.status === 'borrador'
}

function mapDetailsForSave(details = []) {
  return details.map((d, i) => ({
    item: d.item ?? i + 1,
    idServicio: d.idServicio || null,
    descripcion: d.descripcion || d.serviceDescription || '',
    cantidad: d.cantidad ?? 1,
    valor: d.valor ?? 0,
    vlrIva: d.vlrIva ?? 0,
    vlrDescuento: d.vlrDescuento ?? 0,
    vlrImpConsumo: d.vlrImpConsumo ?? 0,
  }))
}

async function saveExpanded(row, payload) {
  const detail = detailCache[row.id]
  if (!detail) return
  const details = mapDetailsForSave(payload.details?.length ? payload.details : detail.details)
    .filter((d) => d.descripcion?.trim())
  if (!details.length) {
    $q.notify({ type: 'warning', message: 'Debe quedar al menos una línea con descripción' })
    return
  }
  expandSaving.value = row.id
  try {
    const saved = await api.cuentasPagar.update(row.id, {
      idTercero: detail.idTercero,
      fechaCxp: detail.fechaCxp?.slice?.(0, 10) || detail.fechaCxp,
      nroFactura: detail.nroFactura || null,
      fechaFactura: detail.fechaFactura?.slice?.(0, 10) || null,
      fechaVence: detail.fechaVence?.slice?.(0, 10) || null,
      cnsInterno: detail.cnsInterno || null,
      detalle: detail.detalle || null,
      vlrAbonos: payload.vlrAbonos,
      details,
      taxes: payload.taxes,
    })
    detailCache[row.id] = saved
    await loadList()
    $q.notify({ type: 'positive', message: 'Detalle actualizado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    expandSaving.value = null
  }
}

function confirmRow(row) {
  $q.dialog({
    title: 'Confirmar CxP',
    message: row.manejaDocSoporte
      ? 'Se asignará número de documento soporte y quedará lista para envío DIAN.'
      : '¿Confirma esta cuenta por pagar?',
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await api.cuentasPagar.confirm(row.id)
      invalidateDetail(row.id)
      await loadList()
      $q.notify({ type: 'positive', message: 'CxP confirmada' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

function canManageNotas(row) {
  return row.status !== 'borrador' && row.status !== 'anulada'
}

function onNotasUpdated(row, fcxp) {
  if (!fcxp) return
  detailCache[row.id] = fcxp
  const idx = rows.value.findIndex((r) => r.id === row.id)
  if (idx >= 0) {
    rows.value[idx] = {
      ...rows.value[idx],
      vlrNotaDb: fcxp.vlrNotaDb,
      vlrNotaCr: fcxp.vlrNotaCr,
      saldo: fcxp.saldo,
    }
  }
}

function canSendDian(row) {
  return hasPermission('cuentas_pagar.enviar_dian')
    && row.manejaDocSoporte
    && ['confirmada', 'rechazada_dian'].includes(row.status)
}

function canSendDianNotas(row) {
  return hasPermission('cuentas_pagar.enviar_dian')
    && row.manejaDocSoporte
    && !!row.cude
}

async function sendDian(row, fromView = false) {
  sendingId.value = row.id
  try {
    const result = await api.cuentasPagar.sendDian(row.id)
    invalidateDetail(row.id)
    await loadList()
    if (fromView) {
      viewItem.value = result.fcxp || await api.cuentasPagar.get(row.id)
    }
    $q.notify({
      type: result.approved ? 'positive' : result.ok ? 'info' : 'negative',
      message: result.submission?.statusMessage || (result.approved ? 'Aprobada por DIAN' : 'Envío procesado'),
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    sendingId.value = null
  }
}

function canVoid(row) {
  return ['borrador', 'confirmada', 'rechazada_dian'].includes(row.status)
}

function voidRow(row) {
  $q.dialog({
    title: 'Anular CxP',
    message: `¿Anular ${formatCxpNumber(row.cnsFcxp)}?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await api.cuentasPagar.void(row.id)
      invalidateDetail(row.id)
      await loadList()
      $q.notify({ type: 'positive', message: 'CxP anulada' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

function statusLabel(status) {
  const map = {
    borrador: 'Borrador',
    confirmada: 'Confirmada',
    enviada_dian: 'Enviada DIAN',
    aprobada_dian: 'Aprobada DIAN',
    rechazada_dian: 'Rechazada DIAN',
    anulada: 'Anulada',
  }
  return map[status] || status
}

function statusColor(status) {
  const map = {
    borrador: 'grey-7',
    confirmada: 'blue-7',
    enviada_dian: 'orange-8',
    aprobada_dian: 'positive',
    rechazada_dian: 'negative',
    anulada: 'grey-6',
  }
  return map[status] || 'grey'
}

function submissionLabel(status) {
  const map = {
    enviado: 'Enviado',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    error: 'Error',
  }
  return map[status] || status
}

function submissionColor(status) {
  if (status === 'aprobado') return 'positive'
  if (status === 'rechazado' || status === 'error') return 'negative'
  return 'orange'
}

function submissionIcon(status) {
  if (status === 'aprobado') return 'check_circle'
  if (status === 'rechazado' || status === 'error') return 'error'
  return 'hourglass_top'
}
</script>

<style scoped>
.cxp-table :deep(table) {
  width: 100%;
}

.cxp-table :deep(thead th),
.cxp-table :deep(tbody > tr:not(.company-data-table__expand) td) {
  overflow: hidden;
}

.cxp-table__actions {
  width: 108px;
  min-width: 108px;
  max-width: 108px;
  white-space: nowrap;
}

.cxp-table__expand-cell {
  position: relative;
  z-index: 1;
  background: #f7f9fb;
  overflow: visible;
}

.cxp-tercero-cell {
  white-space: normal !important;
  overflow: hidden;
}
</style>
