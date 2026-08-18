<template>
  <div>
    <div v-if="loading" class="text-center q-pa-md">
      <q-spinner color="primary" size="md" />
    </div>

    <div v-else-if="submissions.length">
      <div v-if="props.invoiceId" class="row q-gutter-sm q-mb-sm">
        <q-btn
          flat
          dense
          no-caps
          color="red-7"
          icon="picture_as_pdf"
          label="Ver PDF"
          @click="openPdf"
        />
        <q-btn
          v-if="hasApprovedSubmission"
          flat
          dense
          no-caps
          color="primary"
          icon="folder_zip"
          :label="zipButtonLabel"
          :title="latestZipName"
          :loading="downloadingZip"
          @click="downloadClientPackage"
        />
        <q-btn
          v-if="hasApprovedSubmission"
          flat
          dense
          no-caps
          color="teal"
          icon="email"
          label="Enviar al cliente"
          :loading="sendingToClient"
          @click="confirmSendToClient"
        />
      </div>
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="s in submissions" :key="s.id" class="q-pa-md">
          <q-item-section avatar>
            <q-icon
              :name="submissionIcon(s.status)"
              :color="submissionColor(s.status)"
              size="md"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">
              Intento #{{ s.attemptNumber }} — {{ submissionLabel(s.status) }}
            </q-item-label>
            <q-item-label caption>
              {{ formatDate(s.createdAt) }}
              <span v-if="s.dianEnvironment"> · {{ dianEnvironmentLabel(s.dianEnvironment) }}</span>
            </q-item-label>
            <q-item-label
              v-if="s.statusMessage"
              caption
              :class="s.isSuccess ? 'q-mt-xs' : 'text-negative q-mt-xs'"
            >
              {{ s.statusMessage }}
            </q-item-label>
            <q-item-label v-if="s.trackId" caption class="q-mt-xs">
              Track ID: {{ s.trackId }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="column items-end q-gutter-xs">
              <q-badge :color="submissionColor(s.status)">{{ s.statusCode || s.status }}</q-badge>
              <q-btn
                v-if="props.invoiceId && (s.hasResponseXml || s.statusMessage)"
                flat
                dense
                no-caps
                color="grey-8"
                icon="article"
                label="Ver respuesta"
                :loading="loadingDetailId === s.id"
                @click="openResponseDetail(s)"
              />
              <q-btn
                v-if="canRefreshSubmission(s) && props.invoiceId"
                flat
                dense
                no-caps
                color="orange"
                icon="sync"
                label="Actualizar"
                :loading="refreshingId === s.id"
                @click="refreshSubmissionStatus(s)"
              />
              <q-btn
                v-if="s.isSuccess && props.invoiceId"
                flat
                dense
                no-caps
                color="primary"
                icon="download"
                :label="attachedButtonLabel(s)"
                :title="s.attachedDocumentFileName || 'Descargar AttachedDocument'"
                :loading="downloadingId === s.id"
                @click="downloadAttached(s)"
              />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <q-banner v-else dense rounded class="bg-grey-2 text-grey-8">
      Sin envíos registrados a la DIAN.
    </q-banner>

    <InvoicePdfDialog v-model="pdfDialogOpen" :invoice-id="props.invoiceId" />

    <q-dialog v-model="responseDialogOpen" persistent maximized>
      <q-card class="dian-response-dialog">
        <q-card-section class="row items-center q-pb-none">
          <div>
            <div class="text-h6">Respuesta DIAN — intento #{{ responseDetail?.submission?.attemptNumber }}</div>
            <div v-if="responseDetail?.submission" class="text-caption text-grey-7">
              Código {{ responseDetail.submission.statusCode || '—' }}
              · {{ submissionLabel(responseDetail.submission.status) }}
            </div>
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="dian-response-dialog__body">
          <q-banner
            v-if="responseDetail?.submission?.statusMessage"
            dense
            rounded
            :class="responseDetail.submission.isSuccess ? 'bg-green-1 text-green-10 q-mb-md' : 'bg-red-1 text-red-10 q-mb-md'"
          >
            {{ responseDetail.submission.statusMessage }}
          </q-banner>

          <div v-if="responseDetail?.validationErrors?.length" class="q-mb-md">
            <div class="text-subtitle2 q-mb-sm">Errores de validación</div>
            <q-list bordered separator dense class="rounded-borders">
              <q-item v-for="(err, idx) in responseDetail.validationErrors" :key="idx">
                <q-item-section avatar>
                  <q-badge v-if="err.code" color="negative" :label="err.code" />
                  <q-icon v-else name="error_outline" color="negative" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2">{{ err.message }}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <q-tabs v-model="responseTab" dense align="left" class="text-primary q-mb-sm">
            <q-tab name="response" label="Respuesta DIAN" />
            <q-tab v-if="responseDetail?.signedXml" name="signed" label="XML firmado" />
            <q-tab v-if="responseDetail?.requestXml" name="request" label="XML enviado" />
          </q-tabs>
          <q-separator />

          <q-tab-panels v-model="responseTab" animated class="dian-response-dialog__panels">
            <q-tab-panel name="response">
              <div class="row q-mb-sm">
                <q-btn
                  flat
                  dense
                  no-caps
                  icon="content_copy"
                  label="Copiar"
                  @click="copyText(responseDetail?.responseText)"
                />
              </div>
              <pre class="dian-response-dialog__code">{{ responseDetail?.responseText || 'Sin respuesta registrada.' }}</pre>
            </q-tab-panel>
            <q-tab-panel v-if="responseDetail?.signedXml" name="signed">
              <div class="row q-mb-sm">
                <q-btn
                  flat
                  dense
                  no-caps
                  icon="content_copy"
                  label="Copiar"
                  @click="copyText(responseDetail?.signedXml)"
                />
              </div>
              <pre class="dian-response-dialog__code">{{ responseDetail.signedXml }}</pre>
            </q-tab-panel>
            <q-tab-panel v-if="responseDetail?.requestXml" name="request">
              <div class="row q-mb-sm">
                <q-btn
                  flat
                  dense
                  no-caps
                  icon="content_copy"
                  label="Copiar"
                  @click="copyText(responseDetail?.requestXml)"
                />
              </div>
              <pre class="dian-response-dialog__code">{{ responseDetail.requestXml }}</pre>
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat icon="close" label="Cerrar" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useQuasar, copyToClipboard } from 'quasar'
import { api } from 'src/services/api.js'
import { formatDate } from 'src/utils/date-format.js'
import { dianEnvironmentLabel } from 'src/utils/dian-environment.js'
import InvoicePdfDialog from 'src/components/company/InvoicePdfDialog.vue'

