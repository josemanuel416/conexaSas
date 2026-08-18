<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" :subtitle="pageMeta.subtitle" />

    <div class="company-page-card">
      <template v-if="tab === 'movimientos'">
        <div class="row q-col-gutter-md q-mb-md items-end">
          <div class="col-12 col-md-4">
            <q-select
              v-model="filterWarehouseId"
              :options="warehouseOptions"
              label="Bodega"
              outlined dense clearable emit-value map-options
              @update:model-value="loadMovements"
            />
          </div>
          <div class="col-12 col-md-8 row q-gutter-sm justify-end">
            <q-btn
              outline
              color="primary"
              icon="picture_as_pdf"
              label="Ver PDF"
              no-caps
              :loading="exporting"
              @click="openMovimientosPdf"
            />
            <q-btn
              outline
              color="primary"
              icon="table_view"
              label="Excel"
              no-caps
              :loading="exporting"
              @click="downloadMovimientosExcel"
            />
            <q-btn
              v-if="hasPermission('inventario.movimientos')"
              color="primary"
              icon="add"
              label="Nuevo movimiento"
              unelevated
              :disable="!warehouses.length"
              @click="openMovementDialog()"
            />
          </div>
        </div>

        <q-banner v-if="!warehouses.length" dense rounded class="bg-orange-1 text-orange-10 q-mb-md">
          Configure al menos una bodega en <strong>Inventario → Bodegas</strong>.
        </q-banner>

        <q-table
          :rows="movements"
          :columns="movementColumns"
          row-key="id"
          flat bordered
          :loading="loading"
          class="company-data-table"
        >
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="statusColor(props.row.status)">{{ statusLabel(props.row.status) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-totalValue="props">
            <q-td :props="props" class="text-right">{{ formatMoney(props.row.totalValue) }}</q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="visibility" color="primary" @click="viewMovement(props.row)">
                <q-tooltip>Ver</q-tooltip>
              </q-btn>
              <q-btn
                flat dense round size="sm" icon="picture_as_pdf" color="primary"
                @click="openMovementPdf(props.row)"
              >
                <q-tooltip>PDF</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status === 'borrador' && hasPermission('inventario.movimientos')"
                flat dense round size="sm" icon="edit" color="primary"
                @click="openEditMovement(props.row)"
              >
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canGenerateInvoice(props.row)"
                flat dense round size="sm" icon="receipt_long" color="secondary"
                @click="openInvoiceDialog(props.row)"
              >
                <q-tooltip>Generar factura</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status === 'borrador' && hasPermission('inventario.confirmar')"
                flat dense round size="sm" icon="check_circle" color="positive"
                @click="confirmMovement(props.row)"
              >
                <q-tooltip>Confirmar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status === 'borrador' && hasPermission('inventario.anular')"
                flat dense round size="sm" icon="cancel" color="negative"
                @click="voidMovement(props.row)"
              >
                <q-tooltip>Anular</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'existencias'">
        <div class="row q-col-gutter-md q-mb-md items-end">
          <div class="col-12 col-md-4">
            <q-select
              v-model="balanceWarehouseId"
              :options="warehouseOptions"
              label="Bodega"
              outlined dense clearable emit-value map-options
              @update:model-value="loadBalances"
            />
          </div>
          <div class="col-12 col-md-8 row q-gutter-sm justify-end">
            <q-btn
              outline
              color="primary"
              icon="picture_as_pdf"
              label="Ver PDF"
              no-caps
              :loading="exporting"
              @click="openExistenciasPdf"
            />
            <q-btn
              outline
              color="primary"
              icon="table_view"
              label="Excel"
              no-caps
              :loading="exporting"
              @click="downloadExistenciasExcel"
            />
          </div>
        </div>
        <q-table
          :rows="balances"
          :columns="balanceColumns"
          row-key="id"
          flat bordered
          :loading="loading"
          class="company-data-table"
        >
          <template #body-cell-quantityOnHand="props">
            <q-td :props="props" class="text-right">{{ props.row.quantityOnHand }}</q-td>
          </template>
          <template #body-cell-purchaseUnitCost="props">
            <q-td :props="props" class="text-right">{{ formatMoney(props.row.purchaseUnitCost) }}</q-td>
          </template>
          <template #body-cell-totalValue="props">
            <q-td :props="props" class="text-right">{{ formatMoney(props.row.totalValue) }}</q-td>
          </template>
        </q-table>
      </template>
    </div>

    <!-- Crear / editar movimiento -->
    <CompanyFormDialog
      v-model="movementDialog"
      :title="editingMovementId ? 'Editar movimiento' : 'Nuevo movimiento'"
      icon="swap_horiz"
      wide
      sales-document
    >
      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-4">
          <q-select v-model="movForm.warehouseId" :options="warehouseOptions" label="Bodega *" outlined dense emit-value map-options />
        </div>
        <div class="col-12 col-md-4">
          <q-select v-model="movForm.movementTypeId" :options="movementTypeOptions" label="Tipo *" outlined dense emit-value map-options />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="movForm.movementDate" type="date" label="Fecha *" outlined dense />
        </div>
        <div v-if="isTransferOutType" class="col-12 col-md-4">
          <q-select v-model="movForm.targetWarehouseId" :options="targetWarehouseOptions" label="Bodega destino *" outlined dense emit-value map-options />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="movForm.referenceNumber" label="Referencia" outlined dense />
        </div>
        <div v-if="needsThirdParty" class="col-12 col-md-4">
          <q-select
            v-model="movForm.clientId"
            :options="clientOptionsFiltered"
            label="Tercero *"
            outlined dense emit-value map-options use-input input-debounce="200"
            @filter="filterClients"
          >
            <template #after-options>
              <q-item v-if="canCreateClient" clickable @click="openNewClientDialog">
                <q-item-section avatar><q-icon name="person_add" color="primary" /></q-item-section>
                <q-item-section class="text-primary">Nuevo cliente…</q-item-section>
              </q-item>
            </template>
            <template #no-option>
              <q-item v-if="canCreateClient" clickable @click="openNewClientDialog">
                <q-item-section avatar><q-icon name="person_add" color="primary" /></q-item-section>
                <q-item-section class="text-primary">Nuevo cliente…</q-item-section>
              </q-item>
              <q-item v-else><q-item-section class="text-grey">Sin resultados</q-item-section></q-item>
            </template>
          </q-select>
        </div>
        <div class="col-12">
          <q-input v-model="movForm.notes" label="Notas" outlined dense type="textarea" autogrow />
        </div>
      </div>

      <div class="text-subtitle2 q-mb-sm">Líneas</div>
      <div v-for="(line, idx) in movForm.lines" :key="idx" class="row q-col-gutter-sm q-mb-sm items-start">
        <div class="col-12 col-md-4">
          <q-select
            v-model="line.articleId"
            :options="articleOptionsForLine(line)"
            label="Artículo *"
            outlined dense emit-value map-options
            use-input input-debounce="200"
            @filter="(val, update) => filterArticlesForLine(val, update, line)"
            @update:model-value="onLineArticleChange(line, idx)"
          />
        </div>
        <div v-if="isEntry" class="col-6 col-md-2">
          <q-input v-model.number="line.quantity" type="number" min="0" step="any" label="Cantidad *" outlined dense />
        </div>
        <div v-if="isEntry" class="col-6 col-md-2">
          <q-input v-model.number="line.unitCost" type="number" min="0" step="any" label="Costo compra *" outlined dense />
        </div>
        <div v-if="isEntry && lineNeedsSupplierLot(line)" class="col-6 col-md-2">
          <q-input v-model="line.supplierLotNumber" label="Lote proveedor *" outlined dense />
        </div>
        <div v-if="isEntry && lineNeedsExpiry(line)" class="col-6 col-md-2">
          <q-input v-model="line.expiryDate" type="date" label="Vencimiento *" outlined dense />
        </div>
        <div v-if="!isEntry" class="col-6 col-md-3">
          <q-select
            v-model="line.lotId"
            :options="lotOptionsForLine(line)"
            label="Lote *"
            outlined dense emit-value map-options
            @update:model-value="onLineLotChange(line, idx)"
          />
        </div>
        <div v-if="!isEntry" class="col-6 col-md-2">
          <q-input
            v-model.number="line.quantity"
            type="number"
            min="0"
            :max="maxQuantityForLine(line, idx)"
            step="any"
            label="Cantidad *"
            outlined dense
            :hint="lineQuantityHint(line, idx)"
            @update:model-value="onLineQuantityChange(line, idx)"
          />
        </div>
        <div v-if="isSaleType && !isEntry" class="col-6 col-md-2">
          <q-input
            v-model.number="line.unitPrice"
            type="number"
            min="0"
            step="any"
            label="Precio venta *"
            outlined dense
          />
        </div>
        <div class="col-auto">
          <q-btn flat round dense icon="delete" color="negative" @click="removeLine(idx)" />
        </div>
      </div>
      <q-btn flat dense icon="add" label="Agregar línea" color="primary" @click="addLine" />

      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" :label="editingMovementId ? 'Guardar cambios' : 'Guardar borrador'" :loading="saving" unelevated @click="saveMovement" />
      </template>
    </CompanyFormDialog>

    <!-- Nuevo cliente (tercero) -->
    <q-dialog v-model="newClientDialog" persistent maximized transition-show="slide-up" transition-hide="slide-down">
      <q-card>
        <q-bar class="bg-primary text-white">
          <div class="text-subtitle1">Nuevo cliente</div>
          <q-space />
          <q-btn flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <ClientFormFields
            v-model="clientForm"
            :dian-lookup-fn="dianClientLookup"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Guardar cliente" :loading="saving" unelevated @click="saveNewClient" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Ver movimiento -->
    <CompanyFormDialog v-model="viewDialog" :title="selectedMovement?.documentNumber || 'Movimiento'" icon="visibility" wide document-view>
      <div v-if="selectedMovement" class="q-gutter-xs q-mb-md">
        <div><strong>Tipo:</strong> {{ selectedMovement.movementTypeCode }} — {{ selectedMovement.movementTypeName }}</div>
        <div><strong>Bodega:</strong> {{ selectedMovement.warehouseName }}</div>
        <div><strong>Estado:</strong> {{ statusLabel(selectedMovement.status) }}</div>
        <div><strong>Total:</strong> {{ formatMoney(selectedMovement.totalValue) }}</div>
        <div v-if="selectedMovement.invoiceId">
          <strong>Documento venta:</strong>
          {{ selectedMovement.invoiceFullNumber || selectedMovement.invoiceInternalNumber || selectedMovement.invoiceId }}
        </div>
      </div>
      <q-markup-table v-if="selectedMovement?.details?.length" flat bordered dense>
        <thead>
          <tr>
            <th>Artículo</th>
            <th>Lote</th>
            <th class="text-right">Cant.</th>
            <th class="text-right">{{ isViewSaleMovement ? 'Precio venta' : 'Costo' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in selectedMovement.details" :key="d.id">
            <td>{{ d.articleCode }} — {{ d.articleName }}</td>
            <td>{{ d.internalLotNumber || '—' }}</td>
            <td class="text-right">{{ d.quantity }}</td>
            <td class="text-right">{{ formatMoney(d.unitCost) }}</td>
          </tr>
        </tbody>
      </q-markup-table>
      <template #actions>
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
        <q-btn
          v-if="canGenerateInvoice(selectedMovement)"
          flat icon="receipt_long" label="Generar factura" color="secondary"
          @click="openInvoiceDialog(selectedMovement)"
        />
        <q-btn flat icon="picture_as_pdf" label="PDF" color="primary" @click="openSelectedMovementPdf" />
        <q-btn flat icon="table_view" label="Excel" color="primary" :loading="exporting" @click="downloadSelectedMovementExcel" />
      </template>
    </CompanyFormDialog>

    <InventarioReportPdfDialog
      v-model="pdfDialogOpen"
      :title="pdfDialogTitle"
      :loader="pdfLoader"
    />

    <q-dialog v-model="invoiceDialog" persistent>
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">Generar documento de venta</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            Movimiento {{ invoiceTarget?.documentNumber }}
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none q-gutter-md">
          <q-option-group
            v-model="invoiceForm.mode"
            :options="invoiceModeOptions"
            type="radio"
            inline
          />
          <q-select
            v-if="invoiceForm.mode === 'factura'"
            v-model="invoiceForm.dianResolutionId"
            :options="invoiceResolutionOptions"
            label="Resolución DIAN *"
            outlined dense emit-value map-options
          />
          <q-input
            v-model.number="invoiceForm.taxRate"
            type="number"
            min="0"
            max="100"
            step="any"
            label="IVA (%)"
            outlined dense
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Generar" :loading="saving" unelevated @click="submitCreateInvoice" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { hasPermission } from 'src/utils/auth.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import ClientFormFields from 'src/components/company/ClientFormFields.vue'
import InventarioReportPdfDialog from 'src/components/company/inventario/InventarioReportPdfDialog.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'

const $q = useQuasar()
const tab = useCompanyPageTab(['movimientos', 'existencias'], 'movimientos')

const pageMetaMap = {
  movimientos: { title: 'Movimientos', icon: 'swap_horiz', subtitle: 'Entradas, salidas y traslados de inventario' },
  existencias: { title: 'Existencias', icon: 'inventory', subtitle: 'Stock por bodega, artículo y lote' },
}
const pageMeta = computed(() => pageMetaMap[tab.value])

const loading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const pdfDialogOpen = ref(false)
const pdfDialogTitle = ref('')
const pdfLoader = ref(null)
const warehouses = ref([])
const articles = ref([])
const movementTypes = ref([])
const movementConfig = ref({ transferOut: '09', transferIn: '10', saleOut: '02' })
const movements = ref([])
const balances = ref([])
const movementBalances = ref([])
const filterWarehouseId = ref(null)
const balanceWarehouseId = ref(null)

const movementDialog = ref(false)
const viewDialog = ref(false)
const newClientDialog = ref(false)
const editingMovementId = ref(null)
const selectedMovement = ref(null)
const clients = ref([])
const clientOptionsFiltered = ref([])

const invoiceDialog = ref(false)
const invoiceTarget = ref(null)
const invoiceResolutions = ref([])
const invoiceForm = reactive({
  mode: 'prefactura',
  dianResolutionId: null,
  taxRate: 19,
})

const canCreateInvoice = computed(() => hasPermission('ventas.cotizar'))
const canFacturar = computed(() => hasPermission('ventas.facturar'))

const invoiceModeOptions = computed(() => {
  const opts = [{ label: 'Prefactura (borrador)', value: 'prefactura' }]
  if (canFacturar.value) {
    opts.push({ label: 'Factura DIAN (borrador)', value: 'factura' })
  }
  return opts
})

const invoiceResolutionOptions = computed(() =>
  invoiceResolutions.value
    .filter((r) => r.isActive && r.documentType === '01')
    .map((r) => ({ label: `${r.prefix} — ${r.resolutionNumber}`, value: r.id }))
)

function emptyClientForm() {
  return {
    documentType: '13',
    documentNumber: '',
    verificationDigit: '',
    personType: 'natural',
    taxLevelCode: 'R-99-PN',
    businessName: '',
    firstName: '',
    middleName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    cityCode: '',
    cityName: '',
    departmentName: '',
    departmentCode: '',
    countryCode: 'CO',
  }
}

const movForm = reactive({
  warehouseId: null,
  targetWarehouseId: null,
  movementTypeId: null,
  movementDate: new Date().toISOString().slice(0, 10),
  referenceNumber: '',
  clientId: null,
  notes: '',
  lines: [],
})

const clientForm = reactive(emptyClientForm())

const warehouseOptions = computed(() =>
  warehouses.value.filter((w) => w.isActive).map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id }))
)

const targetWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((o) => o.value !== movForm.warehouseId)
)

