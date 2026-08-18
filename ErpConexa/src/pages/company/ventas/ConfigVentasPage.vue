<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <template v-if="tab === 'resolutions'">
        <div class="row q-gutter-sm items-center q-mb-md">
          <q-btn
            outline
            color="primary"
            icon="badge"
            label="Configurar emisor DIAN"
            unelevated
            @click="dianConfigDialog = true"
          />
          <q-btn
            color="primary"
            icon="add"
            label="Nueva resolución"
            unelevated
            @click="openResolutionDialog()"
          />
          <q-space />
          <q-badge :color="dianReadiness.ready ? 'positive' : 'warning'" class="q-py-xs q-px-sm">
            {{ dianReadiness.ready ? 'Emisor configurado' : 'Emisor incompleto' }}
          </q-badge>
        </div>

        <q-banner
          v-if="dianReadiness.missing.length"
          dense
          rounded
          class="bg-orange-1 text-orange-10 q-mb-md"
        >
          <template #avatar>
            <q-icon name="warning" color="orange-9" />
          </template>
          Faltan datos del emisor o resolución para enviar a DIAN.
          <q-btn flat dense no-caps label="Configurar emisor" color="orange-10" @click="dianConfigDialog = true" />
        </q-banner>

        <q-table :rows="resolutions" :columns="resolutionColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openResolutionDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #body-cell-documentType="props">
            <q-td :props="props">
              <q-badge outline color="primary">{{ docTypeLabel(props.row.documentType) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-resolutionDate="props">
            <q-td :props="props">{{ props.row.resolutionDate?.slice?.(0, 10) || '—' }}</q-td>
          </template>
          <template #body-cell-dianEnvironment="props">
            <q-td :props="props">
              <q-badge outline :color="envBadgeColor(props.row.dianEnvironment)">
                {{ dianEnvironmentLabel(props.row.dianEnvironment) }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'grey'">
                {{ props.row.isActive ? 'Activa' : 'Inactiva' }}
              </q-badge>
            </q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'clients'">
        <q-btn color="primary" icon="add" label="Nuevo cliente" class="q-mb-md" unelevated @click="openCrud('cli')" />
        <q-table :rows="clients" :columns="clientColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openCrud('cli', props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #body-cell-fullName="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.fullName || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-documentDisplay="props">
            <q-td :props="props">
              <q-badge outline color="primary" class="q-mr-xs">{{ docTypeAbbr(props.row.documentType) }}</q-badge>
              {{ props.row.documentDisplay || props.row.documentNumber }}
            </q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'services'">
        <q-btn color="primary" icon="add" label="Nuevo servicio" class="q-mb-md" unelevated @click="openCrud('svc')" />
        <q-table :rows="services" :columns="serviceColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openCrud('svc', props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #body-cell-description="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.description || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-basePrice="props">
            <q-td :props="props">${{ formatMoney(props.row.basePrice) }}</q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'variables'">
        <q-banner v-if="nextServicePreview" rounded class="bg-blue-1 text-primary q-mb-md">
          <template #avatar>
            <q-icon name="info" color="primary" />
          </template>
          Próximo código de servicio: <strong>{{ nextServicePreview }}</strong>
        </q-banner>
        <q-table :rows="variables" :columns="variableColumns" row-key="key" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn
                v-if="props.row.isEditable"
                flat
                dense
                round
                size="sm"
                icon="edit"
                color="primary"
                @click="openVariableDialog(props.row)"
              >
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #body-cell-description="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.description || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-value="props">
            <q-td :props="props">
              <q-badge outline color="primary">{{ props.row.value }}</q-badge>
            </q-td>
          </template>
        </q-table>
      </template>
    </div>

    <CompanyFormDialog
      v-model="dianConfigDialog"
      title="Emisor DIAN"
      icon="badge"
      wide
      dian-emitter
    >
      <q-banner v-if="dianSaveError" class="bg-red-1 text-negative q-mb-md" dense rounded>
        <template #avatar>
          <q-icon name="error" color="negative" />
        </template>
        {{ dianSaveError }}
      </q-banner>
      <div class="dian-emitter-grid">
        <div class="dian-emitter-grid__panel">
          <div class="dian-emitter-grid__title">
            <q-icon name="badge" size="xs" class="q-mr-xs" /> Datos del emisor
          </div>
          <q-input
            :model-value="dianConfig.name"
            class="f-full"
            label="Razón social"
            outlined
            dense
            readonly
            hide-bottom-space
          />
          <q-input
            :model-value="dianConfig.nit"
            class="f-nit"
            label="NIT emisor"
            outlined
            dense
            readonly
            hide-bottom-space
            bg-color="grey-2"
          />
          <q-input
            :model-value="emitterDv"
            class="f-dv"
            label="DV"
            outlined
            dense
            readonly
            hide-bottom-space
            bg-color="grey-2"
          />
          <q-input
            v-model="dianConfig.contactEmail"
            class="f-full"
            type="email"
            label="Contacto DIAN *"
            outlined
            dense
            hide-bottom-space
          />
          <q-input
            v-model="dianConfig.dianSoftwareId"
            class="f-full"
            label="Software ID *"
            outlined
            dense
            hide-bottom-space
          />
          <q-input
            v-model="dianConfig.dianSoftwarePin"
            class="f-full"
            :type="showSoftwarePin ? 'text' : 'password'"
            label="Clave del software *"
            outlined
            dense
            hide-bottom-space
            autocomplete="new-password"
            :hint="softwarePinHint"
          >
            <template #append>
              <q-icon
                v-if="dianConfig.pinDecryptOk"
                name="check_circle"
                color="positive"
                class="q-mr-xs"
              >
                <q-tooltip>PIN guardado y legible en el servidor</q-tooltip>
              </q-icon>
              <q-icon
                :name="showSoftwarePin ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showSoftwarePin = !showSoftwarePin"
              />
            </template>
          </q-input>
          <q-input
            v-model="dianConfig.dianTestSetId"
            class="f-full"
            label="Set de pruebas"
            outlined
            dense
            hide-bottom-space
          />
        </div>

        <div class="dian-emitter-grid__panel">
          <div class="dian-emitter-grid__title">
            <q-icon name="mail" size="xs" class="q-mr-xs" /> Envío de facturas
          </div>
          <q-input
            v-model="dianConfig.invoiceFromName"
            class="f-full"
            label="Nombre remitente *"
            outlined
            dense
            hide-bottom-space
          />
          <q-input
            v-model="dianConfig.invoiceFromEmail"
            class="f-full"
            type="email"
            label="Correo remitente *"
            outlined
            dense
            hide-bottom-space
          />
          <q-input
            v-model="dianConfig.smtpHost"
            class="f-full"
            label="Servidor SMTP *"
            outlined
            dense
            hide-bottom-space
          />
          <q-input
            v-model.number="dianConfig.smtpPort"
            class="f-port"
            type="number"
            label="Puerto *"
            outlined
            dense
            hide-bottom-space
          />
          <div class="f-tls">
            <q-toggle
              v-model="dianConfig.smtpSecure"
              :label="dianConfig.smtpPort === 465 ? 'TLS directo (465)' : 'STARTTLS (587)'"
              color="primary"
              dense
            />
            <div v-if="dianConfig.smtpPort === 587 && dianConfig.smtpSecure" class="text-caption text-orange-9 q-mt-xs">
              Puerto 587 usa STARTTLS; deje esta opción desactivada.
            </div>
          </div>
          <q-input
            v-model="dianConfig.smtpUser"
            class="f-full"
            label="Usuario SMTP *"
            outlined
            dense
            hide-bottom-space
            autocomplete="username"
          />
          <q-input
            v-model="dianConfig.smtpPassword"
            class="f-full"
            :type="showSmtpPassword ? 'text' : 'password'"
            label="Contraseña SMTP"
            outlined
            dense
            hide-bottom-space
            autocomplete="new-password"
          >
            <template #append>
              <q-icon
                :name="showSmtpPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showSmtpPassword = !showSmtpPassword"
              />
            </template>
          </q-input>
        </div>

        <div class="dian-cert-panel">
          <div class="dian-cert-panel__title">
            <q-icon name="verified_user" size="xs" class="q-mr-xs" />
            Certificado digital (ServerFEpos)
          </div>

          <q-banner v-if="certSaveError" class="bg-red-1 text-negative q-mb-sm" dense rounded>
            {{ certSaveError }}
          </q-banner>

          <div v-if="dianCertificate.configured" class="dian-cert-panel__meta q-mb-md">
            <div><strong>Titular:</strong> {{ dianCertificate.subjectCn || '—' }}</div>
            <div><strong>NIT certificado:</strong> {{ dianCertificate.subjectNit || '—' }}</div>
            <div v-if="dianCertificate.subjectDv"><strong>DV certificado:</strong> {{ dianCertificate.subjectDv }}</div>
            <div>
              <strong>Vigencia:</strong>
              {{ formatCertDate(dianCertificate.validFrom) }} — {{ formatCertDate(dianCertificate.validTo) }}
              <q-badge
                v-if="dianCertificate.isValid"
                color="positive"
                class="q-ml-xs"
                :label="`${dianCertificate.daysRemaining} días`"
              />
              <q-badge v-else color="negative" class="q-ml-xs" label="No vigente" />
            </div>
            <div>
              <q-icon
                :name="dianCertificate.syncedToFePos ? 'cloud_done' : 'cloud_off'"
                size="xs"
                class="q-mr-xs"
              />
              {{ dianCertificate.syncedToFePos ? 'Sincronizado con ServerFEpos' : 'Pendiente de sincronizar' }}
            </div>
          </div>

          <div class="dian-cert-panel__grid">
            <q-file
              v-model="certFile"
              label="Archivo .p12 / .pfx *"
              outlined
              dense
              accept=".p12,.pfx"
              clearable
              hide-bottom-space
            >
              <template #prepend>
                <q-icon name="upload_file" />
              </template>
            </q-file>
            <q-input
              v-model="certPassword"
              :type="showCertPassword ? 'text' : 'password'"
              label="Contraseña del certificado *"
              outlined
              dense
              hide-bottom-space
              autocomplete="new-password"
            >
              <template #append>
                <q-icon
                  :name="showCertPassword ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  @click="showCertPassword = !showCertPassword"
                />
              </template>
            </q-input>
            <div class="row q-gutter-sm">
              <q-btn
                color="primary"
                icon="cloud_upload"
                label="Subir certificado"
                :loading="uploadingCert"
                unelevated
                @click="uploadCertificate"
              />
              <q-btn
                v-if="dianCertificate.configured"
                flat
                icon="delete"
                color="negative"
                label="Quitar"
                :loading="uploadingCert"
                @click="removeCertificate"
              />
            </div>
          </div>

          <div class="text-caption text-grey-7 q-mt-sm">
            Se valida la contraseña, vigencia y NIT del titular. El archivo se guarda en la API y se copia a
            <code>ServerFEpos/cert/companies/{id}/</code> para la firma DIAN.
          </div>
        </div>

        <q-expansion-item
          v-if="sendReadiness.missing.length || sendReadiness.warnings.length || dianReadiness.missing.length || dianReadiness.warnings.length || invoiceEmailReadiness.missing.length || certificateReadiness.missing.length"
          class="dian-emitter-grid__status"
          dense
          dense-toggle
          icon="fact_check"
          label="Estado para envío DIAN"
          header-class="text-grey-8 q-py-xs"
          default-opened
        >
          <div v-if="sendReadiness.missing.length" class="q-px-sm q-pb-xs">
            <div class="text-caption text-negative q-mb-xs">Pendiente para enviar a DIAN:</div>
            <q-chip
              v-for="item in sendReadiness.missing"
              :key="`send-${item}`"
              dense
              color="red-1"
              text-color="negative"
              class="q-ma-xs"
            >
              {{ item }}
            </q-chip>
          </div>
          <div v-if="invoiceEmailReadiness.missing.length" class="q-px-sm q-pb-xs">
            <div class="text-caption text-primary q-mb-xs">Correo facturas:</div>
            <q-chip
              v-for="item in invoiceEmailReadiness.missing"
              :key="`mail-${item}`"
              dense
              outline
              color="primary"
              class="q-ma-xs"
            >
              {{ item }}
            </q-chip>
          </div>
          <div v-if="dianReadiness.missing.length" class="q-px-sm q-pb-xs">
            <div class="text-caption text-negative q-mb-xs">DIAN:</div>
            <q-chip
              v-for="item in dianReadiness.missing"
              :key="item"
              dense
              color="red-1"
              text-color="negative"
              class="q-ma-xs"
            >
              {{ item }}
            </q-chip>
          </div>
          <div v-if="certificateReadiness.missing.length" class="q-px-sm q-pb-xs">
            <div class="text-caption text-orange-10 q-mb-xs">Certificado:</div>
            <q-chip
              v-for="item in certificateReadiness.missing"
              :key="`cert-${item}`"
              dense
              outline
              color="orange-9"
              class="q-ma-xs"
            >
              {{ item }}
            </q-chip>
          </div>
          <div v-if="sendReadiness.warnings.length" class="q-px-sm q-pb-sm">
            <div class="text-caption text-grey-7 q-mb-xs">Integración técnica:</div>
            <q-chip
              v-for="item in sendReadiness.warnings"
              :key="`warn-send-${item}`"
              dense
              outline
              color="grey-6"
              class="q-ma-xs"
            >
              {{ item }}
            </q-chip>
          </div>
        </q-expansion-item>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn
          color="primary"
          icon="save"
          label="Guardar emisor"
          :loading="savingDianConfig"
          unelevated
          @click="saveDianConfig"
        />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog
      v-model="resolutionDialog"
      :title="resolutionForm.id ? 'Editar resolución DIAN' : 'Nueva resolución DIAN'"
      icon="gavel"
      wide
      dian-resolution
    >
      <div class="dian-resolution-grid">
        <q-select
          v-model="resolutionForm.documentType"
          class="f-type"
          :options="docTypeOptions"
          label="Tipo documento *"
          outlined
          dense
          hide-bottom-space
          emit-value
          map-options
        />
        <q-select
          v-model="resolutionForm.dianEnvironment"
          class="f-env"
          :options="envOptions"
          label="Ambiente DIAN *"
          outlined
          dense
          hide-bottom-space
          emit-value
          map-options
        />
        <q-input
          v-model="resolutionForm.resolutionNumber"
          class="f-resol"
          label="Número resolución *"
          outlined
          dense
          hide-bottom-space
        />
        <q-banner
          v-if="dianEnvironmentHint(resolutionForm.dianEnvironment)"
          class="f-env-hint"
          dense
          rounded
          :class="envHintBannerClass(resolutionForm.dianEnvironment)"
        >
          <template #avatar>
            <q-icon :name="envHintIcon(resolutionForm.dianEnvironment)" size="sm" />
          </template>
          {{ dianEnvironmentHint(resolutionForm.dianEnvironment) }}
          <template
            v-if="resolutionForm.dianEnvironment === 'habilitacion' && !dianConfig.dianTestSetId"
            #action
          >
            <q-btn
              flat
              dense
              no-caps
              color="orange-10"
              label="Configurar set"
              @click="resolutionDialog = false; dianConfigDialog = true"
            />
          </template>
        </q-banner>
        <q-input
          v-model="resolutionForm.prefix"
          class="f-prefix"
          label="Prefijo *"
          outlined
          dense
          hide-bottom-space
        />
        <q-input
          v-model="resolutionForm.resolutionDate"
          class="f-exp"
          type="date"
          label="Fecha expedición *"
          outlined
          dense
          hide-bottom-space
        />
        <q-input
          v-model.number="resolutionForm.rangeFrom"
          class="f-from"
          type="number"
          label="Consecutivo desde *"
          outlined
          dense
          hide-bottom-space
        />
        <q-input
          v-model.number="resolutionForm.rangeTo"
          class="f-to"
          type="number"
          label="Consecutivo hasta *"
          outlined
          dense
          hide-bottom-space
        />
        <q-input
          v-model="resolutionForm.validFrom"
          class="f-vfrom"
          type="date"
          label="Vigencia desde *"
          outlined
          dense
          hide-bottom-space
        />
        <q-input
          v-model="resolutionForm.validTo"
          class="f-vto"
          type="date"
          label="Vigencia hasta *"
          outlined
          dense
          hide-bottom-space
        />
        <q-input
          v-model="resolutionForm.technicalKey"
          class="f-key"
          label="Clave técnica *"
          outlined
          dense
          hide-bottom-space
        />
        <q-toggle
          v-if="resolutionForm.id"
          v-model="resolutionForm.isActive"
          class="f-active"
          label="Resolución activa"
          color="positive"
          dense
        />
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveResolution" />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog
      v-model="crudDialog"
      :title="crudTitle"
      :icon="crudType === 'cli' ? 'person_add' : 'list_alt'"
      :client="crudType === 'cli'"
    >
      <ClientFormFields v-if="crudType === 'cli'" v-model="clientForm" />
      <div v-else class="q-gutter-md">
        <q-input
          v-if="crudId"
          v-model="crudForm.code"
          label="Código"
          outlined
          dense
          readonly
          hint="El código se asigna automáticamente al crear el servicio"
        />
        <q-banner v-else-if="nextServicePreview" dense rounded class="bg-blue-1 text-primary">
          Código asignado: <strong>{{ nextServicePreview }}</strong>
        </q-banner>
        <q-input v-model="crudForm.description" label="Descripción *" outlined dense />
        <MoneyInput v-model="crudForm.basePrice" label="Precio base *" />
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveCrud" />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog v-model="variableDialog" title="Editar variable" icon="tune">
      <div class="q-gutter-md">
        <div class="text-subtitle2">{{ variableForm.label }}</div>
        <div class="text-caption text-grey-7 q-mb-sm">{{ variableForm.description }}</div>
        <q-input
          v-model="variableForm.value"
          :label="variableForm.key === 'services.code_prefix' ? 'Prefijo (2-8 caracteres)' : 'Valor'"
          outlined
          dense
          :hint="variableForm.key === 'services.code_prefix' ? 'Solo letras y números. Ej: SRV, SER01' : ''"
          @update:model-value="onVariableInput"
        />
        <q-banner v-if="variableForm.key === 'services.code_prefix' && variablePreview" dense rounded class="bg-blue-1 text-primary">
          Ejemplo de código: <strong>{{ variablePreview }}</strong>
        </q-banner>
      </div>
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="save" label="Guardar" :loading="saving" unelevated @click="saveVariable" />
      </template>
    </CompanyFormDialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import ClientFormFields from 'src/components/company/ClientFormFields.vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'
import { documentTypeLabel, defaultTaxLevel } from 'src/utils/dian-client.js'
import { calcNitVerificationDigit } from 'src/utils/nit-dv.js'
import { dianEnvironmentLabel, dianEnvironmentHint } from 'src/utils/dian-environment.js'

const $q = useQuasar()

const validTabs = ['resolutions', 'clients', 'services', 'variables']
const tab = useCompanyPageTab(validTabs, 'resolutions')

const pageMetaMap = {
  resolutions: { title: 'Factura electrónica (DIAN)', icon: 'cloud_upload' },
  clients: { title: 'Clientes', icon: 'people' },
  services: { title: 'Servicios', icon: 'list_alt' },
  variables: { title: 'Variables del sistema', icon: 'tune' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.resolutions)
const saving = ref(false)

const resolutions = ref([])
const clients = ref([])
const services = ref([])
const variables = ref([])
const nextServicePreview = ref('')
const savingDianConfig = ref(false)
const dianConfigDialog = ref(false)
const dianSaveError = ref('')
const showSmtpPassword = ref(false)
const showSoftwarePin = ref(false)
const showCertPassword = ref(false)
const certFile = ref(null)
const certPassword = ref('')
const certSaveError = ref('')
const uploadingCert = ref(false)

const dianCertificate = reactive({
  configured: false,
  subjectCn: '',
  subjectNit: '',
  subjectDv: '',
  isValid: false,
  daysRemaining: null,
  validFrom: null,
  validTo: null,
  syncedToFePos: false,
})

const certificateReadiness = reactive({
  ready: false,
  missing: [],
  warnings: [],
})

const sendReadiness = reactive({
  ready: false,
  missing: [],
  warnings: [],
})

const dianConfig = reactive({
  nit: '',
  verificationDigit: '',
  name: '',
  contactEmail: '',
  dianSoftwareId: '',
  dianSoftwarePin: '',
  hasDianSoftwarePin: false,
  pinDecryptOk: false,
  dianTestSetId: '',
  invoiceFromEmail: '',
  invoiceFromName: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  hasSmtpPassword: false,
})

const invoiceEmailReadiness = reactive({
  ready: false,
  missing: [],
})

const emitterDv = computed(() => {
  if (dianConfig.verificationDigit !== '' && dianConfig.verificationDigit != null) {
    return String(dianConfig.verificationDigit)
  }
  const dv = calcNitVerificationDigit(dianConfig.nit)
  return dv != null ? String(dv) : ''
})

const softwarePinHint = computed(() => {
  if (dianConfig.dianSoftwarePin?.trim()) return 'Se guardará al pulsar Guardar'
  if (dianConfig.pinDecryptOk) return 'PIN guardado. Deje en blanco para mantenerlo.'
  if (dianConfig.hasDianSoftwarePin) {
    return 'Hay un PIN antiguo ilegible. Vuelva a escribir 12345 y guarde.'
  }
  return undefined
})

const dianReadiness = reactive({
  ready: false,
  missing: [],
  warnings: [],
  hasHabilitacion: false,
})

const resolutionDialog = ref(false)
const crudDialog = ref(false)
const variableDialog = ref(false)
const crudType = ref('cli')
const crudId = ref(null)

const resolutionForm = reactive({
  id: null,
  documentType: '01',
  resolutionNumber: '',
  prefix: '',
  resolutionDate: '',
  rangeFrom: 1,
  rangeTo: 5000,
  validFrom: '',
  validTo: '',
  technicalKey: '',
  dianEnvironment: 'habilitacion',
  isActive: true,
})

const crudForm = reactive({
  code: '',
  description: '',
  basePrice: 0,
})

const variableForm = reactive({
  key: '',
  label: '',
  description: '',
  value: '',
})

const variablePreview = computed(() => {
  if (variableForm.key !== 'services.code_prefix') return ''
  const prefix = String(variableForm.value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  if (prefix.length < 2) return ''
  return `${prefix}0001`
})

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

const clientForm = reactive(emptyClientForm())

const docTypeOptions = [
  { label: 'Factura (01)', value: '01' },
  { label: 'Nota crédito (91)', value: '91' },
]

const envOptions = [
  { label: 'Habilitación (set DIAN)', value: 'habilitacion' },
  { label: 'Pruebas', value: 'pruebas' },
  { label: 'Producción', value: 'produccion' },
]

const resolutionColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'documentType', label: 'Tipo', field: 'documentType', align: 'left', style: 'width: 72px' },
  { name: 'resolutionNumber', label: 'Resolución', field: 'resolutionNumber', align: 'left', style: 'width: 100px' },
  { name: 'prefix', label: 'Prefijo', field: 'prefix', align: 'left', style: 'width: 72px' },
  { name: 'resolutionDate', label: 'Expedición', field: 'resolutionDate', align: 'left', style: 'width: 100px' },
  { name: 'rangeFrom', label: 'Desde', field: 'rangeFrom', align: 'right', style: 'width: 80px' },
  { name: 'rangeTo', label: 'Hasta', field: 'rangeTo', align: 'right', style: 'width: 80px' },
  { name: 'currentConsecutive', label: 'Siguiente', field: 'currentConsecutive', align: 'right', style: 'width: 80px' },
  { name: 'dianEnvironment', label: 'Ambiente', field: 'dianEnvironment', align: 'left', style: 'width: 100px' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center', style: 'width: 80px' },
]

const clientColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'documentDisplay', label: 'Identificación', field: 'documentDisplay', align: 'left', style: 'width: 140px' },
  { name: 'fullName', label: 'Nombre / Razón social', field: 'fullName', align: 'left', style: 'max-width: 220px' },
  { name: 'email', label: 'Email', field: 'email', align: 'left', style: 'max-width: 180px' },
  { name: 'phone', label: 'Teléfono', field: 'phone', align: 'left', style: 'width: 110px' },
]

const serviceColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', style: 'width: 90px' },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left', style: 'max-width: 280px' },
  { name: 'basePrice', label: 'Precio', field: 'basePrice', align: 'right', style: 'width: 100px' },
]

const variableColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'label', label: 'Variable', field: 'label', align: 'left', style: 'width: 160px' },
  { name: 'value', label: 'Valor', field: 'value', align: 'left', style: 'width: 120px' },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left', style: 'max-width: 280px' },
]

const crudTitle = computed(() => {
  if (crudType.value === 'cli') return crudId.value ? 'Editar cliente' : 'Nuevo cliente'
  return crudId.value ? 'Editar servicio' : 'Nuevo servicio'
})

onMounted(loadAll)

async function loadAll() {
  try {
    const [resData, cliData, svcData, varData] = await Promise.all([
      api.ventas.resolutions(),
      api.ventas.clients(),
      api.ventas.services(),
      api.ventas.settings(),
    ])
    resolutions.value = resData
    clients.value = cliData
    services.value = svcData
    variables.value = varData
    await refreshNextServicePreview()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
    return
  }

  try {
    applyDianConfig(await api.ventas.dianConfig())
  } catch (e) {
    $q.notify({
      type: 'warning',
      message: e.message || 'No se pudo cargar la configuración DIAN. Reinicie la API (puerto 3500).',
      timeout: 6000,
    })
  }
}

function applyDianConfig(data) {
  Object.assign(dianConfig, {
    nit: data.company?.nit || '',
    verificationDigit: data.company?.verificationDigit || '',
    name: data.company?.name || '',
    contactEmail: data.company?.email || '',
    dianSoftwareId: data.company?.dianSoftwareId || '',
    dianSoftwarePin: '',
    hasDianSoftwarePin: data.company?.hasDianSoftwarePin ?? false,
    pinDecryptOk: data.company?.pinDecryptOk ?? false,
    dianTestSetId: data.company?.dianTestSetId || '',
    invoiceFromEmail: data.invoiceEmail?.fromEmail || '',
    invoiceFromName: data.invoiceEmail?.fromName || data.company?.name || '',
    smtpHost: data.invoiceEmail?.smtpHost || '',
    smtpPort: data.invoiceEmail?.smtpPort ?? 587,
    smtpSecure: data.invoiceEmail?.smtpSecure ?? ((data.invoiceEmail?.smtpPort ?? 587) === 465),
    smtpUser: data.invoiceEmail?.smtpUser || '',
    smtpPassword: '',
    hasSmtpPassword: data.invoiceEmail?.hasSmtpPassword ?? false,
  })
  Object.assign(invoiceEmailReadiness, {
    ready: data.invoiceEmailReadiness?.ready ?? false,
    missing: data.invoiceEmailReadiness?.missing ?? [],
  })
  Object.assign(dianReadiness, {
    ready: data.readiness?.ready ?? false,
    missing: data.readiness?.missing ?? [],
    warnings: data.readiness?.warnings ?? [],
    hasHabilitacion: data.readiness?.hasHabilitacion ?? false,
  })
  Object.assign(dianCertificate, {
    configured: data.certificate?.configured ?? false,
    subjectCn: data.certificate?.subjectCn || '',
    subjectNit: data.certificate?.subjectNit || '',
    subjectDv: data.certificate?.subjectDv || '',
    isValid: data.certificate?.isValid ?? false,
    daysRemaining: data.certificate?.daysRemaining ?? null,
    validFrom: data.certificate?.validFrom || null,
    validTo: data.certificate?.validTo || null,
    syncedToFePos: data.certificate?.syncedToFePos ?? false,
  })
  Object.assign(certificateReadiness, {
    ready: data.certificateReadiness?.ready ?? false,
    missing: data.certificateReadiness?.missing ?? [],
    warnings: data.certificateReadiness?.warnings ?? [],
  })
  Object.assign(sendReadiness, {
    ready: data.sendReadiness?.ready ?? false,
    missing: data.sendReadiness?.missing ?? [],
    warnings: data.sendReadiness?.warnings ?? [],
  })
}