const $q = useQuasar()

const props = defineProps({
  invoiceId: { type: String, default: '' },
  items: { type: Array, default: null },
})

const loading = ref(false)
const downloadingId = ref('')
const downloadingZip = ref(false)
const sendingToClient = ref(false)
const refreshingId = ref('')
const loadingDetailId = ref('')
const pdfDialogOpen = ref(false)
const responseDialogOpen = ref(false)
const responseDetail = ref(null)
const responseTab = ref('response')
const submissions = ref([])

const hasApprovedSubmission = computed(() =>
  submissions.value.some((s) => s.isSuccess)
)

const latestApprovedSubmission = computed(() => {
  const approved = submissions.value.filter((s) => s.isSuccess)
  if (!approved.length) return null
  return approved.reduce((best, s) => (s.attemptNumber > best.attemptNumber ? s : best), approved[0])
})

const latestZipName = computed(() => {
  const s = latestApprovedSubmission.value
  if (!s) return ''
  return s.clientPackageZipName
    || (s.attachedDocumentFileName
      ? `z${s.attachedDocumentFileName.slice(2).replace(/\.xml$/i, '')}.zip`
      : '')
})

const zipButtonLabel = computed(() => {
  const name = latestZipName.value
  if (!name) return 'Descargar ZIP'
  return truncateFileName(name)
})