const movementTypeOptions = computed(() =>
  movementTypes.value.map((t) => ({ label: `${t.code} — ${t.name}`, value: t.id, direction: t.direction, code: t.code }))
)

const selectedMovementType = computed(() =>
  movementTypes.value.find((t) => t.id === movForm.movementTypeId)
)

const isEntry = computed(() => selectedMovementType.value?.direction === 'entrada')
const isTransferOutType = computed(() => selectedMovementType.value?.code === movementConfig.value?.transferOut)
const isTransferMovement = computed(() => isTransferMovementCode(selectedMovementType.value?.code))
const isSaleType = computed(() => isSaleMovementCode(selectedMovementType.value?.code))
const needsThirdParty = computed(() => !isTransferMovement.value)
const canCreateClient = computed(() => hasPermission('ventas.clientes'))

function isSaleMovementCode(code) {
  return code === movementConfig.value?.saleOut
}

function isTransferOutMovementCode(code) {
  return code === movementConfig.value?.transferOut
}

function isTransferMovementCode(code) {
  return code === movementConfig.value?.transferOut || code === movementConfig.value?.transferIn
}

function canGenerateInvoice(row) {
  if (!row || !canCreateInvoice.value) return false
  if (row.status !== 'confirmado' || row.invoiceId) return false
  return isSaleMovementCode(row.movementTypeCode)
}

