<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      title="Soporte ConexaSoft"
      icon="support_agent"
      subtitle="Solicite soporte, requerimientos o reporte de errores"
    />

    <div class="row justify-end q-mb-md">
      <q-btn color="primary" icon="add" label="Nueva solicitud" unelevated @click="openCreate" />
    </div>

    <q-table :rows="tickets" :columns="columns" row-key="id" flat bordered class="company-data-table company-page-card" :loading="loading">
      <template #body-cell-ticketType="props">
        <q-td :props="props">
          <q-badge :color="typeColor(props.row.ticketType)">{{ typeLabel(props.row.ticketType) }}</q-badge>
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge :color="statusColor(props.row.status)">{{ statusLabel(props.row.status) }}</q-badge>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat dense icon="forum" color="primary" @click="openDetail(props.row)">
            <q-tooltip>Ver conversación</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <CompanyFormDialog v-model="createDialog" title="Nueva solicitud" icon="add_comment">
      <q-select v-model="createForm.ticketType" :options="typeOptions" label="Tipo *" outlined dense emit-value map-options class="q-mb-md" />
      <q-input v-model="createForm.subject" label="Asunto *" outlined dense class="q-mb-md" />
      <q-input v-model="createForm.description" label="Descripción *" type="textarea" outlined autogrow class="q-mb-md" />
      <q-select v-model="createForm.priority" :options="priorityOptions" label="Prioridad" outlined dense emit-value map-options />
      <template #actions>
        <q-btn flat icon="close" label="Cancelar" v-close-popup />
        <q-btn color="primary" icon="send" label="Enviar" unelevated :loading="saving" @click="createTicket" />
      </template>
    </CompanyFormDialog>

    <CompanyFormDialog v-model="detailDialog" :title="selected?.subject || 'Ticket'" icon="forum" wide>
      <div v-if="selected" class="support-thread q-mb-md">
        <div v-for="msg in selected.messages" :key="msg.id" class="support-msg" :class="{ 'support-msg--staff': msg.isStaffReply }">
          <div class="support-msg__head">
            <strong>{{ msg.authorName }}</strong>
            <span class="text-caption text-grey-7">{{ formatDate(msg.createdAt) }}</span>
            <q-badge v-if="msg.isStaffReply" color="primary" class="q-ml-sm">ConexaSoft</q-badge>
          </div>
          <div class="support-msg__body">{{ msg.body }}</div>
        </div>
      </div>
      <q-input
        v-if="selected && selected.status !== 'cerrado'"
        v-model="replyBody"
        type="textarea"
        outlined
        autogrow
        label="Agregar mensaje"
      />
      <template #actions>
        <q-btn flat icon="close" label="Cerrar" v-close-popup />
        <q-btn
          v-if="selected && selected.status !== 'cerrado'"
          color="primary"
          icon="send"
          label="Enviar"
          unelevated
          :loading="replying"
          @click="sendReply"
        />
      </template>
    </CompanyFormDialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import CompanyFormDialog from 'src/components/company/CompanyFormDialog.vue'
import { formatDateTime } from 'src/utils/date-format.js'

const $q = useQuasar()
const loading = ref(false)
const saving = ref(false)
const replying = ref(false)
const tickets = ref([])
const createDialog = ref(false)
const detailDialog = ref(false)
const selected = ref(null)
const replyBody = ref('')

const createForm = reactive({
  ticketType: 'soporte',
  subject: '',
  description: '',
  priority: 'media',
})

const typeOptions = [
  { label: 'Soporte', value: 'soporte' },
  { label: 'Requerimiento', value: 'requerimiento' },
  { label: 'Reporte de error', value: 'error' },
]
const priorityOptions = [
  { label: 'Baja', value: 'baja' },
  { label: 'Media', value: 'media' },
  { label: 'Alta', value: 'alta' },
]

const columns = [
  { name: 'actions', label: '', field: 'actions', align: 'left', style: 'width: 60px' },
  { name: 'id', label: '#', field: 'id', align: 'left' },
  { name: 'ticketType', label: 'Tipo', field: 'ticketType', align: 'center' },
  { name: 'subject', label: 'Asunto', field: 'subject', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
  { name: 'updatedAt', label: 'Actualizado', field: 'updatedAt', align: 'left', format: (v) => formatDateTime(v) },
]

function formatDate(v) {
  return formatDateTime(v)
}
function typeLabel(t) {
  return { soporte: 'Soporte', requerimiento: 'Requerimiento', error: 'Error' }[t] || t
}
function typeColor(t) {
  return { soporte: 'blue', requerimiento: 'purple', error: 'negative' }[t] || 'grey'
}
function statusLabel(s) {
  return { abierto: 'Abierto', en_proceso: 'En proceso', resuelto: 'Resuelto', cerrado: 'Cerrado' }[s] || s
}
function statusColor(s) {
  return { abierto: 'orange', en_proceso: 'blue', resuelto: 'positive', cerrado: 'grey' }[s] || 'grey'
}

function openCreate() {
  Object.assign(createForm, { ticketType: 'soporte', subject: '', description: '', priority: 'media' })
  createDialog.value = true
}

async function load() {
  loading.value = true
  try {
    tickets.value = await api.support.tickets()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

async function createTicket() {
  if (!createForm.subject.trim() || !createForm.description.trim()) {
    $q.notify({ type: 'warning', message: 'Asunto y descripción son requeridos' })
    return
  }
  saving.value = true
  try {
    await api.support.createTicket(createForm)
    createDialog.value = false
    await load()
    $q.notify({ type: 'positive', message: 'Solicitud enviada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function openDetail(row) {
  try {
    selected.value = await api.support.ticket(row.id)
    replyBody.value = ''
    detailDialog.value = true
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function sendReply() {
  if (!replyBody.value.trim()) return
  replying.value = true
  try {
    selected.value = await api.support.addMessage(selected.value.id, replyBody.value)
    replyBody.value = ''
    await load()
    $q.notify({ type: 'positive', message: 'Mensaje enviado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    replying.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.support-thread {
  max-height: 320px;
  overflow-y: auto;
}
.support-msg {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}
.support-msg--staff {
  background: #e8f5e9;
  border-left: 4px solid #2e7d32;
}
.support-msg__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.support-msg__body {
  white-space: pre-wrap;
}
</style>
