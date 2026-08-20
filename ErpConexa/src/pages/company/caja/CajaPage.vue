<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" :subtitle="pageMeta.subtitle" />

    <div class="company-page-card">
      <!-- OPERACIÓN -->
      <template v-if="tab === 'operacion'">
        <div class="row q-col-gutter-md q-mb-md items-end">
          <div v-if="showRegisterSelector" class="col-12 col-md-4">
            <q-select
              v-model="selectedRegisterId"
              :options="registerOptions"
              label="Caja *"
              outlined
              dense
              emit-value
              map-options
              @update:model-value="loadCurrentSession"
            />
          </div>
          <div v-else-if="assignedRegisterLabel" class="col-12 col-md-4">
            <q-input :model-value="assignedRegisterLabel" label="Caja asignada" outlined dense readonly />
          </div>
          <div class="col-12 col-md-8 row q-gutter-sm">
            <q-btn
              v-if="hasPermission('caja.abrir') && !currentSession"
              color="primary"
              icon="lock_open"
              label="Abrir caja"
              unelevated
              :disable="!selectedRegisterId"
              @click="openSessionDialog = true"
            />
            <q-btn
              v-if="hasPermission('caja.registrar') && currentSession?.status === 'abierta'"
              color="primary"
              icon="add"
              label="Nuevo recibo"
              unelevated
              @click="openReceiptDialog()"
            />
            <q-btn
              v-if="hasPermission('caja.registrar') && currentSession?.status === 'abierta' && currentSession.cashExpected > 0 && !currentSession.hasEgresoCaja"
              color="deep-orange"
              icon="money_off"
              label="Egreso de caja"
              outline
              @click="saveEgresoCaja"
            />
            <q-btn
              v-if="hasPermission('caja.cerrar') && currentSession?.status === 'abierta'"
              color="orange-9"
              icon="lock"
              label="Cerrar caja"
              outline
              @click="openCloseDialog"
            />
          </div>
        </div>

        <q-banner v-if="!registers.length" dense rounded class="bg-orange-1 text-orange-10 q-mb-md">
          No hay cajas configuradas. Cree al menos una en la pestaña <strong>Cajas</strong>.
        </q-banner>

        <q-banner v-if="noAssignedRegister" dense rounded class="bg-orange-1 text-orange-10 q-mb-md">
          No tiene caja asignada. Contacte al administrador para asociarle una caja.
        </q-banner>

        <q-card v-if="currentSession" flat bordered class="caja-session-summary q-mb-md">
          <q-card-section class="q-py-sm q-px-md">
            <div class="caja-session-summary__strip">
              <div
                v-for="item in sessionSummaryItems"
                :key="item.label"
                class="caja-session-summary__item"
              >
                <span class="caja-session-summary__label">{{ item.label }}</span>
                <span
                  class="caja-session-summary__value"
                  :class="{
                    'text-positive': item.positive,
                    'text-negative': item.negative,
                  }"
                >
                  <q-badge v-if="item.badge" :color="item.badgeColor">{{ item.value }}</q-badge>
                  <template v-else>{{ item.value }}</template>
                </span>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-banner
          v-if="currentSession?.status === 'cerrada'"
          dense rounded class="bg-grey-2 text-grey-9 q-mb-md"
        >
          La caja está cerrada. Los recibos solo están disponibles en el historial de aperturas.
        </q-banner>

        <q-banner
          v-if="currentSession?.status === 'abierta' && currentSession.cashExpected > 0 && !currentSession.hasEgresoCaja"
          dense rounded class="bg-amber-1 text-amber-10 q-mb-md"
        >
          Debe registrar el <strong>egreso de caja</strong> antes de cerrar, salvo que la caja permita cierre con saldo o tenga el permiso correspondiente.
        </q-banner>

        <q-table
          v-if="currentSession?.status === 'abierta'"
          class="company-data-table"
          :rows="receipts"
          :columns="receiptColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingReceipts"
        >
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn
                v-if="hasPermission('caja.registrar') && isEditableReceipt(props.row)"
                flat dense round size="sm" icon="edit" color="primary"
                @click="openReceiptDialog(props.row)"
              >
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="hasPermission('caja.registrar') && isDiscardableReceipt(props.row)"
                flat dense round size="sm" icon="delete_outline" color="negative"
                @click="discardReceipt(props.row)"
              >
                <q-tooltip>Desechar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="hasPermission('caja.registrar') && isConfirmableReceipt(props.row)"
                flat dense round size="sm" icon="check_circle" color="positive"
                @click="confirmReceipt(props.row)"
              >
                <q-tooltip>Confirmar recibo</q-tooltip>
              </q-btn>
              <q-btn
                v-if="hasPermission('caja.registrar') && isVoidableReceipt(props.row)"
                flat dense round size="sm" icon="block" color="orange-9"
                @click="voidReceipt(props.row)"
              >
                <q-tooltip>Anular</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canPrintReceipt(props.row)"
                flat dense round size="sm" icon="print" color="primary"
                @click="printReceipt(props.row)"
              >
                <q-tooltip>Imprimir recibo</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canEmitInvoice(props.row)"
                flat dense round size="sm" icon="receipt_long" color="secondary"
                @click="openInvoiceDialog(props.row)"
              >
                <q-tooltip>Emitir factura</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="receiptStatusColor(receiptStatus(props.row))">
                {{ normalizeReceipt(props.row).statusLabel }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-receiptNumber="props">
            <q-td :props="props"><strong>{{ props.row.receiptNumber }}</strong></q-td>
          </template>
          <template #body-cell-movementType="props">
            <q-td :props="props">
              <q-badge :color="props.row.movementType === 'ingreso' ? 'positive' : 'negative'">
                {{ props.row.movementType === 'ingreso' ? 'Ingreso' : 'Egreso' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-concept="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.concept }}</div>
              <div v-if="props.row.invoiceFullNumber" class="text-caption text-grey-7">
                Factura {{ props.row.invoiceFullNumber }}
              </div>
            </q-td>
          </template>
          <template #body-cell-amount="props">
            <q-td :props="props" :class="props.row.movementType === 'ingreso' ? 'text-positive' : 'text-negative'">
              {{ props.row.movementType === 'ingreso' ? '+' : '-' }}${{ formatMoney(props.row.amount) }}
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- CAJAS -->
      <template v-else-if="tab === 'cajas'">
        <div class="q-mb-md">
          <q-btn
            v-if="hasPermission('caja.configurar')"
            color="primary"
            icon="add"
            label="Nueva caja"
            unelevated
            @click="openRegisterDialog()"
          />
        </div>
        <q-table
          class="company-data-table"
          :rows="registers"
          :columns="registerColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingRegisters"
        >
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn
                v-if="hasPermission('caja.configurar')"
                flat dense round size="sm" icon="edit" color="primary"
                @click="openRegisterDialog(props.row)"
              />
            </q-td>
          </template>
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'grey'">
                {{ props.row.isActive ? 'Activa' : 'Inactiva' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-allowCloseWithBalance="props">
            <q-td :props="props">
              <q-icon :name="props.row.allowCloseWithBalance ? 'check_circle' : 'remove_circle_outline'"
                :color="props.row.allowCloseWithBalance ? 'positive' : 'grey'" />
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- HISTORIAL -->
      <template v-else-if="tab === 'historial'">
        <div class="row q-col-gutter-md q-mb-md items-end">
          <div v-if="showRegisterSelector" class="col-auto">
            <q-select
              v-model="historyRegisterId"
              :options="[{ label: 'Todas', value: null }, ...registerOptions]"
              label="Caja"
              outlined dense emit-value map-options clearable
              style="min-width:200px"
              @update:model-value="loadHistory"
            />
          </div>
          <div class="col-auto">
            <q-input v-model="historyFrom" type="date" label="Desde" outlined dense @update:model-value="loadHistory" />
          </div>
          <div class="col-auto">
            <q-input v-model="historyTo" type="date" label="Hasta" outlined dense @update:model-value="loadHistory" />
          </div>
        </div>
        <q-table
          class="company-data-table"
          :rows="historySessions"
          :columns="historyColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingHistory"
          @row-click="(_, row) => viewSessionDetail(row)"
        >
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="props.row.status === 'cerrada' ? 'grey' : 'positive'">
                {{ props.row.status === 'cerrada' ? 'Cerrada' : 'Abierta' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-balanceDifference="props">
            <q-td :props="props" :class="differenceClass(props.row.balanceDifference)">
              {{ props.row.balanceDifference != null ? '$' + formatMoney(props.row.balanceDifference) : '—' }}
            </q-td>
          </template>
        </q-table>
      </template>
    </div>

    <!-- Dialog abrir caja -->
    <q-dialog v-model="openSessionDialog" persistent>
      <q-card style="min-width:400px">
        <q-card-section><div class="text-h6">Apertura de caja</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <MoneyInput v-model="openForm.openingAmount" label="Saldo inicial *" />
          <q-input v-model="openForm.openingNotes" label="Observaciones" outlined dense type="textarea" autogrow />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Abrir" :loading="saving" unelevated @click="saveOpenSession" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog recibo -->
    <q-dialog v-model="receiptDialog" persistent @hide="editingReceiptId = null">
      <q-card style="min-width:520px">
        <q-card-section>
          <div class="text-h6">{{ editingReceiptId ? 'Editar recibo' : 'Nuevo recibo' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-select
            v-model="receiptForm.serviceId"
            :options="serviceOptionsFiltered"
            label="Servicio *"
            outlined dense emit-value map-options use-input input-debounce="200"
            @filter="filterServices"
            @update:model-value="onServiceSelected"
          >
            <template #after-options>
              <q-item v-if="canCreateService" clickable @click="openNewServiceDialog">
                <q-item-section avatar><q-icon name="add" color="primary" /></q-item-section>
                <q-item-section class="text-primary">Nuevo servicio…</q-item-section>
              </q-item>
            </template>
            <template #no-option>
              <q-item v-if="canCreateService" clickable @click="openNewServiceDialog">
                <q-item-section avatar><q-icon name="add" color="primary" /></q-item-section>
                <q-item-section class="text-primary">Nuevo servicio…</q-item-section>
              </q-item>
              <q-item v-else><q-item-section class="text-grey">Sin resultados</q-item-section></q-item>
            </template>
          </q-select>
          <q-select
            v-model="receiptForm.clientId"
            :options="clientOptionsFiltered"
            label="Cliente *"
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
          <q-select
            v-model="receiptForm.paymentMethod"
            :options="paymentMethodOptions"
            label="Forma de pago *"
            outlined dense emit-value map-options
          />
          <MoneyInput v-model="receiptForm.amount" label="Valor *" />
          <q-input v-model="receiptForm.notes" label="Notas" outlined dense type="textarea" autogrow />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" :label="editingReceiptId ? 'Guardar' : 'Registrar borrador'" :loading="saving" unelevated @click="saveReceipt" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog nuevo servicio -->
    <q-dialog v-model="newServiceDialog" persistent>
      <q-card style="min-width:420px">
        <q-card-section><div class="text-h6">Nuevo servicio</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="serviceForm.description" label="Descripción *" outlined dense autogrow type="textarea" />
          <MoneyInput v-model="serviceForm.basePrice" label="Precio base *" />
          <div v-if="nextServiceCodePreview" class="text-caption text-grey-7">
            Código sugerido: <strong>{{ nextServiceCodePreview }}</strong>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Guardar" :loading="saving" unelevated @click="saveNewService" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog nuevo cliente -->
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

    <!-- Dialog cierre -->
    <q-dialog v-model="closeDialog" persistent>
      <q-card style="min-width:560px; max-width:720px">
        <q-card-section>
          <div class="text-h6">Cierre de caja — {{ currentSession?.sessionNumber }}</div>
          <div class="text-caption text-grey-7">Indique el saldo contado por forma de pago</div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-markup-table flat bordered dense>
            <thead>
              <tr>
                <th>Forma de pago</th>
                <th class="text-right">Esperado</th>
                <th class="text-right">Contado</th>
                <th class="text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in closeBalances" :key="row.paymentMethod">
                <td>{{ row.label }}</td>
                <td class="text-right">${{ formatMoney(row.expectedAmount) }}</td>
                <td class="text-right">
                  <q-input
                    v-model.number="row.countedAmount"
                    dense outlined type="number" min="0" step="0.01"
                    style="max-width:120px;margin-left:auto"
                  />
                </td>
                <td class="text-right" :class="differenceClass(row.countedAmount - row.expectedAmount)">
                  ${{ formatMoney(row.countedAmount - row.expectedAmount) }}
                </td>
              </tr>
            </tbody>
          </q-markup-table>
          <q-input v-model="closeForm.closingNotes" label="Observaciones de cierre" outlined dense type="textarea" autogrow />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="orange-9" label="Confirmar cierre" :loading="saving" unelevated @click="saveCloseSession" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Detalle sesión historial -->
    <q-dialog v-model="detailDialog">
      <q-card v-if="sessionDetail" style="min-width:640px; max-width:900px">
        <q-card-section>
          <div class="text-h6">{{ sessionDetail.sessionNumber }} — {{ sessionDetail.registerName }}</div>
          <div class="text-caption text-grey-7">
            Apertura: {{ formatDateTime(sessionDetail.openedAt) }}
            <span v-if="sessionDetail.closedAt"> · Cierre: {{ formatDateTime(sessionDetail.closedAt) }}</span>
          </div>
        </q-card-section>
        <q-card-section>
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-4"><strong>Inicial:</strong> ${{ formatMoney(sessionDetail.openingAmount) }}</div>
            <div class="col-4"><strong>Ingresos:</strong> ${{ formatMoney(sessionDetail.totalIngress) }}</div>
            <div class="col-4"><strong>Egresos:</strong> ${{ formatMoney(sessionDetail.totalEgress) }}</div>
          </div>
          <div v-if="sessionDetail.closedWithBalance" class="q-mb-md text-amber-10">
            Cerrada con saldo pendiente: ${{ formatMoney(sessionDetail.carriedBalance) }}
          </div>
          <div v-if="sessionDetail.paymentBalances?.length" class="q-mb-md">
            <div class="text-subtitle2 q-mb-sm">Arqueo por forma de pago</div>
            <q-markup-table flat bordered dense>
              <thead>
                <tr><th>Forma</th><th>Esperado</th><th>Contado</th><th>Dif.</th></tr>
              </thead>
              <tbody>
                <tr v-for="b in sessionDetail.paymentBalances" :key="b.paymentMethod">
                  <td>{{ b.paymentMethodLabel }}</td>
                  <td>${{ formatMoney(b.expectedAmount) }}</td>
                  <td>${{ formatMoney(b.countedAmount) }}</td>
                  <td :class="differenceClass(b.difference)">${{ formatMoney(b.difference) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>
          <div class="text-subtitle2 q-mb-sm">Recibos y movimientos ({{ sessionDetail.receipts?.length || 0 }})</div>
          <q-list bordered separator dense>
            <q-item v-for="r in sessionDetail.receipts || []" :key="r.id">
              <q-item-section>
                <q-item-label>
                  {{ r.receiptNumber }} — {{ r.concept }}
                  <q-badge class="q-ml-xs" :color="receiptStatusColor(r.status)" :label="r.statusLabel" />
                </q-item-label>
                <q-item-label caption>
                  {{ r.paymentMethodLabel }} · {{ r.createdByName }}
                  <span v-if="r.invoiceFullNumber"> · Factura {{ r.invoiceFullNumber }}</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label :class="r.movementType === 'ingreso' ? 'text-positive' : 'text-negative'">
                  {{ r.movementType === 'ingreso' ? '+' : '-' }}${{ formatMoney(r.amount) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side v-if="canPrintReceipt(r)">
                <q-btn flat dense round icon="print" size="sm" @click.stop="printReceipt(r)" />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            icon="picture_as_pdf"
            label="Ver arqueo PDF"
            color="primary"
            @click="openArqueoPdfDialog"
          />
          <q-btn flat label="Cerrar" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog caja -->
    <q-dialog v-model="registerDialog" persistent>
      <q-card style="min-width:400px">
        <q-card-section><div class="text-h6">{{ registerForm.id ? 'Editar caja' : 'Nueva caja' }}</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input
            v-model="registerForm.code"
            label="Código *"
            outlined dense
            :readonly="!!registerForm.id"
            hint="Ej: CAJA-01"
          />
          <q-input v-model="registerForm.name" label="Nombre *" outlined dense />
          <q-input v-model="registerForm.description" label="Descripción" outlined dense />
          <q-toggle v-model="registerForm.allowCloseWithBalance" label="Permite hacer cierre con saldo" color="amber" />
          <q-toggle v-if="registerForm.id" v-model="registerForm.isActive" label="Caja activa" color="positive" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Guardar" :loading="saving" unelevated @click="saveRegister" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog emitir factura -->
    <q-dialog v-model="invoiceDialog" persistent>
      <q-card style="min-width:420px">
        <q-card-section><div class="text-h6">Emitir factura</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-body2">
            Recibo <strong>{{ invoiceReceipt?.receiptNumber }}</strong>
            — <strong>${{ formatMoney(invoiceReceipt?.amount) }}</strong>
          </div>
          <q-separator class="q-my-sm" />
          <div>
            <div class="text-caption text-grey-7">Cliente</div>
            <div class="text-body1">{{ invoiceReceipt?.clientName || '—' }}</div>
            <div v-if="invoiceReceipt?.clientDocument" class="text-caption text-grey-8">
              Doc. {{ invoiceReceipt.clientDocument }}
            </div>
          </div>
          <div>
            <div class="text-caption text-grey-7">Resolución DIAN</div>
            <div class="text-body1">{{ invoiceResolutionLabel || '—' }}</div>
          </div>
          <q-banner v-if="!invoiceResolutionId" dense rounded class="bg-amber-1 text-amber-10 q-mt-sm">
            Configure una resolución DIAN de factura en Ventas → Configuración.
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn
            color="primary"
            label="Confirmar y emitir"
            :loading="saving"
            :disable="!invoiceResolutionId || !invoiceReceipt?.clientId"
            unelevated
            @click="saveInvoice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <CashReceiptPrint v-model="printDialog" :data="printData" />
    <CajaArqueoPdfDialog
      v-model="arqueoPdfDialog"
      :session-id="arqueoPdfSessionId"
      :title="arqueoPdfTitle"
    />
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { getAuth, hasPermission } from 'src/utils/auth.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'
import CashReceiptPrint from 'src/components/company/caja/CashReceiptPrint.vue'
import CajaArqueoPdfDialog from 'src/components/company/caja/CajaArqueoPdfDialog.vue'
import ClientFormFields from 'src/components/company/ClientFormFields.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'
import { formatDateTime } from 'src/utils/date-format.js'

const $q = useQuasar()

const validTabs = ['operacion', 'cajas', 'historial']
const tab = useCompanyPageTab(validTabs, 'operacion', (value) => {
  if (value === 'historial') loadHistory()
  if (value === 'cajas') loadRegisters()
})

const pageMetaMap = {
  operacion: {
    title: 'Operación de caja',
    icon: 'point_of_sale',
    subtitle: 'Apertura, recibos y movimientos de la sesión activa',
  },
  cajas: { title: 'Cajas', icon: 'store', subtitle: 'Puntos de cobro configurados' },
  historial: { title: 'Historial', icon: 'history', subtitle: 'Aperturas, cierres y movimientos' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.operacion)

const auth = computed(() => getAuth('company'))
const isAdmin = computed(() => auth.value?.user?.role === 'company_admin')
const hasFacturacion = computed(() => auth.value?.modules?.some((m) => m.code === 'facturacion'))
const showRegisterSelector = computed(() => isAdmin.value || !auth.value?.user?.cashRegisterId)
const noAssignedRegister = computed(() => !isAdmin.value && !auth.value?.user?.cashRegisterId)
const assignedRegisterLabel = computed(() => {
  if (showRegisterSelector.value) return ''
  const reg = registers.value.find((r) => r.id === auth.value?.user?.cashRegisterId)
  return reg ? `${reg.code} — ${reg.name}` : '—'
})

const saving = ref(false)
const loadingRegisters = ref(false)
const loadingReceipts = ref(false)
const loadingHistory = ref(false)

const registers = ref([])
const selectedRegisterId = ref(null)
const historyRegisterId = ref(null)
const currentSession = ref(null)
const receipts = ref([])
const paymentMethods = ref([])
const clients = ref([])
const services = ref([])
const clientOptionsFiltered = ref([])
const serviceOptionsFiltered = ref([])
const resolutions = ref([])

const newServiceDialog = ref(false)
const newClientDialog = ref(false)
const nextServiceCodePreview = ref('')

const serviceForm = reactive({ description: '', basePrice: 0 })
const clientForm = reactive(emptyClientForm())

const canCreateService = computed(() => hasPermission('ventas.servicios'))
const canCreateClient = computed(() => hasPermission('ventas.clientes'))

const historyFrom = ref('')
const historyTo = ref(new Date().toISOString().slice(0, 10))
const historySessions = ref([])

const openSessionDialog = ref(false)
const receiptDialog = ref(false)
const closeDialog = ref(false)
const registerDialog = ref(false)
const detailDialog = ref(false)
const invoiceDialog = ref(false)
const printDialog = ref(false)
const arqueoPdfDialog = ref(false)
const arqueoPdfSessionId = ref('')
const arqueoPdfTitle = ref('Arqueo de caja')
const sessionDetail = ref(null)
const invoiceReceipt = ref(null)
const invoiceResolutionId = ref(null)
const invoiceResolutionLabel = ref('')
const printData = ref(null)

const editingReceiptId = ref(null)

const openForm = reactive({ openingAmount: 0, openingNotes: '' })
const receiptForm = reactive({
  serviceId: null,
  clientId: null,
  paymentMethod: 'efectivo',
  amount: 0,
  notes: '',
})
const closeForm = reactive({ closingNotes: '' })
const closeBalances = ref([])
const registerForm = reactive({
  id: null, code: '', name: '', description: '', isActive: true, allowCloseWithBalance: false,
})

const registerOptions = computed(() =>
  registers.value.filter((r) => r.isActive).map((r) => ({ label: `${r.code} — ${r.name}`, value: r.id }))
)

const paymentMethodOptions = computed(() =>
  paymentMethods.value.map((p) => ({ label: p.label, value: p.value }))
)

const resolutionOptions = computed(() =>
  resolutions.value
    .filter((r) => r.isActive && r.documentType === '01')
    .map((r) => ({ label: `${r.prefix} (${r.resolutionNumber})`, value: r.id }))
)

const expectedBalance = computed(() => {
  if (!currentSession.value) return 0
  return Number(currentSession.value.openingAmount)
    + Number(currentSession.value.totalIngress)
    - Number(currentSession.value.totalEgress)
})

const sessionSummaryItems = computed(() => {
  if (!currentSession.value) return []
  const s = currentSession.value
  return [
    { label: 'Apertura', value: s.sessionNumber },
    { label: 'Fecha apertura', value: formatDateTime(s.openedAt) },
    {
      label: 'Estado',
      value: s.status === 'abierta' ? 'Abierta' : 'Cerrada',
      badge: true,
      badgeColor: s.status === 'abierta' ? 'positive' : 'grey',
    },
    { label: 'Ingresos', value: `$${formatMoney(s.totalIngress)}`, positive: true },
    { label: 'Egresos', value: `$${formatMoney(s.totalEgress)}`, negative: true },
    {
      label: 'Efectivo',
      value: `$${formatMoney(s.cashExpected ?? expectedBalance.value)}`,
    },
  ]
})

const receiptColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'min-width:220px;width:220px' },
  { name: 'receiptNumber', label: 'Recibo', field: 'receiptNumber', style: 'width:110px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width:100px' },
  { name: 'movementType', label: 'Tipo', field: 'movementType', align: 'center', style: 'width:90px' },
  { name: 'paymentMethodLabel', label: 'Forma pago', field: 'paymentMethodLabel', style: 'width:120px' },
  { name: 'concept', label: 'Concepto', field: 'concept', style: 'max-width:220px' },
  { name: 'amount', label: 'Valor', field: 'amount', align: 'right', style: 'width:110px' },
  { name: 'createdByName', label: 'Usuario', field: 'createdByName', style: 'max-width:140px' },
]

const registerColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width:56px' },
  { name: 'code', label: 'Código', field: 'code', style: 'width:100px' },
  { name: 'name', label: 'Nombre', field: 'name', style: 'max-width:200px' },
  { name: 'description', label: 'Descripción', field: 'description', style: 'max-width:180px' },
  { name: 'allowCloseWithBalance', label: 'Cierre c/saldo', field: 'allowCloseWithBalance', align: 'center', style: 'width:110px' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center', style: 'width:90px' },
]

const historyColumns = [
  { name: 'sessionNumber', label: 'Apertura', field: 'sessionNumber', style: 'width:110px' },
  { name: 'registerName', label: 'Caja', field: 'registerName', style: 'max-width:140px' },
  { name: 'openedAt', label: 'Fecha apertura', field: (r) => formatDateTime(r.openedAt), style: 'width:140px' },
  { name: 'closedAt', label: 'Fecha cierre', field: (r) => r.closedAt ? formatDateTime(r.closedAt) : '—', style: 'width:140px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width:90px' },
  { name: 'totalIngress', label: 'Ingresos', field: (r) => '$' + formatMoney(r.totalIngress), align: 'right' },
  { name: 'totalEgress', label: 'Egresos', field: (r) => '$' + formatMoney(r.totalEgress), align: 'right' },
  { name: 'balanceDifference', label: 'Diferencia', field: 'balanceDifference', align: 'right' },
]

onMounted(async () => {
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 30)
  historyFrom.value = monthAgo.toISOString().slice(0, 10)

  await Promise.all([loadRegisters(), loadPaymentMethods()])
  if (hasFacturacion.value) {
    try {
      resolutions.value = await api.ventas.resolutions()
    } catch { /* opcional */ }
  }
  try {
    const [svc, cli] = await Promise.all([
      api.caja.catalogServices(),
      api.caja.catalogClients(),
    ])
    services.value = svc
    clients.value = cli
    serviceOptionsFiltered.value = mapServiceOptions(services.value)
    clientOptionsFiltered.value = mapClientOptions(clients.value)
  } catch { /* catálogo opcional al inicio */ }

  if (auth.value?.user?.cashRegisterId) {
    selectedRegisterId.value = auth.value.user.cashRegisterId
    historyRegisterId.value = auth.value.user.cashRegisterId
  } else if (registerOptions.value.length) {
    selectedRegisterId.value = registerOptions.value[0].value
  }
  await loadCurrentSession()
})

watch(selectedRegisterId, () => loadCurrentSession())

async function loadRegisters() {
  loadingRegisters.value = true
  try {
    registers.value = await api.caja.registers()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loadingRegisters.value = false
  }
}

async function loadPaymentMethods() {
  paymentMethods.value = await api.caja.paymentMethods()
}

async function loadCurrentSession() {
  if (!selectedRegisterId.value) {
    currentSession.value = null
    receipts.value = []
    return
  }
  loadingReceipts.value = true
  try {
    currentSession.value = await api.caja.currentSession(selectedRegisterId.value)
    if (currentSession.value?.status === 'abierta') {
      const rows = await api.caja.receipts(currentSession.value.id)
      receipts.value = rows.map(normalizeReceipt)
    } else {
      receipts.value = []
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loadingReceipts.value = false
  }
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    historySessions.value = await api.caja.sessions({
      registerId: historyRegisterId.value || undefined,
      from: historyFrom.value,
      to: historyTo.value,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loadingHistory.value = false
  }
}

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

function dianClientLookup(params) {
  if (hasPermission('ventas.clientes')) {
    return api.ventas.dianClientLookup(params)
  }
  return api.caja.catalogClientDianLookup(params)
}

function mapClientOptions(list) {
  return list.map((c) => ({
    label: c.businessName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.documentNumber,
    value: c.id,
  }))
}

function mapServiceOptions(list) {
  return list.map((s) => ({
    label: `${s.description} — $${formatMoney(s.basePrice)}`,
    value: s.id,
    basePrice: s.basePrice,
  }))
}

function filterClients(val, update) {
  update(() => {
    const needle = (val || '').toLowerCase()
    clientOptionsFiltered.value = mapClientOptions(
      clients.value.filter((c) => {
        const name = (c.businessName || `${c.firstName} ${c.lastName}`).toLowerCase()
        return name.includes(needle) || (c.documentNumber || '').includes(needle)
      })
    )
  })
}

function filterServices(val, update) {
  update(() => {
    const needle = (val || '').toLowerCase()
    serviceOptionsFiltered.value = mapServiceOptions(
      services.value.filter((s) =>
        (s.description || '').toLowerCase().includes(needle)
        || (s.code || '').toLowerCase().includes(needle)
      )
    )
  })
}

function onServiceSelected(serviceId) {
  const svc = services.value.find((s) => s.id === serviceId)
  if (svc && (!receiptForm.amount || Number(receiptForm.amount) === 0)) {
    receiptForm.amount = Number(svc.basePrice) || 0
  }
}

async function reloadCatalogs() {
  const [svc, cli] = await Promise.all([
    api.caja.catalogServices(),
    api.caja.catalogClients(),
  ])
  services.value = svc
  clients.value = cli
  serviceOptionsFiltered.value = mapServiceOptions(services.value)
  clientOptionsFiltered.value = mapClientOptions(clients.value)
}

async function openNewServiceDialog() {
  Object.assign(serviceForm, { description: '', basePrice: 0 })
  try {
    const preview = await api.caja.nextCatalogServiceCode()
    nextServiceCodePreview.value = preview.nextCode || ''
  } catch {
    nextServiceCodePreview.value = ''
  }
  newServiceDialog.value = true
}

async function saveNewService() {
  if (!serviceForm.description?.trim()) {
    $q.notify({ type: 'warning', message: 'Descripción requerida' })
    return
  }
  saving.value = true
  try {
    const created = await api.caja.createCatalogService({
      description: serviceForm.description.trim(),
      basePrice: serviceForm.basePrice,
    })
    await reloadCatalogs()
    receiptForm.serviceId = created.id
    receiptForm.amount = Number(created.basePrice) || 0
    newServiceDialog.value = false
    $q.notify({ type: 'positive', message: 'Servicio creado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openNewClientDialog() {
  Object.assign(clientForm, emptyClientForm())
  newClientDialog.value = true
}

async function saveNewClient() {
  saving.value = true
  try {
    const saved = await api.caja.createCatalogClient({ ...clientForm })
    await reloadCatalogs()
    receiptForm.clientId = saved.id
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

async function saveOpenSession() {
  saving.value = true
  try {
    currentSession.value = await api.caja.openSession({
      cashRegisterId: selectedRegisterId.value,
      openingAmount: openForm.openingAmount,
      openingNotes: openForm.openingNotes,
    })
    openSessionDialog.value = false
    openForm.openingAmount = 0
    openForm.openingNotes = ''
    await loadCurrentSession()
    $q.notify({ type: 'positive', message: `Caja abierta (${currentSession.value.sessionNumber})` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function normalizeReceipt(row) {
  const receiptKind = row.receiptKind
    || (row.movementType === 'egreso' ? 'egreso_caja' : 'servicios')
  const isSystem = Boolean(row.isSystem)
  const status = row.status || (isSystem ? 'confirmado' : 'borrador')
  const statusLabels = {
    borrador: 'Borrador',
    confirmado: 'Confirmado',
    anulado: 'Anulado',
    descartado: 'Descartado',
  }
  return {
    ...row,
    receiptKind,
    isSystem,
    status,
    statusLabel: row.statusLabel || statusLabels[status] || status,
  }
}

function isDraftReceipt(row) {
  const r = normalizeReceipt(row)
  return r.status === 'borrador'
    && !r.isSystem
    && (r.receiptKind === 'servicios' || r.receiptKind === 'egreso_caja')
}

function isEditableReceipt(row) {
  const r = normalizeReceipt(row)
  return r.status === 'borrador' && r.receiptKind === 'servicios' && !r.isSystem
}

function isConfirmableReceipt(row) {
  return isDraftReceipt(row)
}

function isDiscardableReceipt(row) {
  return isDraftReceipt(row)
}

function isVoidableReceipt(row) {
  const r = normalizeReceipt(row)
  return r.status === 'confirmado'
    && !r.isSystem
    && !r.invoiceId
    && (r.receiptKind === 'servicios' || r.receiptKind === 'egreso_caja')
}

function canPrintReceipt(row) {
  const r = normalizeReceipt(row)
  return r.status === 'confirmado'
    && (r.receiptKind === 'servicios' || r.receiptKind === 'egreso_caja')
}

function receiptStatusColor(status) {
  const map = {
    borrador: 'orange',
    confirmado: 'positive',
    anulado: 'negative',
    descartado: 'grey',
  }
  return map[status] || 'grey'
}

function receiptStatus(row) {
  return normalizeReceipt(row).status
}

function openReceiptDialog(row = null) {
  const base = row ? normalizeReceipt(row) : null
  editingReceiptId.value = base?.id || null
  Object.assign(receiptForm, {
    serviceId: base?.serviceId || null,
    clientId: base?.clientId || null,
    paymentMethod: base?.paymentMethod || 'efectivo',
    amount: base ? Number(base.amount) : 0,
    notes: base?.notes || '',
  })
  serviceOptionsFiltered.value = mapServiceOptions(services.value)
  clientOptionsFiltered.value = mapClientOptions(clients.value)
  receiptDialog.value = true
}

async function saveReceipt() {
  if (!receiptForm.serviceId) {
    $q.notify({ type: 'warning', message: 'Seleccione un servicio' })
    return
  }
  if (!receiptForm.clientId) {
    $q.notify({ type: 'warning', message: 'Seleccione un cliente' })
    return
  }
  saving.value = true
  try {
    if (editingReceiptId.value) {
      await api.caja.updateReceipt(editingReceiptId.value, receiptForm)
      $q.notify({ type: 'positive', message: 'Recibo actualizado' })
    } else {
      await api.caja.createReceipt({
        cashSessionId: currentSession.value.id,
        movementType: 'ingreso',
        ...receiptForm,
      })
      $q.notify({ type: 'positive', message: 'Recibo registrado en borrador' })
    }
    receiptDialog.value = false
    editingReceiptId.value = null
    await loadCurrentSession()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function confirmReceipt(row) {
  $q.dialog({
    title: 'Confirmar recibo',
    message: `¿Confirmar el recibo ${row.receiptNumber} por $${formatMoney(row.amount)}?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    saving.value = true
    try {
      await api.caja.confirmReceipt(row.id)
      await loadCurrentSession()
      $q.notify({ type: 'positive', message: 'Recibo confirmado' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      saving.value = false
    }
  })
}

async function discardReceipt(row) {
  $q.dialog({
    title: 'Desechar recibo',
    message: `¿Desechar el borrador ${row.receiptNumber}? Esta acción no se puede deshacer.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    saving.value = true
    try {
      await api.caja.discardReceipt(row.id)
      await loadCurrentSession()
      $q.notify({ type: 'positive', message: 'Recibo desechado' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      saving.value = false
    }
  })
}

async function voidReceipt(row) {
  $q.dialog({
    title: 'Anular recibo',
    message: `¿Anular el recibo confirmado ${row.receiptNumber}?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    saving.value = true
    try {
      await api.caja.voidReceipt(row.id)
      await loadCurrentSession()
      $q.notify({ type: 'positive', message: 'Recibo anulado' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      saving.value = false
    }
  })
}

async function saveEgresoCaja() {
  $q.dialog({
    title: 'Egreso de caja',
    message: `¿Registrar egreso por $${formatMoney(currentSession.value.cashExpected)} en efectivo?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    saving.value = true
    try {
      await api.caja.createEgresoCaja({ cashSessionId: currentSession.value.id })
      await loadCurrentSession()
      $q.notify({ type: 'positive', message: 'Egreso de caja registrado' })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    } finally {
      saving.value = false
    }
  })
}

async function openCloseDialog() {
  const detail = await api.caja.session(currentSession.value.id)
  const byMethod = {}
  for (const r of detail.receipts || []) {
    if (r.status !== 'confirmado') continue
    const sign = r.movementType === 'ingreso' ? 1 : -1
    byMethod[r.paymentMethod] = (byMethod[r.paymentMethod] || 0) + sign * Number(r.amount)
  }
  byMethod.efectivo = (byMethod.efectivo || 0) + Number(detail.openingAmount)

  closeBalances.value = paymentMethods.value.map((p) => ({
    paymentMethod: p.value,
    label: p.label,
    expectedAmount: byMethod[p.value] || 0,
    countedAmount: byMethod[p.value] || 0,
  }))
  closeForm.closingNotes = ''
  closeDialog.value = true
}

async function saveCloseSession() {
  saving.value = true
  try {
    await api.caja.closeSession(currentSession.value.id, {
      closingNotes: closeForm.closingNotes,
      paymentBalances: closeBalances.value.map((b) => ({
        paymentMethod: b.paymentMethod,
        countedAmount: Number(b.countedAmount) || 0,
      })),
    })
    closeDialog.value = false
    await loadCurrentSession()
    $q.notify({ type: 'positive', message: 'Caja cerrada correctamente' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openRegisterDialog(row = null) {
  Object.assign(registerForm, row ? {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    isActive: row.isActive,
    allowCloseWithBalance: row.allowCloseWithBalance,
  } : { id: null, code: '', name: '', description: '', isActive: true, allowCloseWithBalance: false })
  registerDialog.value = true
}

async function saveRegister() {
  saving.value = true
  try {
    if (registerForm.id) {
      await api.caja.updateRegister(registerForm.id, registerForm)
    } else {
      await api.caja.createRegister(registerForm)
    }
    registerDialog.value = false
    await loadRegisters()
    $q.notify({ type: 'positive', message: 'Caja guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function viewSessionDetail(row) {
  sessionDetail.value = await api.caja.session(row.id)
  detailDialog.value = true
}

function openArqueoPdfDialog() {
  if (!sessionDetail.value?.id) return
  arqueoPdfSessionId.value = sessionDetail.value.id
  arqueoPdfTitle.value = `Arqueo ${sessionDetail.value.sessionNumber} — ${sessionDetail.value.registerName}`
  arqueoPdfDialog.value = true
}

function canEmitInvoice(row) {
  const r = normalizeReceipt(row)
  return hasFacturacion.value
    && hasPermission('ventas.facturar')
    && r.status === 'confirmado'
    && r.receiptKind === 'servicios'
    && r.movementType === 'ingreso'
    && !r.invoiceId
}

function openInvoiceDialog(row) {
  const r = normalizeReceipt(row)
  const resolution = resolutionOptions.value[0] || null
  invoiceReceipt.value = r
  invoiceResolutionId.value = resolution?.value || null
  invoiceResolutionLabel.value = resolution?.label || ''
  invoiceDialog.value = true
}

async function saveInvoice() {
  if (!invoiceReceipt.value?.clientId || !invoiceResolutionId.value) {
    $q.notify({ type: 'warning', message: 'Faltan datos del recibo o la resolución DIAN configurada' })
    return
  }
  saving.value = true
  try {
    const result = await api.caja.emitInvoiceFromReceipt(invoiceReceipt.value.id, {
      clientId: invoiceReceipt.value.clientId,
      dianResolutionId: invoiceResolutionId.value,
      emit: true,
    })
    invoiceDialog.value = false
    await loadCurrentSession()
    $q.notify({
      type: 'positive',
      message: `Factura ${result.invoice.fullNumber} emitida`,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function printReceipt(row) {
  try {
    printData.value = await api.caja.receiptPrint(row.id)
    printDialog.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function differenceClass(v) {
  if (v == null || v === 0) return ''
  return Number(v) > 0 ? 'text-positive' : 'text-negative'
}
</script>

<style scoped>
.caja-session-summary {
  background: linear-gradient(180deg, #f8fbfa 0%, #f0f4f3 100%);
  border-color: rgba(0, 121, 107, 0.18);
}

.caja-session-summary__strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
}

.caja-session-summary__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px 4px 0;
  margin-right: 16px;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}

.caja-session-summary__item:last-child {
  border-right: none;
  margin-right: 0;
  padding-right: 0;
}

.caja-session-summary__label {
  color: rgba(0, 0, 0, 0.55);
  font-size: 0.8125rem;
}

.caja-session-summary__label::after {
  content: ':';
}

.caja-session-summary__value {
  font-weight: 600;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .caja-session-summary__strip {
    flex-direction: column;
    align-items: flex-start;
  }

  .caja-session-summary__item {
    border-right: none;
    margin-right: 0;
    padding-right: 0;
    width: 100%;
    justify-content: space-between;
  }
}
</style>