const isViewSaleMovement = computed(() =>
  selectedMovement.value ? isSaleMovementCode(selectedMovement.value.movementTypeCode) : false
)

const articleOptions = computed(() =>
  articles.value.filter((a) => a.isActive).map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id, article: a }))
)

const articleOptionsFilteredByLine = ref({})

function articlesWithStockInWarehouse() {
  if (!movForm.warehouseId) return new Set()
  const ids = new Set()
  for (const b of movementBalances.value) {
    if (b.warehouseId === movForm.warehouseId && Number(b.quantityOnHand) > 0) {
      ids.add(b.articleId)
    }
  }
  return ids
}

function articleStockTotal(articleId) {
  return movementBalances.value
    .filter((b) => b.articleId === articleId && b.warehouseId === movForm.warehouseId)
    .reduce((sum, b) => sum + Number(b.quantityOnHand), 0)
}

function buildArticleOptions(line) {
  if (isEntry.value) return articleOptions.value
  const stockIds = articlesWithStockInWarehouse()
  return articles.value
    .filter((a) => a.isActive && stockIds.has(a.id))
    .map((a) => ({
      label: `${a.code} — ${a.name} (${articleStockTotal(a.id)} und.)`,
      value: a.id,
      article: a,
    }))
}

function articleOptionsForLine(line) {
  const key = line.articleId || '_new'
  return articleOptionsFilteredByLine.value[key] ?? buildArticleOptions(line)
}

