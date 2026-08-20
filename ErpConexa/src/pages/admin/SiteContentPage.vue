<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader title="Sitio web" icon="language" subtitle="Misión, visión, beneficios y datos de contacto públicos" />

    <div class="company-page-card">
      <q-form @submit.prevent="save" class="q-gutter-md">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <q-input v-model="form.heroTitle" label="Título principal" outlined dense />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.heroSubtitle" label="Subtítulo" outlined dense />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.mission" label="Misión" type="textarea" outlined autogrow />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.vision" label="Visión" type="textarea" outlined autogrow />
          </div>
        </div>

        <div class="text-subtitle1 q-mt-md">Datos de contacto</div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-3">
            <q-input v-model="form.contactEmail" label="Email" outlined dense />
          </div>
          <div class="col-12 col-md-3">
            <q-input v-model="form.contactPhone" label="Teléfono" outlined dense />
          </div>
          <div class="col-12 col-md-3">
            <q-input v-model="form.contactWhatsapp" label="WhatsApp" outlined dense />
          </div>
          <div class="col-12 col-md-3">
            <q-input v-model="form.contactAddress" label="Dirección / ciudad" outlined dense />
          </div>
        </div>

        <div class="text-subtitle1 q-mt-md">Beneficios del sistema</div>
        <div v-for="(b, idx) in form.benefits" :key="idx" class="row q-col-gutter-sm q-mb-sm items-center">
          <div class="col-12 col-md-2">
            <q-input v-model="b.icon" label="Icono" outlined dense hint="Material icon" />
          </div>
          <div class="col-12 col-md-3">
            <q-input v-model="b.title" label="Título" outlined dense />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="b.description" label="Descripción" outlined dense />
          </div>
          <div class="col-auto">
            <q-btn flat round icon="delete" color="negative" @click="form.benefits.splice(idx, 1)" />
          </div>
        </div>
        <q-btn flat icon="add" label="Agregar beneficio" color="primary" @click="form.benefits.push({ icon: 'check_circle', title: '', description: '' })" />

        <div class="row justify-end q-mt-lg">
          <q-btn type="submit" color="primary" icon="save" label="Guardar cambios" unelevated :loading="saving" />
        </div>
      </q-form>
    </div>

    <div class="company-page-card q-mt-lg">
      <div class="text-subtitle1 q-mb-md">Mensajes de contacto (landing)</div>
      <q-table :rows="contactMessages" :columns="contactColumns" row-key="id" flat bordered class="company-data-table" :loading="loadingContacts">
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge :color="contactStatusColor(props.row.status)">{{ props.row.status }}</q-badge>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense icon="visibility" @click="viewContact(props.row)" />
          </q-td>
        </template>
      </q-table>
    </div>

    <q-dialog v-model="contactDialog">
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">Mensaje de contacto</div>
        </q-card-section>
        <q-card-section v-if="selectedContact">
          <div><strong>{{ selectedContact.fullName }}</strong> — {{ selectedContact.email }}</div>
          <div v-if="selectedContact.phone" class="text-caption">{{ selectedContact.phone }}</div>
          <div v-if="selectedContact.companyName" class="q-mt-sm">Empresa: {{ selectedContact.companyName }}</div>
          <p class="q-mt-md">{{ selectedContact.message }}</p>
          <q-select v-model="contactStatus" :options="contactStatusOptions" label="Estado" outlined dense emit-value map-options class="q-mt-md" />
          <q-input v-model="contactNotes" label="Notas internas" type="textarea" outlined autogrow class="q-mt-sm" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cerrar" v-close-popup />
          <q-btn color="primary" label="Guardar" unelevated :loading="savingContact" @click="saveContactStatus" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import { formatDateTime } from 'src/utils/date-format.js'

const $q = useQuasar()
const saving = ref(false)
const loadingContacts = ref(false)
const contactMessages = ref([])
const contactDialog = ref(false)
const selectedContact = ref(null)
const contactStatus = ref('leido')
const contactNotes = ref('')
const savingContact = ref(false)

const form = reactive({
  heroTitle: '',
  heroSubtitle: '',
  mission: '',
  vision: '',
  benefits: [],
  contactEmail: '',
  contactPhone: '',
  contactWhatsapp: '',
  contactAddress: '',
})

const contactColumns = [
  { name: 'createdAt', label: 'Fecha', field: 'createdAt', align: 'left', format: (v) => formatDateTime(v) },
  { name: 'fullName', label: 'Nombre', field: 'fullName', align: 'left' },
  { name: 'email', label: 'Email', field: 'email', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const contactStatusOptions = [
  { label: 'Nuevo', value: 'nuevo' },
  { label: 'Leído', value: 'leido' },
  { label: 'Respondido', value: 'respondido' },
]

function contactStatusColor(s) {
  return { nuevo: 'orange', leido: 'blue-grey', respondido: 'positive' }[s] || 'grey'
}

async function load() {
  const data = await api.admin.siteContent()
  Object.assign(form, {
    heroTitle: data.heroTitle || '',
    heroSubtitle: data.heroSubtitle || '',
    mission: data.mission || '',
    vision: data.vision || '',
    benefits: [...(data.benefits || [])],
    contactEmail: data.contactEmail || '',
    contactPhone: data.contactPhone || '',
    contactWhatsapp: data.contactWhatsapp || '',
    contactAddress: data.contactAddress || '',
  })
}

async function loadContacts() {
  loadingContacts.value = true
  try {
    contactMessages.value = await api.admin.contactMessages()
  } finally {
    loadingContacts.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await api.admin.updateSiteContent({
      heroTitle: form.heroTitle,
      heroSubtitle: form.heroSubtitle,
      mission: form.mission,
      vision: form.vision,
      benefits: form.benefits,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      contactWhatsapp: form.contactWhatsapp,
      contactAddress: form.contactAddress,
    })
    $q.notify({ type: 'positive', message: 'Sitio actualizado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function viewContact(row) {
  selectedContact.value = row
  contactStatus.value = row.status
  contactNotes.value = row.adminNotes || ''
  contactDialog.value = true
}

async function saveContactStatus() {
  savingContact.value = true
  try {
    await api.admin.updateContactMessage(selectedContact.value.id, {
      status: contactStatus.value,
      adminNotes: contactNotes.value,
    })
    contactDialog.value = false
    await loadContacts()
    $q.notify({ type: 'positive', message: 'Mensaje actualizado' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    savingContact.value = false
  }
}

onMounted(async () => {
  try {
    await Promise.all([load(), loadContacts()])
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
})
</script>
