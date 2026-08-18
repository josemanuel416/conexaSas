<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader title="Soporte y tickets" icon="support_agent" subtitle="Solicitudes de compañías: soporte, requerimientos y errores" />

    <div class="row q-col-gutter-md q-mb-md items-end">
      <div class="col-12 col-md-3">
        <q-select v-model="filterStatus" :options="statusOptions" label="Estado" outlined dense emit-value map-options clearable />
      </div>
      <div class="col-12 col-md-3">
        <q-select v-model="filterType" :options="typeOptions" label="Tipo" outlined dense emit-value map-options clearable />
      </div>
      <div class="col-auto">
        <q-btn color="primary" icon="refresh" label="Actualizar" flat @click="load" />
      </div>
    </div>

    <q-table :rows="tickets" :columns="columns" row-key="id" flat bordered class="company-data-table company-page-card" :loading="loading" @row-click="(_, row) => openTicket(row)">
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
      <template #body-cell-updatedAt="props">
        <q-td :props="props">{{ formatDate(props.row.updatedAt) }}</q-td>
      </template>
    </q-table>

    <q-dialog v-model="detailDialog" maximized>
      <q-card v-if="selected">
        <q-toolbar class="bg-primary text-white">
          <q-toolbar-title>#{{ selected.id }} — {{ selected.subject }}</q-toolbar-title>
          <q-btn flat round icon="close" v-close-popup />
        </q-toolbar>
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-3"><strong>Compañía:</strong> {{ selected.companyName }}</div>
            <div class="col-12 col-md-3"><strong>Tipo:</strong> {{ typeLabel(selected.ticketType) }}</div>
            <div class="col-12 col-md-3">
              <q-select v-model="ticketStatus" :options="statusOptions" label="Estado" outlined dense emit-value map-options @update:model-value="updateStatus" />
            </div>
            <div class="col-12 col-md-3">
              <q-select v-model="ticketPriority" :options="priorityOptions" label="Prioridad" outlined dense emit-value map-options @update:model-value="updatePriority" />
            </div>
          </div>

          <div class="support-thread q-mb-md">
            <div v-for="msg in selected.messages" :key="msg.id" class="support-msg" :class="{ 'support-msg--staff': msg.isStaffReply }">
              <div class="support-msg__head">
                <strong>{{ msg.authorName }}</strong>
                <span class="text-caption text-grey-7">{{ formatDate(msg.createdAt) }}</span>
                <q-badge v-if="msg.isStaffReply" color="primary" class="q-ml-sm">ConexaSoft</q-badge>
              </div>
              <div class="support-msg__body">{{ msg.body }}</div>
            </div>
          </div>

          <q-input v-model="replyBody" type="textarea" outlined autogrow label="Responder al cliente" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cerrar" v-close-popup />
          <q-btn color="primary" icon="send" label="Enviar respuesta" unelevated :loading="replying" @click="sendReply" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()
const loading = ref(false)
const tickets = ref([])
const filterStatus = ref(null)
const filterType = ref(null)
const detailDialog = ref(false)
const selected = ref(null)
const replyBody = ref('')
const replying = ref(false)
const ticketStatus = ref('abierto')
const ticketPriority = ref('media')

const statusOptions = [
  { label: 'Abierto', value: 'abierto' },
  { label: 'En proceso', value: 'en_proceso' },
  { label: 'Resuelto', value: 'resuelto' },
  { label: 'Cerrado', value: 'cerrado' },
]
const typeOptions = [
  { label: 'Soporte', value: 'soporte' },
  { label: 'Requerimiento', value: 'requerimiento' },
  { label: 'Error', value: 'error' },
]
const priorityOptions = [
  { label: 'Baja', value: 'baja' },
  { label: 'Media', value: 'media' },
  { label: 'Alta', value: 'alta' },
]

const columns = [
  { name: 'id', label: '#', field: 'id', align: 'left' },
  { name: 'companyName', label: 'Compañía', field: 'companyName', align: 'left' },
  { name: 'ticketType', label: 'Tipo', field: 'ticketType', align: 'center' },
  { name: 'subject', label: 'Asunto', field: 'subject', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
  { name: 'createdByName', label: 'Usuario', field: 'createdByName', align: 'left' },
  { name: 'updatedAt', label: 'Actualizado', field: 'updatedAt', align: 'left' },
]

function formatDate(v) {
  return v ? new Date(v).toLocaleString('es-CO') : '—'
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

async function load() {
  loading.value = true
  try {
    const params = {}
    if (filterStatus.value) params.status = filterStatus.value
    if (filterType.value) params.ticketType = filterType.value
    tickets.value = await api.admin.supportTickets(params)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

async function openTicket(row) {
  try {
    selected.value = await api.admin.supportTicket(row.id)
    ticketStatus.value = selected.value.status
    ticketPriority.value = selected.value.priority
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
    selected.value = await api.admin.replySupportTicket(selected.value.id, {
      body: replyBody.value,
      status: ticketStatus.value === 'abierto' ? 'en_proceso' : ticketStatus.value,
    })
    replyBody.value = ''
    await load()
    $q.notify({ type: 'positive', message: 'Respuesta enviada' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    replying.value = false
  }
}

async function updateStatus(val) {
  try {
    await api.admin.updateSupportTicket(selected.value.id, { status: val })
    selected.value.status = val
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

async function updatePriority(val) {
  try {
    await api.admin.updateSupportTicket(selected.value.id, { priority: val })
    selected.value.priority = val
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

watch([filterStatus, filterType], load)
onMounted(load)
</script>

<style scoped>
.support-thread {
  max-height: 360px;
  overflow-y: auto;
}
.support-msg {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}
.support-msg--staff {
  background: #e3f2fd;
  border-left: 4px solid #1976d2;
}
.support-msg__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.support-msg__body {
  white-space: pre-wrap;
}
</style>