function filterArticlesForLine(val, update, line) {
  update(() => {
    const needle = (val || '').toLowerCase()
    const options = buildArticleOptions(line).filter((o) =>
      o.label.toLowerCase().includes(needle)
    )
    const key = line.articleId || '_new'
    articleOptionsFilteredByLine.value[key] = options
  })
}

function getBalanceForLine(line) {
  if (!line.lotId || !movForm.warehouseId) return null
  return movementBalances.value.find(
    (b) => b.lotId === line.lotId
      && b.warehouseId === movForm.warehouseId
      && b.articleId === line.articleId,
  )
}

function maxQuantityForLine(line, lineIndex) {
  const balance = getBalanceForLine(line)
  if (!balance) return undefined
  let available = Number(balance.quantityOnHand)
  movForm.lines.forEach((l, idx) => {
    if (idx !== lineIndex && l.lotId === line.lotId) {
      available -= Number(l.quantity) || 0
    }
  })
  return Math.max(0, available)
}

function lineQuantityHint(line, lineIndex) {
  if (isEntry.value) return undefined
  const max = maxQuantityForLine(line, lineIndex)
  if (max == null) return 'Seleccione lote'
  return `Disponible: ${max} und.`
}

function onLineArticleChange(line) {
  line.lotId = null
  if (isSaleType.value && !isEntry.value) {
    const art = articles.value.find((a) => a.id === line.articleId)
    if (art && !line.unitPrice) {
      line.unitPrice = Number(art.averageCost) || 0
    }
  }
  if (!isEntry.value) {
    const maxStock = articleStockTotal(line.articleId)
    if (maxStock > 0 && line.quantity > maxStock) {
      line.quantity = maxStock
    }
  }
}