watch(
  () => [props.invoiceId, props.items],
  async () => {
    if (props.items) {
      submissions.value = props.items
      return
    }
    if (!props.invoiceId) {
      submissions.value = []
      return
    }
    loading.value = true
    try {
      submissions.value = await api.ventas.submissions(props.invoiceId)
    } catch {
      submissions.value = []
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function submissionIcon(status) {
  return {
    pendiente: 'hourglass_empty',
    enviado: 'cloud_upload',
    aprobado: 'check_circle',
    rechazado: 'cancel',
    error: 'error',
  }[status] || 'info'
}

function submissionColor(status) {
  return {
    pendiente: 'orange',
    enviado: 'blue',
    aprobado: 'positive',
    rechazado: 'negative',
    error: 'negative',
  }[status] || 'grey'
}

function submissionLabel(status) {
  return {
    pendiente: 'Pendiente',
    enviado: 'Enviado',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    error: 'Error',
  }[status] || status
}

function truncateFileName(name, max = 26) {
  if (!name || name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

function attachedButtonLabel(submission) {
  const name = submission.attachedDocumentFileName
  if (!name) return 'AttachedDocument'
  return truncateFileName(name)
}

function canRefreshSubmission(submission) {
  return Boolean(submission.trackId) && !submission.isSuccess
}

async function openResponseDetail(submission) {
  if (!props.invoiceId) return
  loadingDetailId.value = submission.id
  try {
    responseDetail.value = await api.ventas.submissionDetail(props.invoiceId, submission.attemptNumber)
    responseTab.value = 'response'
    responseDialogOpen.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar la respuesta DIAN' })
  } finally {
    loadingDetailId.value = ''
  }
}

async function copyText(text) {
  if (!text) return
  try {
    await copyToClipboard(text)
    $q.notify({ type: 'positive', message: 'Copiado al portapapeles' })
  } catch {
    $q.notify({ type: 'warning', message: 'No se pudo copiar' })
  }
}

async function refreshSubmissionStatus(submission) {
  if (!props.invoiceId) return
  refreshingId.value = submission.id
  try {
    const result = await api.ventas.refreshSubmission(props.invoiceId, submission.attemptNumber)
    await refreshSubmissions()
    $q.notify({
      type: result.submission?.isSuccess ? 'positive' : result.submission?.status === 'enviado' ? 'info' : 'warning',
      message: result.message,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo actualizar el estado DIAN' })
  } finally {
    refreshingId.value = ''
  }
}

async function refreshSubmissions() {
  if (!props.invoiceId || props.items) return
  try {
    submissions.value = await api.ventas.submissions(props.invoiceId)
  } catch {
    /* keep current list */
  }
}

async function downloadAttached(submission) {
  if (!props.invoiceId) return
  downloadingId.value = submission.id
  try {
    const filename = await api.ventas.downloadAttachedDocument(props.invoiceId, {
      attempt: submission.attemptNumber,
    })
    await refreshSubmissions()
    $q.notify({ type: 'positive', message: `Descargado ${filename}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo generar AttachedDocument' })
  } finally {
    downloadingId.value = ''
  }
}

function openPdf() {
  if (!props.invoiceId) return
  pdfDialogOpen.value = true
}

async function downloadClientPackage() {
  if (!props.invoiceId) return
  downloadingZip.value = true
  try {
    const filename = await api.ventas.downloadClientPackage(props.invoiceId, {
      attempt: latestApprovedSubmission.value?.attemptNumber,
    })
    await refreshSubmissions()
    $q.notify({ type: 'positive', message: `Descargado ${filename}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo generar el ZIP' })
  } finally {
    downloadingZip.value = false
  }
}

function confirmSendToClient() {
  if (!props.invoiceId) return
  $q.dialog({
    title: 'Enviar factura al cliente',
    message: 'Se enviará un correo con el archivo ZIP (XML firmado + PDF) según normativa DIAN. ¿Continuar?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Enviar', color: 'primary' },
    persistent: true,
  }).onOk(async () => {
    sendingToClient.value = true
    try {
      const result = await api.ventas.sendInvoiceToClient(props.invoiceId, {
        attempt: latestApprovedSubmission.value?.attemptNumber,
      })
      $q.notify({
        type: 'positive',
        message: `Enviado a ${result.to} (${result.zipFileName})`,
      })
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message || 'No se pudo enviar al cliente' })
    } finally {
      sendingToClient.value = false
    }
  })
}
</script>