watch(
  () => dianConfigDialog.value,
  async (open) => {
    if (!open) {
      dianSaveError.value = ''
      certSaveError.value = ''
      certFile.value = null
      certPassword.value = ''
      return
    }
    try {
      applyDianConfig(await api.ventas.dianConfig())
    } catch (e) {
      dianSaveError.value = e.message || 'No se pudo cargar la configuración DIAN'
    }
  }
)

function collectDianConfigErrors() {
  const missing = []
  if (!dianConfig.contactEmail?.trim()) missing.push('Contacto DIAN')
  if (!dianConfig.dianSoftwareId?.trim()) missing.push('Software ID')
  if (!dianConfig.dianSoftwarePin?.trim() && !dianConfig.pinDecryptOk) {
    missing.push('Clave del software')
  }
  return missing
}

async function saveDianConfig() {
  savingDianConfig.value = true
  dianSaveError.value = ''
  try {
    const missing = collectDianConfigErrors()
    if (missing.length) {
      throw new Error(`Complete los campos obligatorios: ${missing.join(', ')}`)
    }
    const data = await api.ventas.updateDianConfig({
      contactEmail: dianConfig.contactEmail.trim(),
      dianSoftwareId: dianConfig.dianSoftwareId,
      dianSoftwarePin: dianConfig.dianSoftwarePin.trim() || undefined,
      dianTestSetId: dianConfig.dianTestSetId,
      invoiceFromEmail: dianConfig.invoiceFromEmail.trim(),
      invoiceFromName: dianConfig.invoiceFromName.trim(),
      smtpHost: dianConfig.smtpHost.trim(),
      smtpPort: dianConfig.smtpPort,
      smtpSecure: dianConfig.smtpSecure,
      smtpUser: dianConfig.smtpUser.trim(),
      smtpPassword: dianConfig.smtpPassword.trim() || undefined,
    })
    applyDianConfig(data)
    showSmtpPassword.value = false
    showSoftwarePin.value = false
    dianConfigDialog.value = false
    const pinMsg = data.pinUpdated
      ? ' (PIN actualizado)'
      : data.pinSaved
        ? ' (PIN ya estaba guardado)'
        : ''
    $q.notify({ type: 'positive', message: `Emisor DIAN guardado${pinMsg}` })
  } catch (e) {
    dianSaveError.value = e.message || 'No se pudo guardar el emisor DIAN'
    $q.notify({ type: 'negative', message: dianSaveError.value })
  } finally {
    savingDianConfig.value = false
  }
}

function formatCertDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CO')
}

async function uploadCertificate() {
  certSaveError.value = ''
  if (!certFile.value) {
    certSaveError.value = 'Seleccione el archivo .p12 o .pfx'
    return
  }
  if (!certPassword.value.trim()) {
    certSaveError.value = 'Ingrese la contraseña del certificado'
    return
  }
  uploadingCert.value = true
  try {
    const data = await api.ventas.uploadDianCertificate(certFile.value, certPassword.value.trim())
    applyDianConfig(data)
    certFile.value = null
    certPassword.value = ''
    showCertPassword.value = false
    $q.notify({ type: 'positive', message: data.message || 'Certificado registrado' })
  } catch (e) {
    certSaveError.value = e.message || 'No se pudo subir el certificado'
    $q.notify({ type: 'negative', message: certSaveError.value })
  } finally {
    uploadingCert.value = false
  }
}

async function removeCertificate() {
  $q.dialog({
    title: 'Quitar certificado',
    message: '¿Eliminar el certificado digital de esta compañía?',
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    uploadingCert.value = true
    certSaveError.value = ''
    try {
      const data = await api.ventas.deleteDianCertificate()
      applyDianConfig(data)
      $q.notify({ type: 'positive', message: 'Certificado eliminado' })
    } catch (e) {
      certSaveError.value = e.message || 'No se pudo eliminar el certificado'
      $q.notify({ type: 'negative', message: certSaveError.value })
    } finally {
      uploadingCert.value = false
    }
  })
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

async function refreshNextServicePreview() {
  try {
    const data = await api.ventas.nextServiceCode()
    nextServicePreview.value = data.nextCode
  } catch {
    nextServicePreview.value = ''
  }
}

function docTypeLabel(type) {
  return type === '91' ? 'NC' : 'Factura'
}

function openResolutionDialog(row = null) {
  Object.assign(resolutionForm, {
    id: row?.id || null,
    documentType: row?.documentType || '01',
    resolutionNumber: row?.resolutionNumber || '',
    prefix: row?.prefix || '',
    resolutionDate: row?.resolutionDate?.slice?.(0, 10) || todayIsoDate(),
    rangeFrom: row?.rangeFrom || 1,
    rangeTo: row?.rangeTo || 5000,
    validFrom: row?.validFrom?.slice?.(0, 10) || '',
    validTo: row?.validTo?.slice?.(0, 10) || '',
    technicalKey: row?.technicalKey || '',
    dianEnvironment: row?.dianEnvironment || 'habilitacion',
    isActive: row?.isActive ?? true,
  })
  resolutionDialog.value = true
}

async function saveResolution() {
  saving.value = true
  try {
    if (resolutionForm.dianEnvironment === 'habilitacion' && !dianConfig.dianTestSetId) {
      throw new Error('Configure el Set de pruebas en «Configurar emisor DIAN» antes de guardar')
    }
    if (!resolutionForm.technicalKey?.trim()) {
      throw new Error('La clave técnica es obligatoria')
    }

    const willBeActive = resolutionForm.id ? resolutionForm.isActive : true
    if (willBeActive) {
      const conflict = resolutions.value.find(
        (r) => r.isActive
          && r.documentType === resolutionForm.documentType
          && r.id !== resolutionForm.id
      )
      if (conflict) {
        const tipo = resolutionForm.documentType === '91' ? 'nota crédito' : 'factura'
        throw new Error(
          `Ya hay una resolución activa de ${tipo} (${conflict.prefix} — ${conflict.resolutionNumber}). Desactívela primero.`
        )
      }
    }

    const payload = { ...resolutionForm }
    delete payload.id
    if (resolutionForm.id) {
      await api.ventas.updateResolution(resolutionForm.id, payload)
    } else {
      await api.ventas.createResolution(payload)
    }
    resolutionDialog.value = false
    resolutions.value = await api.ventas.resolutions()
    const dianData = await api.ventas.dianConfig()
    applyDianConfig(dianData)
    $q.notify({ type: 'positive', message: 'Resolución guardada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function docTypeAbbr(type) {
  return documentTypeLabel(type)
}

function envBadgeColor(environment) {
  if (environment === 'produccion') return 'negative'
  if (environment === 'pruebas') return 'orange'
  if (environment === 'habilitacion') return 'info'
  return 'grey'
}

function envHintBannerClass(environment) {
  if (environment === 'produccion') return 'bg-red-1 text-red-10'
  if (environment === 'pruebas') return 'bg-orange-1 text-orange-10'
  if (environment === 'habilitacion') {
    return dianConfig.dianTestSetId ? 'bg-blue-1 text-blue-10' : 'bg-orange-1 text-orange-10'
  }
  return 'bg-grey-2 text-grey-9'
}

function envHintIcon(environment) {
  if (environment === 'produccion') return 'verified'
  if (environment === 'pruebas') return 'science'
  if (environment === 'habilitacion') return dianConfig.dianTestSetId ? 'info' : 'warning'
  return 'info'
}

function openCrud(type, row = null) {
  crudType.value = type
  crudId.value = row?.id || null
  if (type === 'cli') {
    Object.assign(clientForm, emptyClientForm(), row ? {
      documentType: row.documentType || '13',
      documentNumber: row.documentNumber || '',
      verificationDigit: row.verificationDigit || '',
      personType: row.personType || 'natural',
      taxLevelCode: row.taxLevelCode || defaultTaxLevel(row.personType),
      businessName: row.businessName || '',
      firstName: row.firstName || '',
      middleName: row.middleName || '',
      lastName: row.lastName || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      cityCode: row.cityCode || '',
      cityName: row.cityName || '',
      departmentName: row.departmentName || '',
      departmentCode: row.departmentCode || '',
      countryCode: row.countryCode || 'CO',
    } : {})
  } else {
    Object.assign(crudForm, {
      code: row?.code || '',
      description: row?.description || '',
      basePrice: row?.basePrice || 0,
    })
    if (!row) refreshNextServicePreview()
  }
  crudDialog.value = true
}

function openVariableDialog(row) {
  Object.assign(variableForm, {
    key: row.key,
    label: row.label,
    description: row.description || '',
    value: row.value || '',
  })
  variableDialog.value = true
}

function onVariableInput() {
  if (variableForm.key === 'services.code_prefix') {
    variableForm.value = String(variableForm.value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8)
  }
}

async function saveVariable() {
  saving.value = true
  try {
    await api.ventas.updateSetting(variableForm.key, variableForm.value)
    variableDialog.value = false
    variables.value = await api.ventas.settings()
    await refreshNextServicePreview()
    $q.notify({ type: 'positive', message: 'Variable actualizada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function saveCrud() {
  saving.value = true
  try {
    if (crudType.value === 'cli') {
      const p = { ...clientForm }
      let saved
      if (crudId.value) saved = await api.ventas.updateClient(crudId.value, p)
      else saved = await api.ventas.createClient(p)
      clients.value = await api.ventas.clients()
      if (saved?.dianValidation?.warning) {
        $q.notify({ type: 'warning', message: saved.dianValidation.warning })
      } else if (saved?.dianValidation?.validated) {
        $q.notify({ type: 'info', message: 'Cliente validado con DIAN', timeout: 2000 })
      }
    } else {
      const p = { description: crudForm.description, basePrice: crudForm.basePrice }
      if (crudId.value) await api.ventas.updateService(crudId.value, p)
      else await api.ventas.createService(p)
      services.value = await api.ventas.services()
      await refreshNextServicePreview()
    }
    crudDialog.value = false
    $q.notify({ type: 'positive', message: 'Guardado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}
</script>