function onLineLotChange(line, lineIndex) {
  const max = maxQuantityForLine(line, lineIndex)
  if (max != null && Number(line.quantity) > max) {
    line.quantity = max
  }
}

function onLineQuantityChange(line, lineIndex) {
  const max = maxQuantityForLine(line, lineIndex)
  if (max == null) return
  if (Number(line.quantity) > max) {
    line.quantity = max
    $q.notify({ type: 'warning', message: `Cantidad máxima disponible: ${max}` })
  }
}

function validateExitLines() {
  if (isEntry.value) return true
  for (let idx = 0; idx < movForm.lines.length; idx += 1) {
    const line = movForm.lines[idx]
    if (!line.articleId) continue
    if (!line.lotId) {
      $q.notify({ type: 'warning', message: 'Seleccione el lote en cada línea de salida' })
      return false
    }
    const max = maxQuantityForLine(line, idx)
    if (max != null && Number(line.quantity) > max) {
      const art = articles.value.find((a) => a.id === line.articleId)
      $q.notify({
        type: 'warning',
        message: `Cantidad excede existencia para ${art?.code || 'artículo'} (máx. ${max})`,
      })
      return false
    }
    if (!Number(line.quantity) || Number(line.quantity) <= 0) {
      $q.notify({ type: 'warning', message: 'Indique cantidad mayor a cero en cada línea' })
      return false
    }
  }
  return true
}

const movementColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 120px' },
  { name: 'documentNumber', label: 'Documento', field: 'documentNumber', align: 'left', sortable: true },
  { name: 'movementDate', label: 'Fecha', field: 'movementDate', align: 'left', sortable: true },
  { name: 'movementTypeName', label: 'Tipo', field: 'movementTypeName', align: 'left' },
  { name: 'warehouseName', label: 'Bodega', field: 'warehouseName', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
  { name: 'totalQuantity', label: 'Cant.', field: 'totalQuantity', align: 'right' },
  { name: 'totalValue', label: 'Valor', field: 'totalValue', align: 'right' },
]

const balanceColumns = [
  { name: 'warehouseName', label: 'Bodega', field: 'warehouseName', align: 'left' },
  { name: 'articleCode', label: 'Código', field: 'articleCode', align: 'left' },
  { name: 'articleName', label: 'Artículo', field: 'articleName', align: 'left' },
  { name: 'internalLotNumber', label: 'Lote int.', field: 'internalLotNumber', align: 'left' },
  { name: 'supplierLotNumber', label: 'Lote prov.', field: 'supplierLotNumber', align: 'left' },
  { name: 'expiryDate', label: 'Vence', field: 'expiryDate', align: 'left' },
  { name: 'quantityOnHand', label: 'Existencia', field: 'quantityOnHand', align: 'right' },
  { name: 'purchaseUnitCost', label: 'Costo compra', field: 'purchaseUnitCost', align: 'right' },
  { name: 'totalValue', label: 'Valor', field: 'totalValue', align: 'right' },
]

