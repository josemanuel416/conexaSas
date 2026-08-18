<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <!-- Plan de cuentas -->
      <template v-if="tab === 'cuentas'">
        <q-banner dense rounded class="bg-blue-1 text-blue-10 q-mb-md">
          Longitudes válidas: nivel 1 (1 dígito), nivel 2 (2), nivel 3 (4), nivel 4 (6)…
          No use longitudes impares. La cuenta suma se calcula automáticamente.
        </q-banner>
        <div class="row q-col-gutter-sm q-mb-md items-center">
          <div class="col-auto">
            <q-btn color="primary" icon="add" label="Nueva cuenta" unelevated @click="openAccountDialog()" />
          </div>
          <div class="col-auto">
            <q-btn outline color="primary" icon="download" label="Descargar plantilla" @click="downloadTemplate" />
          </div>
          <div class="col-auto">
            <q-btn outline color="secondary" icon="upload_file" label="Subir plan Excel" @click="triggerImport" />
            <input ref="importInput" type="file" accept=".xlsx,.xls" style="display:none" @change="onImportFile" />
          </div>
          <div class="col-auto">
            <q-btn flat color="grey-8" icon="file_download" label="Exportar actual" @click="exportChart" />
          </div>
        </div>
        <q-table :rows="accounts" :columns="accountColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-level="props">
            <q-td :props="props" class="text-center">{{ props.row.level }}</q-td>
          </template>
          <template #body-cell-accountType="props">
            <q-td :props="props">
              <q-badge :color="props.row.accountType === 'suma' ? 'blue-grey-7' : 'primary'">
                {{ props.row.accountType === 'suma' ? 'Suma' : 'Detalle' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-accountClass="props">
            <q-td :props="props">{{ accountClassLabel(props.row.accountClass) }}</q-td>
          </template>
          <template #body-cell-flags="props">
            <q-td :props="props">
              <q-badge v-if="props.row.requiresThirdParty" color="teal-7" class="q-mr-xs">Tercero</q-badge>
              <q-badge v-if="props.row.requiresTax" color="orange-8" class="q-mr-xs">Impuesto</q-badge>
              <q-badge v-if="props.row.requiresInvoice" color="purple-7" class="q-mr-xs">Factura</q-badge>
              <q-badge v-if="props.row.requiresCostCenter" color="brown-7">CCosto</q-badge>
            </q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="props.row.status === 'activo' ? 'positive' : 'grey'">
                {{ props.row.status === 'activo' ? 'Activo' : 'Inactivo' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openAccountDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Tipos de comprobante -->
      <template v-else-if="tab === 'comprobantes'">
        <div class="q-mb-md">
          <q-btn color="primary" icon="add" label="Nuevo comprobante" unelevated @click="openVoucherDialog()" />
        </div>
        <q-table :rows="voucherTypes" :columns="voucherColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="props.row.status === 'activo' ? 'positive' : 'grey'">
                {{ props.row.status === 'activo' ? 'Activo' : 'Inactivo' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openVoucherDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Centros de costo -->
      <template v-else-if="tab === 'centros-costo'">
        <div class="q-mb-md">
          <q-btn color="primary" icon="add" label="Nuevo centro" unelevated @click="openCostCenterDialog()" />
        </div>
        <q-table :rows="costCenters" :columns="costCenterColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="props.row.status === 'activo' ? 'positive' : 'grey'">
                {{ props.row.status === 'activo' ? 'Activo' : 'Inactivo' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openCostCenterDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Periodos -->
      <template v-else-if="tab === 'periodos'">
        <div class="q-mb-md">
          <q-btn color="primary" icon="add" label="Nuevo periodo" unelevated @click="openPeriodDialog()" />
        </div>
        <q-table :rows="periods" :columns="periodColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-yearMonth="props">
            <q-td :props="props">{{ formatYearMonth(props.row.yearMonth) }}</q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="props.row.status === 'abierto' ? 'positive' : 'grey-7'">
                {{ props.row.status === 'abierto' ? 'Abierto' : 'Cerrado' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openPeriodDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </template>

      <!-- Impuestos (acordeón: padre → clase → vigencia) -->
      <template v-else-if="tab === 'impuestos'">
        <div class="row q-col-gutter-sm q-mb-md items-center">
          <div class="col-auto">
            <q-btn color="primary" icon="add" label="Nuevo impuesto" unelevated @click="openTaxDialog()" />
          </div>
          <div class="col-auto">
            <q-btn outline color="primary" icon="category" label="Nueva clase" @click="openTaxClassDialog()" />
          </div>
          <div class="col-auto">
            <q-btn outline color="secondary" icon="event" label="Nueva vigencia" @click="openTaxRateDialog()" />
          </div>
        </div>

        <q-table
          :rows="taxes"
          :columns="taxAccordionColumns"
          row-key="id"
          flat
          bordered
          class="company-data-table tax-accordion"
        >
          <template #body="props">
            <q-tr :props="props" class="cursor-pointer tax-accordion__tax-row" @click="toggleTaxExpand(props.row.id)">
              <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleTaxExpand(props.row.id)">
                <q-btn
                  flat dense round size="sm"
                  :icon="isTaxExpanded(props.row.id) ? 'expand_less' : 'expand_more'"
                  color="grey-7"
                />
              </q-td>
              <q-td key="actions" :props="props" class="company-data-table__actions" @click.stop>
                <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openTaxDialog(props.row)">
                  <q-tooltip>Editar impuesto</q-tooltip>
                </q-btn>
              </q-td>
              <q-td key="code" :props="props">
                <span class="text-weight-medium">{{ props.row.code }}</span>
              </q-td>
              <q-td key="name" :props="props">{{ props.row.name }}</q-td>
              <q-td key="classCount" :props="props" class="text-center">
                <q-badge color="blue-grey-6">{{ classesForTax(props.row.id).length }}</q-badge>
              </q-td>
              <q-td key="status" :props="props">
                <q-badge :color="props.row.status === 'activo' ? 'positive' : 'grey'">
                  {{ props.row.status === 'activo' ? 'Activo' : 'Inactivo' }}
                </q-badge>
              </q-td>
            </q-tr>

            <q-tr v-show="isTaxExpanded(props.row.id)" :props="props" class="company-data-table__expand">
              <q-td colspan="100%">
                <div class="company-data-table__expand-inner tax-accordion__level2">
                  <div class="row items-center q-mb-sm">
                    <div class="text-subtitle2 text-primary">Clases de {{ props.row.code }}</div>
                    <q-space />
                    <q-btn
                      flat dense icon="add" label="Agregar clase" color="primary"
                      @click="openTaxClassDialog(null, props.row)"
                    />
                  </div>

                  <div v-if="!classesForTax(props.row.id).length" class="text-grey-7 q-py-md">
                    No hay clases registradas para este impuesto.
                  </div>

                  <q-table
                    v-else
                    :rows="classesForTax(props.row.id)"
                    :columns="taxClassNestedColumns"
                    row-key="id"
                    flat
                    dense
                    bordered
                    hide-bottom
                    class="tax-accordion__nested-table"
                  >
                    <template #body="classProps">
                      <q-tr
                        :props="classProps"
                        class="cursor-pointer tax-accordion__class-row"
                        @click="toggleClassExpand(classProps.row.id)"
                      >
                        <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleClassExpand(classProps.row.id)">
                          <q-btn
                            flat dense round size="sm"
                            :icon="isClassExpanded(classProps.row.id) ? 'expand_less' : 'expand_more'"
                            color="grey-7"
                          />
                        </q-td>
                        <q-td key="actions" :props="classProps" class="company-data-table__actions" @click.stop>
                          <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openTaxClassDialog(classProps.row)">
                            <q-tooltip>Editar clase</q-tooltip>
                          </q-btn>
                        </q-td>
                        <q-td key="classCode" :props="classProps">
                          <span class="text-weight-medium">{{ classProps.row.classCode }}</span>
                        </q-td>
                        <q-td key="description" :props="classProps">{{ classProps.row.description || '—' }}</q-td>
                        <q-td key="rateCount" :props="classProps" class="text-center">
                          <q-badge color="blue-grey-5">{{ ratesForClass(classProps.row.id).length }}</q-badge>
                        </q-td>
                        <q-td key="status" :props="classProps">
                          <q-badge :color="classProps.row.status === 'activo' ? 'positive' : 'grey'">
                            {{ classProps.row.status === 'activo' ? 'Activo' : 'Inactivo' }}
                          </q-badge>
                        </q-td>
                      </q-tr>

                      <q-tr v-show="isClassExpanded(classProps.row.id)" :props="classProps" class="company-data-table__expand">
                        <q-td colspan="100%">
                          <div class="tax-accordion__level3">
                            <div class="row items-center q-mb-sm">
                              <div class="text-caption text-weight-medium text-grey-8">
                                Vigencias — {{ props.row.code }}.{{ classProps.row.classCode }}
                              </div>
                              <q-space />
                              <q-btn
                                flat dense icon="add" label="Agregar vigencia" color="primary" size="sm"
                                @click="openTaxRateDialog(null, props.row, classProps.row)"
                              />
                            </div>

                            <q-markup-table
                              v-if="ratesForClass(classProps.row.id).length"
                              flat dense bordered class="tax-accordion__rates-table"
                            >
                              <thead>
                                <tr>
                                  <th class="text-left" style="width: 56px" />
                                  <th class="text-right">Valor %</th>
                                  <th class="text-left">Vigencia</th>
                                  <th class="text-right">Monto mín.</th>
                                  <th class="text-left">Cuenta</th>
                                  <th class="text-center">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="rate in ratesForClass(classProps.row.id)" :key="rate.id">
                                  <td>
                                    <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openTaxRateDialog(rate)">
                                      <q-tooltip>Editar vigencia</q-tooltip>
                                    </q-btn>
                                  </td>
                                  <td class="text-right">{{ formatRate(rate.rateValue) }}</td>
                                  <td>
                                    {{ formatDate(rate.startDate) }}
                                    <span class="text-grey-7"> → </span>
                                    {{ rate.endDate ? formatDate(rate.endDate) : 'Vigente' }}
                                  </td>
                                  <td class="text-right">${{ formatMoney(rate.minAmount) }}</td>
                                  <td>{{ rate.accountCode ? `${rate.accountCode} — ${rate.accountName}` : '—' }}</td>
                                  <td class="text-center">
                                    <q-badge :color="rate.status === 'activo' ? 'positive' : 'grey'">
                                      {{ rate.status === 'activo' ? 'Activo' : 'Inactivo' }}
                                    </q-badge>
                                  </td>
                                </tr>
                              </tbody>
                            </q-markup-table>
                            <div v-else class="text-grey-7 q-py-sm">No hay vigencias para esta clase.</div>
                          </div>
                        </q-td>
                      </q-tr>
                    </template>
                  </q-table>
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </template>
    </div>

    <!-- Cuenta -->
    <CompanyFormDialog v-model="accountDialog" :title="accountForm.id ? 'Editar cuenta' : 'Nueva cuenta'" icon="account_tree" wide>
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-3">
          <q-input v-model="accountForm.code" label="Cuenta *" outlined dense :readonly="!!accountForm.id" @update:model-value="onAccountCodeInput" />
        </div>
        <div class="col-12 col-md-3">
          <q-input :model-value="accountPreview.level ?? '—'" label="Nivel" outlined dense readonly />
        </div>
        <div class="col-12 col-md-3">
          <q-input :model-value="accountPreview.parentCode || '—'" label="Cuenta suma" outlined dense readonly />
        </div>
        <div class="col-12 col-md-3">
          <q-input v-model="accountForm.name" label="Nombre cuenta *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="accountForm.accountType"
            :options="accountTypeOptions"
            label="Tipo *"
            outlined dense emit-value map-options
          />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="accountForm.accountClass"
            :options="accountClassOptions"
            label="Clase *"
            outlined dense emit-value map-options
          />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="accountForm.status"
            :options="recordStatusOptions"
            label="Estado"
            outlined dense emit-value map-options
          />
        </div>
        <div class="col-12 col-md-4">
          <q-input
            v-model="accountForm.taxCode"
            label="Código impuesto"
            outlined dense
            :disable="!accountForm.requiresTax"
          />
        </div>
        <div class="col-12 col-md-4">
          <q-toggle v-model="accountForm.requiresThirdParty" label="Maneja tercero" />
        </div>
        <div class="col-12 col-md-4">
          <q-toggle v-model="accountForm.requiresTax" label="De impuesto" />
        </div>
        <div class="col-12 col-md-4">
          <q-toggle v-model="accountForm.requiresInvoice" label="Maneja factura" />
        </div>
        <div class="col-12 col-md-4">
          <q-toggle v-model="accountForm.requiresCostCenter" label="Maneja centro de costo" />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveAccount" />
      </template>
    </CompanyFormDialog>

    <!-- Comprobante -->
    <CompanyFormDialog v-model="voucherDialog" :title="voucherForm.id ? 'Editar comprobante' : 'Nuevo comprobante'" icon="receipt_long">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-3">
          <q-input v-model="voucherForm.code" label="Código *" outlined dense :readonly="!!voucherForm.id" />
        </div>
        <div class="col-12 col-md-9">
          <q-input v-model="voucherForm.name" label="Nombre *" outlined dense />
        </div>
        <div class="col-12">
          <q-input v-model="voucherForm.description" label="Descripción" outlined dense type="textarea" autogrow />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model.number="voucherForm.sortOrder" type="number" label="Orden" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="voucherForm.status"
            :options="recordStatusOptions"
            label="Estado"
            outlined dense emit-value map-options
          />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveVoucher" />
      </template>
    </CompanyFormDialog>

    <!-- Centro de costo -->
    <CompanyFormDialog v-model="costCenterDialog" :title="costCenterForm.id ? 'Editar centro' : 'Nuevo centro de costo'" icon="hub">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-3">
          <q-input v-model="costCenterForm.code" label="Código *" outlined dense :readonly="!!costCenterForm.id" />
        </div>
        <div class="col-12 col-md-9">
          <q-input v-model="costCenterForm.name" label="Nombre *" outlined dense />
        </div>
        <div class="col-12">
          <q-input v-model="costCenterForm.description" label="Descripción" outlined dense type="textarea" autogrow />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="costCenterForm.status"
            :options="recordStatusOptions"
            label="Estado"
            outlined dense emit-value map-options
          />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveCostCenter" />
      </template>
    </CompanyFormDialog>

    <!-- Periodo -->
    <CompanyFormDialog v-model="periodDialog" :title="periodForm.id ? 'Editar periodo' : 'Nuevo periodo'" icon="calendar_month">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-3">
          <q-input
            v-model.number="periodForm.year"
            type="number"
            label="Año *"
            outlined dense
            :readonly="!!periodForm.id"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-input
            v-model.number="periodForm.month"
            type="number"
            label="Mes *"
            outlined dense
            :readonly="!!periodForm.id"
            hint="1-12"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-select
            v-model="periodForm.status"
            :options="periodStatusOptions"
            label="Estado"
            outlined dense emit-value map-options
          />
        </div>
        <div class="col-12">
          <q-input v-model="periodForm.description" label="Descripción" outlined dense />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="savePeriod" />
      </template>
    </CompanyFormDialog>

    <!-- Impuesto padre -->
    <CompanyFormDialog v-model="taxDialog" :title="taxForm.id ? 'Editar impuesto' : 'Nuevo impuesto'" icon="percent">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-3">
          <q-input v-model="taxForm.code" label="Código *" outlined dense :readonly="!!taxForm.id" />
        </div>
        <div class="col-12 col-md-9">
          <q-input v-model="taxForm.name" label="Nombre *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-select v-model="taxForm.status" :options="recordStatusOptions" label="Estado" outlined dense emit-value map-options />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveTax" />
      </template>
    </CompanyFormDialog>

    <!-- Clase impuesto -->
    <CompanyFormDialog v-model="taxClassDialog" :title="taxClassForm.id ? 'Editar clase' : 'Nueva clase de impuesto'" icon="category">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-6">
          <q-select
            v-model="taxClassForm.taxId"
            :options="taxOptions"
            label="Impuesto padre *"
            outlined dense emit-value map-options
            :readonly="!!taxClassForm.id"
          />
        </div>
        <div class="col-12 col-md-6">
          <q-input v-model="taxClassForm.classCode" label="Clase *" outlined dense :readonly="!!taxClassForm.id" />
        </div>
        <div class="col-12">
          <q-input v-model="taxClassForm.description" label="Descripción" outlined dense type="textarea" autogrow />
        </div>
        <div class="col-12 col-md-4">
          <q-select v-model="taxClassForm.status" :options="recordStatusOptions" label="Estado" outlined dense emit-value map-options />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveTaxClass" />
      </template>
    </CompanyFormDialog>

    <!-- Vigencia impuesto -->
    <CompanyFormDialog v-model="taxRateDialog" :title="taxRateForm.id ? 'Editar vigencia' : 'Nueva vigencia'" icon="event" wide>
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4">
          <q-select
            v-model="taxRateForm.taxId"
            :options="taxOptions"
            label="Impuesto padre *"
            outlined dense emit-value map-options
            :readonly="!!taxRateForm.id"
            @update:model-value="onTaxRateTaxChange"
          />
        </div>
        <div class="col-12 col-md-4">
          <q-select
            v-model="taxRateForm.taxClassId"
            :options="taxClassOptionsForRate"
            label="Clase impuesto *"
            outlined dense emit-value map-options
            :readonly="!!taxRateForm.id"
          />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model.number="taxRateForm.rateValue" type="number" step="0.0001" label="Valor (%) *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="taxRateForm.startDate" type="date" label="Fecha inicio *" outlined dense />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="taxRateForm.endDate" type="date" label="Fecha fin" outlined dense clearable hint="Vacío = vigente" />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model.number="taxRateForm.minAmount" type="number" label="Monto mínimo" outlined dense />
        </div>
        <div class="col-12 col-md-8">
          <q-select
            v-model="taxRateForm.accountId"
            :options="accountOptions"
            label="Cuenta contable"
            outlined dense emit-value map-options clearable
          />
        </div>
        <div class="col-12 col-md-4">
          <q-select v-model="taxRateForm.status" :options="recordStatusOptions" label="Estado" outlined dense emit-value map-options />
        </div>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveTaxRate" />
      </template>
    </CompanyFormDialog>

    <q-dialog v-model="importErrorsDialog">
      <q-card style="min-width: 520px; max-width: 90vw">
        <q-card-section>
          <div class="text-h6">Errores en la importación</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-list bordered separator dense>
            <q-item v-for="(err, idx) in importErrors" :key="idx">
              <q-item-section>
                <q-item-label>
                  Fila {{ err.row || '—' }}<span v-if="err.code"> — cuenta {{ err.code }}</span>
                </q-item-label>
                <q-item-label caption>{{ err.messages?.join(' · ') }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cerrar" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'
import { formatDate } from 'src/utils/date-format.js'

const $q = useQuasar()
const validTabs = ['cuentas', 'comprobantes', 'centros-costo', 'periodos', 'impuestos']
const tab = useCompanyPageTab(validTabs, 'cuentas')

const expandedTaxes = ref([])
const expandedTaxClasses = ref([])

const pageMetaMap = {
  cuentas: { title: 'Plan de cuentas', icon: 'account_tree' },
  comprobantes: { title: 'Tipos de comprobante', icon: 'receipt_long' },
  'centros-costo': { title: 'Centros de costo', icon: 'hub' },
  periodos: { title: 'Periodos contables', icon: 'calendar_month' },
  impuestos: { title: 'Impuestos', icon: 'percent' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.cuentas)

const saving = ref(false)
const accounts = ref([])
const voucherTypes = ref([])
const costCenters = ref([])
const periods = ref([])
const taxes = ref([])
const taxClasses = ref([])
const taxRates = ref([])

const accountDialog = ref(false)
const voucherDialog = ref(false)
const costCenterDialog = ref(false)
const periodDialog = ref(false)
const taxDialog = ref(false)
const taxClassDialog = ref(false)
const taxRateDialog = ref(false)

const importInput = ref(null)
const importErrorsDialog = ref(false)
const importErrors = ref([])

const accountForm = reactive({
  id: null,
  code: '',
  name: '',
  accountType: 'detalle',
  accountClass: 'otros',
  status: 'activo',
  requiresThirdParty: false,
  requiresTax: false,
  taxCode: '',
  requiresInvoice: false,
  requiresCostCenter: false,
})

const accountPreview = computed(() => {
  const code = String(accountForm.code || '').trim()
  if (!code) return { level: null, parentCode: '', valid: false, error: '' }
  const len = code.length
  const validLen = len === 1 || (len >= 2 && len % 2 === 0)
  if (!/^\d+$/.test(code)) return { level: null, parentCode: '', valid: false, error: 'Solo dígitos' }
  if (!validLen) {
    return { level: null, parentCode: '', valid: false, error: 'Longitud inválida' }
  }
  let level = 1
  if (len === 2) level = 2
  else if (len > 2) level = len / 2 + 1
  let parentCode = ''
  if (level === 2) parentCode = code.substring(0, 1)
  else if (level > 2) parentCode = code.substring(0, len - 2)
  return { level, parentCode, valid: true, error: '' }
})

const voucherForm = reactive({
  id: null,
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  status: 'activo',
})

const costCenterForm = reactive({
  id: null,
  code: '',
  name: '',
  description: '',
  status: 'activo',
})

const periodForm = reactive({
  id: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  status: 'abierto',
  description: '',
})

const taxForm = reactive({ id: null, code: '', name: '', status: 'activo' })
const taxClassForm = reactive({ id: null, taxId: null, classCode: '', description: '', status: 'activo' })
const taxRateForm = reactive({
  id: null,
  taxId: null,
  taxClassId: null,
  rateValue: 0,
  startDate: '',
  endDate: '',
  minAmount: 0,
  accountId: null,
  status: 'activo',
})

const taxOptions = computed(() =>
  taxes.value.filter((t) => t.status === 'activo').map((t) => ({ label: `${t.code} — ${t.name}`, value: t.id }))
)

const taxClassOptionsForRate = computed(() =>
  taxClasses.value
    .filter((c) => c.status === 'activo' && (!taxRateForm.taxId || c.taxId === taxRateForm.taxId))
    .map((c) => ({ label: `${c.taxCode}.${c.classCode} — ${c.description || c.classCode}`, value: c.id }))
)

const accountOptions = computed(() =>
  accounts.value
    .filter((a) => a.accountType === 'detalle' && a.status === 'activo')
    .map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id }))
)

const accountTypeOptions = [
  { label: 'Suma', value: 'suma' },
  { label: 'Detalle', value: 'detalle' },
]

const accountClassOptions = [
  { label: 'Cuentas por cobrar', value: 'cxc' },
  { label: 'Cuentas por pagar', value: 'cxp' },
  { label: 'Otros', value: 'otros' },
]

const recordStatusOptions = [
  { label: 'Activo', value: 'activo' },
  { label: 'Inactivo', value: 'inactivo' },
]

const periodStatusOptions = [
  { label: 'Abierto', value: 'abierto' },
  { label: 'Cerrado', value: 'cerrado' },
]

const accountColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Cuenta', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'level', label: 'Nivel', field: 'level', align: 'center', sortable: true },
  { name: 'accountType', label: 'Tipo', field: 'accountType', align: 'center' },
  { name: 'parentAccountCode', label: 'Cuenta suma', field: 'parentAccountCode', align: 'left' },
  { name: 'accountClass', label: 'Clase', field: 'accountClass', align: 'left' },
  { name: 'flags', label: 'Marcadores', field: 'flags', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

const voucherColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'lastReference', label: 'Últ. referencia', field: 'lastReference', align: 'right' },
  { name: 'sortOrder', label: 'Orden', field: 'sortOrder', align: 'right' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

const costCenterColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

const periodColumns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'yearMonth', label: 'Año / Mes', field: 'yearMonth', align: 'left', sortable: true },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

const taxAccordionColumns = [
  { name: 'expand', label: '', field: 'expand', align: 'left', style: 'width: 28px' },
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Nombre impuesto', field: 'name', align: 'left', sortable: true },
  { name: 'classCount', label: 'Clases', field: 'classCount', align: 'center' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

const taxClassNestedColumns = [
  { name: 'expand', label: '', field: 'expand', align: 'left', style: 'width: 28px' },
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'classCode', label: 'Clase', field: 'classCode', align: 'left' },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left' },
  { name: 'rateCount', label: 'Vigencias', field: 'rateCount', align: 'center' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
]

function accountClassLabel(value) {
  return accountClassOptions.find((o) => o.value === value)?.label || value
}

function formatYearMonth(ym) {
  const y = Math.floor(Number(ym) / 100)
  const m = Number(ym) % 100
  return `${y}-${String(m).padStart(2, '0')}`
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

function formatRate(v) {
  return `${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`
}

function classesForTax(taxId) {
  return taxClasses.value.filter((c) => c.taxId === taxId)
}

function ratesForClass(taxClassId) {
  return taxRates.value.filter((r) => r.taxClassId === taxClassId)
}

function isTaxExpanded(id) {
  return expandedTaxes.value.includes(id)
}

function isClassExpanded(id) {
  return expandedTaxClasses.value.includes(id)
}

function toggleTaxExpand(id) {
  const idx = expandedTaxes.value.indexOf(id)
  if (idx >= 0) expandedTaxes.value.splice(idx, 1)
  else expandedTaxes.value.push(id)
}

function toggleClassExpand(id) {
  const idx = expandedTaxClasses.value.indexOf(id)
  if (idx >= 0) expandedTaxClasses.value.splice(idx, 1)
  else expandedTaxClasses.value.push(id)
}

function resetAccountForm() {
  Object.assign(accountForm, {
    id: null,
    code: '',
    name: '',
    accountType: 'detalle',
    accountClass: 'otros',
    status: 'activo',
    requiresThirdParty: false,
    requiresTax: false,
    taxCode: '',
    requiresInvoice: false,
    requiresCostCenter: false,
  })
}

function onAccountCodeInput() {
  // preview via computed
}

async function downloadTemplate() {
  try {
    await api.contabilidad.downloadChartTemplate()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function exportChart() {
  try {
    await api.contabilidad.exportChart()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function onImportFile(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  saving.value = true
  try {
    const result = await api.contabilidad.importChart(file)
    await loadAll()
    $q.notify({ type: 'positive', message: result.message || 'Plan importado' })
  } catch (e) {
    if (e.details?.errors?.length) {
      importErrors.value = e.details.errors
      importErrorsDialog.value = true
    }
    $q.notify({ type: 'negative', message: e.message || 'Error al importar' })
  } finally {
    saving.value = false
  }
}

function openAccountDialog(row = null) {
  resetAccountForm()
  if (row) {
    Object.assign(accountForm, {
      id: row.id,
      code: row.code,
      name: row.name,
      accountType: row.accountType,
      accountClass: row.accountClass,
      status: row.status,
      requiresThirdParty: row.requiresThirdParty,
      requiresTax: row.requiresTax,
      taxCode: row.taxCode || '',
      requiresInvoice: row.requiresInvoice,
      requiresCostCenter: row.requiresCostCenter,
    })
  }
  accountDialog.value = true
}

function openVoucherDialog(row = null) {
  Object.assign(voucherForm, {
    id: row?.id || null,
    code: row?.code || '',
    name: row?.name || '',
    description: row?.description || '',
    sortOrder: row?.sortOrder ?? 0,
    status: row?.status || 'activo',
  })
  voucherDialog.value = true
}

function openCostCenterDialog(row = null) {
  Object.assign(costCenterForm, {
    id: row?.id || null,
    code: row?.code || '',
    name: row?.name || '',
    description: row?.description || '',
    status: row?.status || 'activo',
  })
  costCenterDialog.value = true
}

function openPeriodDialog(row = null) {
  Object.assign(periodForm, {
    id: row?.id || null,
    year: row?.year || new Date().getFullYear(),
    month: row?.month || new Date().getMonth() + 1,
    status: row?.status || 'abierto',
    description: row?.description || '',
  })
  periodDialog.value = true
}

async function loadAll() {
  const [acc, vt, cc, pp, tx, tc, tr] = await Promise.all([
    api.contabilidad.accounts(),
    api.contabilidad.voucherTypes(),
    api.contabilidad.costCenters(),
    api.contabilidad.periods(),
    api.contabilidad.taxes(),
    api.contabilidad.taxClasses(),
    api.contabilidad.taxRates(),
  ])
  accounts.value = acc
  voucherTypes.value = vt
  costCenters.value = cc
  periods.value = pp
  taxes.value = tx
  taxClasses.value = tc
  taxRates.value = tr
}

async function saveAccount() {
  if (!accountForm.code?.trim() || !accountForm.name?.trim()) {
    $q.notify({ type: 'warning', message: 'Código y nombre son requeridos' })
    return
  }
  if (!accountPreview.value.valid) {
    $q.notify({ type: 'warning', message: accountPreview.value.error || 'Código de cuenta inválido' })
    return
  }
  saving.value = true
  try {
    const payload = { ...accountForm, taxCode: accountForm.requiresTax ? accountForm.taxCode : null }
    if (accountForm.id) {
      await api.contabilidad.updateAccount(accountForm.id, payload)
    } else {
      await api.contabilidad.createAccount(payload)
    }
    accountDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Cuenta guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function saveVoucher() {
  if (!voucherForm.code?.trim() || !voucherForm.name?.trim()) {
    $q.notify({ type: 'warning', message: 'Código y nombre son requeridos' })
    return
  }
  saving.value = true
  try {
    if (voucherForm.id) {
      await api.contabilidad.updateVoucherType(voucherForm.id, voucherForm)
    } else {
      await api.contabilidad.createVoucherType(voucherForm)
    }
    voucherDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Comprobante guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function saveCostCenter() {
  if (!costCenterForm.code?.trim() || !costCenterForm.name?.trim()) {
    $q.notify({ type: 'warning', message: 'Código y nombre son requeridos' })
    return
  }
  saving.value = true
  try {
    if (costCenterForm.id) {
      await api.contabilidad.updateCostCenter(costCenterForm.id, costCenterForm)
    } else {
      await api.contabilidad.createCostCenter(costCenterForm)
    }
    costCenterDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Centro de costo guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function savePeriod() {
  if (!periodForm.year || !periodForm.month) {
    $q.notify({ type: 'warning', message: 'Año y mes son requeridos' })
    return
  }
  saving.value = true
  try {
    if (periodForm.id) {
      await api.contabilidad.updatePeriod(periodForm.id, periodForm)
    } else {
      await api.contabilidad.createPeriod(periodForm)
    }
    periodDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Periodo guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openTaxDialog(row = null) {
  Object.assign(taxForm, {
    id: row?.id || null,
    code: row?.code || '',
    name: row?.name || '',
    status: row?.status || 'activo',
  })
  taxDialog.value = true
}

function openTaxClassDialog(row = null, parentTax = null) {
  Object.assign(taxClassForm, {
    id: row?.id || null,
    taxId: row?.taxId || parentTax?.id || null,
    classCode: row?.classCode || '',
    description: row?.description || '',
    status: row?.status || 'activo',
  })
  if (parentTax?.id && !isTaxExpanded(parentTax.id)) toggleTaxExpand(parentTax.id)
  taxClassDialog.value = true
}

function onTaxRateTaxChange() {
  if (!taxRateForm.id) taxRateForm.taxClassId = null
}

function openTaxRateDialog(row = null, parentTax = null, parentClass = null) {
  Object.assign(taxRateForm, {
    id: row?.id || null,
    taxId: row?.taxId || parentTax?.id || null,
    taxClassId: row?.taxClassId || parentClass?.id || null,
    rateValue: row?.rateValue ?? 0,
    startDate: row?.startDate?.slice?.(0, 10) || '',
    endDate: row?.endDate?.slice?.(0, 10) || '',
    minAmount: row?.minAmount ?? 0,
    accountId: row?.accountId || null,
    status: row?.status || 'activo',
  })
  if (parentTax?.id && !isTaxExpanded(parentTax.id)) toggleTaxExpand(parentTax.id)
  if (parentClass?.id && !isClassExpanded(parentClass.id)) toggleClassExpand(parentClass.id)
  taxRateDialog.value = true
}

async function saveTax() {
  if (!taxForm.code?.trim() || !taxForm.name?.trim()) {
    $q.notify({ type: 'warning', message: 'Código y nombre son requeridos' })
    return
  }
  saving.value = true
  try {
    if (taxForm.id) await api.contabilidad.updateTax(taxForm.id, taxForm)
    else await api.contabilidad.createTax(taxForm)
    taxDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Impuesto guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function saveTaxClass() {
  if (!taxClassForm.taxId || !taxClassForm.classCode?.trim()) {
    $q.notify({ type: 'warning', message: 'Impuesto padre y clase son requeridos' })
    return
  }
  saving.value = true
  try {
    if (taxClassForm.id) await api.contabilidad.updateTaxClass(taxClassForm.id, taxClassForm)
    else await api.contabilidad.createTaxClass(taxClassForm)
    taxClassDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Clase guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function saveTaxRate() {
  if (!taxRateForm.taxId || !taxRateForm.taxClassId || !taxRateForm.startDate) {
    $q.notify({ type: 'warning', message: 'Impuesto, clase y fecha inicio son requeridos' })
    return
  }
  saving.value = true
  try {
    const payload = { ...taxRateForm, endDate: taxRateForm.endDate || null }
    if (taxRateForm.id) await api.contabilidad.updateTaxRate(taxRateForm.id, payload)
    else await api.contabilidad.createTaxRate(payload)
    taxRateDialog.value = false
    await loadAll()
    $q.notify({ type: 'positive', message: 'Vigencia guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await loadAll()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
})
</script>

<style scoped>
.tax-accordion__level2 {
  padding-left: 8px;
  border-left: 3px solid rgba(21, 101, 192, 0.25);
}

.tax-accordion__level3 {
  padding: 8px 8px 8px 16px;
  margin-left: 8px;
  border-left: 3px solid rgba(21, 101, 192, 0.15);
  background: #fff;
  border-radius: 4px;
}

.tax-accordion__nested-table :deep(thead tr) {
  background: #eef3f8;
}

.tax-accordion__rates-table {
  background: #fff;
}
</style>