function formatMoney(v) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0)
}

function statusLabel(s) {
  return { borrador: 'Borrador', confirmado: 'Confirmado', anulado: 'Anulado' }[s] || s
}

function statusColor(s) {
  return { borrador: 'grey-7', confirmado: 'positive', anulado: 'negative' }[s] || 'grey'
}

function lineNeedsSupplierLot(line) {
  const art = articles.value.find((a) => a.id === line.articleId)
  return art && !art.withoutSupplierLot
}

function lineNeedsExpiry(line) {
  const art = articles.value.find((a) => a.id === line.articleId)
  return art?.requiresExpiryDate
}

function lotOptionsForLine(line) {
  if (!line.articleId || !movForm.warehouseId) return []
  return movementBalances.value
    .filter((b) => b.articleId === line.articleId && b.warehouseId === movForm.warehouseId && b.quantityOnHand > 0)
    .map((b) => ({
      label: `${b.internalLotNumber} (${b.quantityOnHand} und.) vence ${b.expiryDate || '—'}`,
      value: b.lotId,
      quantityOnHand: b.quantityOnHand,
    }))
}

function emptyLine() {
  return { articleId: null, quantity: 1, unitCost: 0, unitPrice: 0, supplierLotNumber: '', expiryDate: '', lotId: null }
}

function mapClientOptions(list) {
  return list.map((c) => ({
    label: `${c.fullName} (${c.documentNumber})`,
    value: c.id,
  }))
}

function filterClients(val, update) {
  update(() => {
    const needle = (val || '').toLowerCase()
    clientOptionsFiltered.value = mapClientOptions(
      clients.value.filter((c) =>
        c.fullName.toLowerCase().includes(needle)
        || (c.documentNumber || '').includes(val || '')
      )
    )
  })
}

function dianClientLookup(params) {
  return api.inventario.catalogClientDianLookup(params)
}

function openNewClientDialog() {
  Object.assign(clientForm, emptyClientForm())
  newClientDialog.value = true
}

async function saveNewClient() {
  saving.value = true
  try {
    const saved = await api.inventario.createCatalogClient({ ...clientForm })
    clients.value = await api.inventario.catalogClients()
    clientOptionsFiltered.value = mapClientOptions(clients.value)
    movForm.clientId = saved.id
    newClientDialog.value = false
    if (saved?.dianValidation?.warning) {
      $q.notify({ type: 'warning', message: saved.dianValidation.warning })
    } else if (saved?.dianValidation?.validated) {
      $q.notify({ type: 'info', message: 'Cliente validado con DIAN', timeout: 2000 })
    } else {
      $q.notify({ type: 'positive', message: 'Cliente creado' })
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function addLine() {
  movForm.lines.push(emptyLine())
}

function removeLine(idx) {
  movForm.lines.splice(idx, 1)
}

function findClientIdByThirdParty(thirdPartyDocument, thirdPartyName) {
  if (!thirdPartyDocument && !thirdPartyName) return null
  const match = clients.value.find((c) =>
    (thirdPartyDocument && (c.documentNumber === thirdPartyDocument || c.documentDisplay === thirdPartyDocument))
    || (thirdPartyName && c.fullName === thirdPartyName)
  )
  return match?.id || null
}

function openMovementDialog() {
  editingMovementId.value = null
  articleOptionsFilteredByLine.value = {}
  Object.assign(movForm, {
    warehouseId: filterWarehouseId.value || warehouses.value.find((w) => w.isDefault)?.id || warehouses.value[0]?.id || null,
    targetWarehouseId: null,
    movementTypeId: movementTypes.value.find((t) => t.code === '01')?.id || null,
    movementDate: new Date().toISOString().slice(0, 10),
    referenceNumber: '', clientId: null, notes: '',
    lines: [emptyLine()],
  })
  clientOptionsFiltered.value = mapClientOptions(clients.value)
  movementDialog.value = true
  loadMovementBalances()
}

async function openEditMovement(row) {
  saving.value = true
  try {
    const movement = await api.inventario.movement(row.id)
    editingMovementId.value = movement.id
    articleOptionsFilteredByLine.value = {}
    Object.assign(movForm, {
      warehouseId: movement.warehouseId,
      targetWarehouseId: movement.targetWarehouseId,
      movementTypeId: movement.movementTypeId,
      movementDate: String(movement.movementDate || '').slice(0, 10),
      referenceNumber: movement.referenceNumber || '',
      clientId: movement.clientId || findClientIdByThirdParty(movement.thirdPartyDocument, movement.thirdPartyName),
      notes: movement.notes || '',
      lines: (movement.details?.length ? movement.details : [emptyLine()]).map((d) => ({
        articleId: d.articleId,
        quantity: d.quantity,
        unitCost: d.unitCost,
        unitPrice: d.unitCost,
        supplierLotNumber: d.supplierLotNumber || '',
        expiryDate: d.expiryDate ? String(d.expiryDate).slice(0, 10) : '',
        lotId: d.lotId,
      })),
    })
    clientOptionsFiltered.value = mapClientOptions(clients.value)
    await loadMovementBalances()
    movForm.lines.forEach((line, idx) => {
      if (!isEntry.value && line.lotId) onLineLotChange(line, idx)
    })
    movementDialog.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function loadMovementBalances() {
  if (!movForm.warehouseId) {
    movementBalances.value = []
    return
  }
  try {
    movementBalances.value = await api.inventario.balances({ warehouseId: movForm.warehouseId })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function loadCatalog() {
  const [wh, art, types, cli, config] = await Promise.all([
    api.inventario.warehouses(),
    api.inventario.articles(),
    api.inventario.movementTypes(),
    api.inventario.catalogClients(),
    api.inventario.movementConfig(),
  ])
  warehouses.value = wh
  articles.value = art
  movementTypes.value = types
  clients.value = cli
  movementConfig.value = config
  clientOptionsFiltered.value = mapClientOptions(clients.value)
}

async function loadMovements() {
  loading.value = true
  try {
    movements.value = await api.inventario.movements(
      filterWarehouseId.value ? { warehouseId: filterWarehouseId.value } : {}
    )
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

async function loadBalances() {
  loading.value = true
  try {
    balances.value = await api.inventario.balances(
      balanceWarehouseId.value ? { warehouseId: balanceWarehouseId.value } : {}
    )
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

async function saveMovement() {
  if (needsThirdParty.value && !movForm.clientId) {
    $q.notify({ type: 'warning', message: 'Seleccione un tercero de la lista de clientes' })
    return
  }
  if (!validateExitLines()) return
  if (isSaleType.value && !isEntry.value) {
    for (const line of movForm.lines) {
      if (!line.articleId) continue
      if (!Number(line.unitPrice) || Number(line.unitPrice) <= 0) {
        $q.notify({ type: 'warning', message: 'Indique precio de venta en cada línea' })
        return
      }
    }
  }
  saving.value = true
  const isEdit = !!editingMovementId.value
  try {
    const payload = {
      warehouseId: movForm.warehouseId,
      targetWarehouseId: movForm.targetWarehouseId,
      movementTypeId: movForm.movementTypeId,
      movementDate: movForm.movementDate,
      referenceNumber: movForm.referenceNumber,
      clientId: movForm.clientId,
      notes: movForm.notes,
      lines: movForm.lines.filter((l) => l.articleId).map((l) => ({
        articleId: l.articleId,
        quantity: l.quantity,
        lotId: l.lotId,
        unitCost: l.unitCost,
        unitPrice: l.unitPrice,
        supplierLotNumber: l.supplierLotNumber,
        expiryDate: l.expiryDate,
      })),
    }
    if (isEdit) {
      await api.inventario.updateMovement(editingMovementId.value, payload)
    } else {
      await api.inventario.createMovement(payload)
    }
    movementDialog.value = false
    editingMovementId.value = null
    await loadMovements()
    $q.notify({
      type: 'positive',
      message: isEdit ? 'Movimiento actualizado' : 'Movimiento guardado en borrador',
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function movementExportParams() {
  const params = {}
  if (filterWarehouseId.value) params.warehouseId = filterWarehouseId.value
  return params
}

function balanceExportParams() {
  const params = {}
  if (balanceWarehouseId.value) params.warehouseId = balanceWarehouseId.value
  return params
}

function openMovimientosPdf() {
  pdfDialogTitle.value = 'Informe de movimientos'
  pdfLoader.value = () => api.inventario.fetchMovimientosReportPdf(movementExportParams())
  pdfDialogOpen.value = true
}

function openExistenciasPdf() {
  pdfDialogTitle.value = 'Informe de existencias'
  pdfLoader.value = () => api.inventario.fetchExistenciasReportPdf(balanceExportParams())
  pdfDialogOpen.value = true
}

function openMovementPdf(row) {
  pdfDialogTitle.value = `Movimiento ${row.documentNumber || ''}`.trim()
  pdfLoader.value = () => api.inventario.fetchMovementPdf(row.id)
  pdfDialogOpen.value = true
}

function openSelectedMovementPdf() {
  if (!selectedMovement.value?.id) return
  openMovementPdf(selectedMovement.value)
}

async function downloadMovimientosExcel() {
  exporting.value = true
  try {
    const filename = await api.inventario.downloadMovimientosReportExcel(movementExportParams())
    $q.notify({ type: 'positive', message: `Descargado: ${filename}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    exporting.value = false
  }
}

async function downloadExistenciasExcel() {
  exporting.value = true
  try {
    const filename = await api.inventario.downloadExistenciasReportExcel(balanceExportParams())
    $q.notify({ type: 'positive', message: `Descargado: ${filename}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    exporting.value = false
  }
}

async function downloadSelectedMovementExcel() {
  if (!selectedMovement.value?.id) return
  exporting.value = true
  try {
    const filename = await api.inventario.downloadMovementExcel(selectedMovement.value.id)
    $q.notify({ type: 'positive', message: `Descargado: ${filename}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    exporting.value = false
  }
}

async function viewMovement(row) {
  selectedMovement.value = await api.inventario.movement(row.id)
  viewDialog.value = true
}

async function confirmMovement(row) {
  const isTransfer = isTransferOutMovementCode(row.movementTypeCode)
  $q.dialog({
    title: 'Confirmar movimiento',
    message: isTransfer
      ? `¿Confirma ${row.documentNumber}? Se registrará la salida y se creará automáticamente la entrada en la bodega destino.`
      : `¿Confirma ${row.documentNumber}? Se actualizarán las existencias.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      const result = await api.inventario.confirmMovement(row.id)
      await Promise.all([loadMovements(), loadBalances()])
      if (result?.relatedMovementDocument) {
        $q.notify({
          type: 'positive',
          message: `Traslado confirmado. Entrada creada: ${result.relatedMovementDocument}`,
          timeout: 5000,
        })
      } else {
        $q.notify({ type: 'positive', message: 'Movimiento confirmado' })
      }
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

async function voidMovement(row) {
  try {
    await api.inventario.voidMovement(row.id, 'Anulado por usuario')
    await loadMovements()
    $q.notify({ type: 'positive', message: 'Movimiento anulado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function loadInvoiceResolutions() {
  if (!canFacturar.value) return
  try {
    invoiceResolutions.value = await api.ventas.resolutions({ documentType: '01' })
  } catch {
    invoiceResolutions.value = []
  }
}

function openInvoiceDialog(row) {
  invoiceTarget.value = row
  invoiceForm.mode = 'prefactura'
  invoiceForm.dianResolutionId = invoiceResolutionOptions.value[0]?.value || null
  invoiceForm.taxRate = 19
  invoiceDialog.value = true
}

async function submitCreateInvoice() {
  if (!invoiceTarget.value?.id) return
  if (invoiceForm.mode === 'factura' && !invoiceForm.dianResolutionId) {
    $q.notify({ type: 'warning', message: 'Seleccione la resolución DIAN' })
    return
  }
  saving.value = true
  try {
    const result = await api.inventario.createMovementInvoice(invoiceTarget.value.id, {
      dianResolutionId: invoiceForm.mode === 'factura' ? invoiceForm.dianResolutionId : null,
      emit: false,
      taxRate: invoiceForm.taxRate,
    })
    invoiceDialog.value = false
    await loadMovements()
    if (selectedMovement.value?.id === invoiceTarget.value.id) {
      selectedMovement.value = result.movement
    }
    const docLabel = result.invoice.fullNumber || result.invoice.internalNumber || result.invoice.id
    $q.notify({
      type: 'positive',
      message: `Documento creado: ${docLabel}`,
      timeout: 5000,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

watch(tab, (v) => {
  if (v === 'existencias') loadBalances()
  else loadMovements()
})

watch(() => movForm.warehouseId, () => {
  if (movementDialog.value) {
    loadMovementBalances()
    if (!isEntry.value) {
      movForm.lines.forEach((line) => {
        line.articleId = null
        line.lotId = null
      })
      articleOptionsFilteredByLine.value = {}
    }
  }
})

watch(() => movForm.movementTypeId, () => {
  if (!movementDialog.value) return
  articleOptionsFilteredByLine.value = {}
  movForm.lines.forEach((line) => {
    line.lotId = null
    if (!isEntry.value && line.articleId && !articlesWithStockInWarehouse().has(line.articleId)) {
      line.articleId = null
    }
  })
})

onMounted(async () => {
  await loadCatalog()
  await loadInvoiceResolutions()
  await loadMovements()
  await loadBalances()
})
</script>
