<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader :title="pageMeta.title" :icon="pageMeta.icon" />

    <div class="company-page-card">
      <template v-if="tab === 'agenda'">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-auto">
            <q-input v-model="selectedDate" type="date" label="Fecha" outlined dense @update:model-value="loadAppointments" />
          </div>
          <div class="col-auto">
            <q-select v-model="filterProf" :options="profOptions" label="Profesional" outlined dense clearable
              emit-value map-options style="min-width:200px" @update:model-value="loadAppointments" />
          </div>
          <div class="col-auto">
            <q-btn color="primary" icon="add" label="Nueva cita" @click="openAppointmentDialog()" unelevated />
          </div>
        </div>

        <q-table
          :expanded="expandedAppts"
          class="company-data-table"
          :rows="appointments"
          :columns="apptColumns"
          row-key="id"
          flat
          bordered
          :loading="loadingAppt"
          @update:expanded="setExpandedAppts"
          @row-click="(_, row) => toggleApptExpand(row.id)"
        >
          <template #body="props">
            <q-tr :props="props" class="cursor-pointer">
              <q-td key="actions" :props="props" class="company-data-table__actions" @click.stop>
                <q-btn
                  v-if="props.row.status === 'programada'"
                  flat
                  dense
                  round
                  size="sm"
                  icon="check"
                  color="positive"
                  @click="completeAppt(props.row)"
                >
                  <q-tooltip>Cumplida</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="props.row.status === 'programada'"
                  flat
                  dense
                  round
                  size="sm"
                  icon="event_repeat"
                  color="orange"
                  @click="openReschedule(props.row)"
                >
                  <q-tooltip>Reagendar</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="props.row.status === 'cumplida'"
                  flat
                  dense
                  round
                  size="sm"
                  icon="receipt"
                  color="primary"
                  @click="invoiceAppt(props.row)"
                >
                  <q-tooltip>Facturar</q-tooltip>
                </q-btn>
              </q-td>
              <q-td key="expand" auto-width class="company-data-table__expand-toggle" @click.stop="toggleApptExpand(props.row.id)">
                <q-btn flat dense round size="sm" :icon="props.expand ? 'expand_less' : 'expand_more'" color="grey-7" />
              </q-td>
              <q-td key="startTime" :props="props">{{ props.row.startTime }}</q-td>
              <q-td key="professionalName" :props="props" class="company-data-table__wrap">
                <div class="company-data-table__two-lines">{{ props.row.professionalName || '—' }}</div>
              </q-td>
              <q-td key="clientName" :props="props" class="company-data-table__wrap">
                <div class="company-data-table__two-lines">{{ props.row.clientName || '—' }}</div>
              </q-td>
              <q-td key="serviceDesc" :props="props" class="company-data-table__wrap">
                <div class="company-data-table__two-lines">{{ props.row.serviceDesc || '—' }}</div>
              </q-td>
              <q-td key="finalPrice" :props="props">${{ formatMoney(props.row.finalPrice) }}</q-td>
              <q-td key="status" :props="props">
                <q-badge :color="statusColor(props.row.status)">{{ statusLabel(props.row.status) }}</q-badge>
              </q-td>
            </q-tr>
            <q-tr v-show="props.expand" :props="props" class="company-data-table__expand">
              <q-td colspan="100%">
                <div class="company-data-table__expand-inner">
                  <AppointmentExpandPanel
                    :row="props.row"
                    :status-color="statusColor"
                    :status-label="statusLabel"
                  />
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'professionals'">
        <q-btn color="primary" icon="add" label="Nuevo" class="q-mb-md" unelevated @click="openCrud('prof')" />
        <q-table :rows="professionals" :columns="profColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openCrud('prof', props.row)" />
            </q-td>
          </template>
          <template #body-cell-fullName="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.fullName || '—' }}</div>
            </q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'services'">
        <q-btn color="primary" icon="add" label="Nuevo" class="q-mb-md" unelevated @click="openCrud('svc')" />
        <q-table :rows="services" :columns="svcColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openCrud('svc', props.row)" />
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

      <template v-else-if="tab === 'clients'">
        <q-btn color="primary" icon="add" label="Nuevo" class="q-mb-md" unelevated @click="openCrud('cli')" />
        <q-table :rows="clients" :columns="cliColumns" row-key="id" flat bordered class="company-data-table">
          <template #body-cell-actions="props">
            <q-td :props="props" class="company-data-table__actions">
              <q-btn flat dense round size="sm" icon="edit" color="primary" @click="openCrud('cli', props.row)" />
            </q-td>
          </template>
          <template #body-cell-fullName="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.fullName || '—' }}</div>
            </q-td>
          </template>
        </q-table>
      </template>

      <template v-else-if="tab === 'models'">
        <q-btn color="primary" icon="add" label="Nuevo modelo" class="q-mb-md" unelevated @click="openModelDialog" />
        <q-card v-for="m in scheduleModels" :key="m.id" flat bordered class="q-mb-sm">
          <q-card-section>
            <div class="text-subtitle1">{{ m.name }} — {{ m.professionalName }}</div>
            <div class="text-caption">Turnos de {{ m.slotDurationMinutes }} min</div>
            <q-chip v-for="p in m.programming" :key="p.dayOfWeek" size="sm" class="q-mt-xs">
              {{ p.dayName }} {{ p.startTime }}-{{ p.endTime }}
            </q-chip>
          </q-card-section>
        </q-card>
      </template>

      <template v-else-if="tab === 'billing'">
        <div class="row q-col-gutter-md q-mb-md items-center">
          <div class="col-auto">
            <q-input v-model="billingDate" type="date" label="Fecha" outlined dense @update:model-value="loadBilling" />
          </div>
          <div class="col-auto" v-if="billingSummary">
            <q-chip color="primary" text-color="white">
              {{ billingSummary.count }} tickets — Total: ${{ formatMoney(billingSummary.total) }}
            </q-chip>
          </div>
        </div>
        <q-table :rows="dailyTickets" :columns="ticketColumns" row-key="id" flat bordered :loading="loadingBilling" class="company-data-table">
          <template #body-cell-clientName="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.clientName || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-serviceDesc="props">
            <q-td :props="props" class="company-data-table__wrap">
              <div class="company-data-table__two-lines">{{ props.row.serviceDesc || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-total="props">
            <q-td :props="props">${{ formatMoney(props.row.total) }}</q-td>
          </template>
        </q-table>
      </template>
    </div>

    <!-- Dialog cita -->
    <q-dialog v-model="apptDialog" persistent>
      <q-card style="min-width:560px; max-width:720px">
        <q-card-section>
          <div class="text-h6">Nueva cita</div>
          <div class="text-caption text-grey-7">Seleccione profesional y fecha para ver los turnos del modelo de agenda</div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-select
                v-model="apptForm.professionalId"
                :options="profOptions"
                label="Profesional *"
                outlined dense emit-value map-options
                @update:model-value="onProfessionalOrDateChange"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="apptForm.appointmentDate"
                type="date"
                label="Fecha *"
                outlined dense
                @update:model-value="onProfessionalOrDateChange"
              />
            </div>
          </div>

          <q-linear-progress v-if="loadingSlots" indeterminate color="teal-8" class="q-my-xs" />

          <q-banner v-if="slotProgramming.length" dense class="bg-teal-1 text-teal-10 rounded-borders">
            <template #avatar><q-icon name="schedule" color="teal-8" /></template>
            <div class="text-weight-medium">{{ slotProgramming[0].modelName }} — {{ slotProgramming[0].dayName }}</div>
            <div class="text-caption">
              Programación: {{ slotProgramming[0].startTime }} a {{ slotProgramming[0].endTime }}
              · Turnos de {{ slotProgramming[0].slotDurationMinutes }} min
            </div>
          </q-banner>

          <div v-if="apptForm.professionalId && apptForm.appointmentDate">
            <div class="text-subtitle2 q-mb-sm">Turnos disponibles *</div>
            <div v-if="slots.length" class="row q-gutter-sm">
              <q-btn
                v-for="slot in slots"
                :key="slot.startTime"
                :label="slotLabel(slot)"
                :color="apptForm.selectedSlot === slot.startTime ? 'teal-8' : 'grey-3'"
                :text-color="apptForm.selectedSlot === slot.startTime ? 'white' : 'dark'"
                :outline="apptForm.selectedSlot !== slot.startTime"
                unelevated
                no-caps
                @click="selectSlot(slot)"
              />
            </div>
            <q-banner v-else-if="!loadingSlots" dense class="bg-orange-1 text-orange-10 rounded-borders">
              {{ slotsMessage || 'No hay turnos disponibles para esta fecha' }}
            </q-banner>
          </div>

          <q-separator class="q-my-sm" />

          <q-select v-model="apptForm.clientId" :options="clientOptions" label="Cliente *" outlined dense emit-value map-options />
          <q-select
            v-model="apptForm.serviceId"
            :options="serviceOptions"
            label="Servicio *"
            outlined dense emit-value map-options
            @update:model-value="onServicePick"
          />
          <q-input v-model.number="apptForm.basePrice" label="Valor base" outlined dense readonly />
          <q-expansion-item v-if="canApplyDiscounts" dense label="Descuentos y ajustes" header-class="text-grey-7">
            <div class="q-gutter-sm q-pt-sm">
              <q-input v-model.number="apptForm.overridePrice" label="Valor final (si es mayor al base)" type="number" outlined dense />
              <q-input v-model.number="apptForm.discountPercent" label="Descuento %" type="number" outlined dense />
              <q-input v-model.number="apptForm.discountAmount" label="Descuento $" type="number" outlined dense />
            </div>
          </q-expansion-item>
          <q-input v-model="apptForm.notes" label="Notas" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn
            color="teal-8"
            label="Agendar"
            :loading="saving"
            :disable="!canSaveAppointment"
            @click="saveAppointment"
            unelevated
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog CRUD genérico -->
    <q-dialog v-model="crudDialog" persistent>
      <q-card style="min-width:400px">
        <q-card-section><div class="text-h6">{{ crudTitle }}</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <template v-if="crudType === 'prof'">
            <q-input v-model="crudForm.documentNumber" label="Documento *" outlined dense />
            <q-input v-model="crudForm.firstName" label="Nombre *" outlined dense />
            <q-input v-model="crudForm.lastName" label="Apellidos *" outlined dense />
            <q-input v-model="crudForm.phone" label="Teléfono" outlined dense />
            <q-input v-model="crudForm.specialty" label="Especialidad" outlined dense />
          </template>
          <template v-if="crudType === 'svc'">
            <q-input
              v-if="crudEditId"
              v-model="crudForm.code"
              label="Código"
              outlined
              dense
              readonly
            />
            <q-banner v-else-if="nextServicePreview" dense rounded class="bg-teal-1 text-teal-10 q-mb-sm">
              Código asignado: <strong>{{ nextServicePreview }}</strong>
            </q-banner>
            <q-input v-model="crudForm.description" label="Descripción *" outlined dense />
            <MoneyInput v-model="crudForm.basePrice" label="Valor *" />
            <q-input v-model.number="crudForm.durationMinutes" label="Duración (min)" type="number" outlined dense />
          </template>
          <template v-if="crudType === 'cli'">
            <q-input v-model="crudForm.documentNumber" label="Documento *" outlined dense />
            <q-input v-model="crudForm.firstName" label="Nombre *" outlined dense />
            <q-input v-model="crudForm.lastName" label="Apellidos *" outlined dense />
            <q-input v-model="crudForm.phone" label="Teléfono" outlined dense />
          </template>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="teal-8" label="Guardar" :loading="saving" @click="saveCrud" unelevated />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog modelo agenda -->
    <q-dialog v-model="modelDialog" persistent>
      <q-card style="min-width:500px">
        <q-card-section><div class="text-h6">Nuevo modelo de agenda</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-select v-model="modelForm.professionalId" :options="profOptions" label="Profesional *" outlined dense emit-value map-options />
          <q-input v-model="modelForm.name" label="Nombre modelo (ej: Modelo A) *" outlined dense />
          <q-input v-model.number="modelForm.slotDurationMinutes" label="Turnos (minutos)" type="number" outlined dense />
          <div class="text-caption q-mt-sm text-weight-medium">Programación (desde / hasta por día)</div>
          <div v-for="(p, i) in modelForm.programming" :key="i" class="row q-col-gutter-xs">
            <div class="col-3">
              <q-select v-model="p.dayOfWeek" :options="dayOptions" label="Día" dense outlined emit-value map-options />
            </div>
            <div class="col-4"><q-input v-model="p.startTime" label="Desde" type="time" dense outlined /></div>
            <div class="col-4"><q-input v-model="p.endTime" label="Hasta" type="time" dense outlined /></div>
            <div class="col-1"><q-btn flat dense icon="delete" color="negative" @click="modelForm.programming.splice(i,1)" /></div>
          </div>
          <div class="row q-gutter-sm">
            <q-btn flat icon="add" label="Añadir día" @click="modelForm.programming.push({ dayOfWeek: 1, startTime: '08:00', endTime: '17:00' })" />
            <q-btn flat icon="date_range" label="Lun–Vie" @click="addWeekdays" />
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="teal-8" label="Crear" :loading="saving" @click="saveModel" unelevated />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Dialog reagendar -->
    <q-dialog v-model="rescheduleDialog" persistent>
      <q-card style="min-width:480px">
        <q-card-section><div class="text-h6">Reagendar cita</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="rescheduleForm.appointmentDate" type="date" label="Nueva fecha" outlined dense @update:model-value="loadRescheduleSlots" />
          <q-linear-progress v-if="loadingRescheduleSlots" indeterminate color="teal-8" />
          <q-banner v-if="rescheduleProgramming.length" dense class="bg-teal-1 text-teal-10 rounded-borders">
            {{ rescheduleProgramming[0].dayName }}: {{ rescheduleProgramming[0].startTime }} a {{ rescheduleProgramming[0].endTime }}
          </q-banner>
          <div v-if="rescheduleSlots.length" class="row q-gutter-sm">
            <q-btn
              v-for="slot in rescheduleSlots"
              :key="slot.startTime"
              :label="slotLabel(slot)"
              :color="rescheduleForm.startTime === slot.startTime ? 'teal-8' : 'grey-3'"
              :text-color="rescheduleForm.startTime === slot.startTime ? 'white' : 'dark'"
              :outline="rescheduleForm.startTime !== slot.startTime"
              unelevated no-caps
              @click="rescheduleForm.startTime = slot.startTime"
            />
          </div>
          <q-banner v-else-if="rescheduleForm.appointmentDate && !loadingRescheduleSlots" dense class="bg-orange-1 text-orange-10 rounded-borders">
            {{ rescheduleSlotsMessage }}
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="teal-8" label="Reagendar" :loading="saving" :disable="!rescheduleForm.startTime" @click="saveReschedule" unelevated />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { hasPermission } from 'src/utils/auth.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import AppointmentExpandPanel from 'src/components/company/AppointmentExpandPanel.vue'
import MoneyInput from 'src/components/company/MoneyInput.vue'
import { useCompanyPageTab } from 'src/composables/useCompanyPageTab.js'

const $q = useQuasar()
const validTabs = ['agenda', 'professionals', 'services', 'clients', 'models', 'billing']
const tab = useCompanyPageTab(validTabs, 'agenda', (value) => {
  if (value === 'billing') loadBilling()
})

const pageMetaMap = {
  agenda: { title: 'Agenda', icon: 'calendar_month' },
  professionals: { title: 'Profesionales', icon: 'medical_services' },
  services: { title: 'Servicios', icon: 'list_alt' },
  clients: { title: 'Clientes', icon: 'people' },
  models: { title: 'Modelos', icon: 'schedule' },
  billing: { title: 'Facturado', icon: 'receipt' },
}
const pageMeta = computed(() => pageMetaMap[tab.value] || pageMetaMap.agenda)

const expandedAppts = ref([])
function toggleApptExpand(id) {
  const idx = expandedAppts.value.indexOf(id)
  if (idx >= 0) expandedAppts.value.splice(idx, 1)
  else expandedAppts.value.push(id)
}
function setExpandedAppts(val) {
  expandedAppts.value = val
}
const saving = ref(false)

const selectedDate = ref(new Date().toISOString().slice(0, 10))
const billingDate = ref(new Date().toISOString().slice(0, 10))
const filterProf = ref(null)

const professionals = ref([])
const services = ref([])
const clients = ref([])
const scheduleModels = ref([])
const appointments = ref([])
const dailyTickets = ref([])
const billingSummary = ref(null)
const slots = ref([])
const slotsMessage = ref('')
const slotProgramming = ref([])
const loadingSlots = ref(false)

const rescheduleSlots = ref([])
const rescheduleSlotsMessage = ref('')
const rescheduleProgramming = ref([])
const loadingRescheduleSlots = ref(false)
const rescheduleProfessionalId = ref(null)

const loadingAppt = ref(false)
const loadingBilling = ref(false)

const apptDialog = ref(false)
const crudDialog = ref(false)
const nextServicePreview = ref('')
const modelDialog = ref(false)
const rescheduleDialog = ref(false)

const crudType = ref('')
const crudEditId = ref(null)
const rescheduleId = ref(null)

const apptForm = reactive({
  professionalId: null, clientId: null, serviceId: null,
  appointmentDate: '', selectedSlot: null, basePrice: 0,
  overridePrice: null, discountPercent: 0, discountAmount: 0, notes: '',
})

const crudForm = reactive({})
const modelForm = reactive({
  professionalId: null, name: '', slotDurationMinutes: 30,
  programming: [{ dayOfWeek: 1, startTime: '14:00', endTime: '17:00' }],
})
const rescheduleForm = reactive({ appointmentDate: '', startTime: '' })

const dayOptions = [
  { label: 'Lunes', value: 1 }, { label: 'Martes', value: 2 }, { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 }, { label: 'Viernes', value: 5 }, { label: 'Sábado', value: 6 }, { label: 'Domingo', value: 7 },
]

const profOptions = computed(() => professionals.value.filter(p => p.isActive).map(p => ({ label: p.fullName, value: p.id })))
const clientOptions = computed(() => clients.value.filter(c => c.isActive).map(c => ({ label: c.fullName, value: c.id })))
const serviceOptions = computed(() => services.value.filter(s => s.isActive).map(s => ({ label: `${s.code} - ${s.description}`, value: s.id })))
const canApplyDiscounts = computed(() => hasPermission('agenda_citas.descuento') || hasPermission('agenda_citas.cambiar_valor'))
const canSaveAppointment = computed(() =>
  !!apptForm.professionalId && !!apptForm.clientId && !!apptForm.serviceId
  && !!apptForm.appointmentDate && !!apptForm.selectedSlot
)

const crudTitle = computed(() => {
  const t = { prof: 'Profesional', svc: 'Servicio', cli: 'Cliente' }
  return (crudEditId.value ? 'Editar ' : 'Nuevo ') + (t[crudType.value] || '')
})

const apptColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 120px' },
  { name: 'expand', label: '', field: 'expand', align: 'center', style: 'width: 36px' },
  { name: 'startTime', label: 'Hora', field: 'startTime', style: 'width: 80px' },
  { name: 'professionalName', label: 'Profesional', field: 'professionalName', style: 'max-width: 160px' },
  { name: 'clientName', label: 'Cliente', field: 'clientName', style: 'max-width: 160px' },
  { name: 'serviceDesc', label: 'Servicio', field: 'serviceDesc', style: 'max-width: 180px' },
  { name: 'finalPrice', label: 'Valor', field: 'finalPrice', align: 'right', style: 'width: 100px' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', style: 'width: 100px' },
]
const profColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'documentNumber', label: 'Documento', field: 'documentNumber', style: 'width: 120px' },
  { name: 'fullName', label: 'Nombre', field: 'fullName', style: 'max-width: 200px' },
  { name: 'phone', label: 'Teléfono', field: 'phone', style: 'width: 110px' },
  { name: 'specialty', label: 'Especialidad', field: 'specialty', style: 'max-width: 160px' },
]
const svcColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'code', label: 'Código', field: 'code', style: 'width: 90px' },
  { name: 'description', label: 'Descripción', field: 'description', style: 'max-width: 220px' },
  { name: 'basePrice', label: 'Valor', field: 'basePrice', align: 'right', style: 'width: 100px' },
  { name: 'durationMinutes', label: 'Min', field: 'durationMinutes', align: 'center', style: 'width: 64px' },
]
const cliColumns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'left', style: 'width: 56px' },
  { name: 'documentNumber', label: 'Documento', field: 'documentNumber', style: 'width: 120px' },
  { name: 'fullName', label: 'Nombre', field: 'fullName', style: 'max-width: 200px' },
  { name: 'phone', label: 'Teléfono', field: 'phone', style: 'width: 110px' },
]
const ticketColumns = [
  { name: 'ticketNumber', label: 'Ticket', field: 'ticketNumber', style: 'width: 100px' },
  { name: 'clientName', label: 'Cliente', field: 'clientName', style: 'max-width: 180px' },
  { name: 'serviceDesc', label: 'Servicio', field: 'serviceDesc', style: 'max-width: 180px' },
  { name: 'professionalName', label: 'Profesional', field: 'professionalName', style: 'max-width: 160px' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', style: 'width: 100px' },
]

onMounted(async () => {
  try {
    await loadCatalogs()
    await loadAppointments()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar la agenda' })
  }
})

async function loadCatalogs() {
  const [p, s, c, m] = await Promise.all([
    api.company.agenda.professionals(),
    api.company.agenda.services(),
    api.company.agenda.clients(),
    api.company.agenda.scheduleTemplates(),
  ])
  professionals.value = p
  services.value = s
  clients.value = c
  scheduleModels.value = m
}

async function loadAppointments() {
  loadingAppt.value = true
  const params = { date: selectedDate.value }
  if (filterProf.value) params.professionalId = filterProf.value
  appointments.value = await api.company.agenda.appointments(params)
  loadingAppt.value = false
}

async function loadBilling() {
  loadingBilling.value = true
  const data = await api.company.agenda.dailyTickets(billingDate.value)
  dailyTickets.value = data.tickets
  billingSummary.value = data.summary
  loadingBilling.value = false
}

function openAppointmentDialog() {
  Object.assign(apptForm, {
    professionalId: filterProf.value || null,
    clientId: null, serviceId: null,
    appointmentDate: selectedDate.value, selectedSlot: null, basePrice: 0,
    overridePrice: null, discountPercent: 0, discountAmount: 0, notes: '',
  })
  slots.value = []
  slotsMessage.value = ''
  slotProgramming.value = []
  apptDialog.value = true
  if (apptForm.professionalId && apptForm.appointmentDate) {
    loadSlots()
  }
}

function slotLabel(slot) {
  return slot.endTime ? `${slot.startTime} - ${slot.endTime}` : slot.startTime
}

function selectSlot(slot) {
  apptForm.selectedSlot = slot.startTime
}

function onProfessionalOrDateChange() {
  apptForm.selectedSlot = null
  loadSlots()
}

function onServicePick(id) {
  const s = services.value.find(x => x.id === id)
  if (s) {
    apptForm.basePrice = s.basePrice
    if (apptForm.professionalId && apptForm.appointmentDate) {
      loadSlots()
    }
  }
}

function addWeekdays() {
  const start = modelForm.programming[0]?.startTime || '14:00'
  const end = modelForm.programming[0]?.endTime || '17:00'
  modelForm.programming = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek, startTime: start, endTime: end,
  }))
}

async function loadSlots() {
  slotsMessage.value = ''
  slotProgramming.value = []
  const previousSlot = apptForm.selectedSlot
  if (!apptForm.professionalId || !apptForm.appointmentDate) {
    slots.value = []
    apptForm.selectedSlot = null
    return
  }

  loadingSlots.value = true
  try {
    const data = await api.company.agenda.availableSlots(
      apptForm.professionalId,
      apptForm.appointmentDate,
      apptForm.serviceId || null,
    )
    if (Array.isArray(data)) {
      slots.value = data
      slotProgramming.value = []
      slotsMessage.value = data.length ? '' : 'No hay turnos disponibles para esta fecha'
    } else {
      slots.value = data.slots || []
      slotProgramming.value = data.programming || []
      slotsMessage.value = data.message || (slots.value.length ? '' : 'No hay turnos disponibles para esta fecha')
    }
    apptForm.selectedSlot = slots.value.some((s) => s.startTime === previousSlot) ? previousSlot : null
  } catch (e) {
    slots.value = []
    slotProgramming.value = []
    slotsMessage.value = e.message
    apptForm.selectedSlot = null
  } finally {
    loadingSlots.value = false
  }
}

async function saveAppointment() {
  if (!canSaveAppointment.value) {
    $q.notify({ type: 'warning', message: 'Seleccione profesional, fecha, turno, cliente y servicio' })
    return
  }

  saving.value = true
  try {
    await api.company.agenda.createAppointment({
      professionalId: apptForm.professionalId,
      clientId: apptForm.clientId,
      serviceId: apptForm.serviceId,
      appointmentDate: apptForm.appointmentDate,
      startTime: apptForm.selectedSlot,
      discountAmount: Number(apptForm.discountAmount) || 0,
      discountPercent: Number(apptForm.discountPercent) || 0,
      overridePrice: apptForm.overridePrice ? Number(apptForm.overridePrice) : undefined,
      notes: apptForm.notes || undefined,
    })
    $q.notify({ type: 'positive', message: 'Cita agendada' })
    apptDialog.value = false
    await loadAppointments()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function completeAppt(row) {
  await api.company.agenda.completeAppointment(row.id)
  $q.notify({ type: 'positive', message: 'Cita marcada como cumplida' })
  await loadAppointments()
}

function openReschedule(row) {
  rescheduleId.value = row.id
  rescheduleProfessionalId.value = row.professionalId
  rescheduleForm.appointmentDate = selectedDate.value
  rescheduleForm.startTime = ''
  rescheduleSlots.value = []
  rescheduleProgramming.value = []
  rescheduleSlotsMessage.value = ''
  rescheduleDialog.value = true
  loadRescheduleSlots()
}

async function loadRescheduleSlots() {
  rescheduleForm.startTime = ''
  if (!rescheduleProfessionalId.value || !rescheduleForm.appointmentDate) return

  loadingRescheduleSlots.value = true
  try {
    const data = await api.company.agenda.availableSlots(
      rescheduleProfessionalId.value,
      rescheduleForm.appointmentDate,
      null,
      rescheduleId.value,
    )
    if (Array.isArray(data)) {
      rescheduleSlots.value = data
      rescheduleProgramming.value = []
      rescheduleSlotsMessage.value = data.length ? '' : 'No hay turnos disponibles'
    } else {
      rescheduleSlots.value = data.slots || []
      rescheduleProgramming.value = data.programming || []
      rescheduleSlotsMessage.value = data.message || 'No hay turnos disponibles'
    }
  } catch (e) {
    rescheduleSlots.value = []
    rescheduleProgramming.value = []
    rescheduleSlotsMessage.value = e.message
  } finally {
    loadingRescheduleSlots.value = false
  }
}

async function saveReschedule() {
  saving.value = true
  try {
    await api.company.agenda.rescheduleAppointment(rescheduleId.value, rescheduleForm)
    $q.notify({ type: 'positive', message: 'Cita reagendada' })
    rescheduleDialog.value = false
    await loadAppointments()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

async function invoiceAppt(row) {
  try {
    const ticket = await api.company.agenda.invoiceAppointment(row.id)
    $q.notify({ type: 'positive', message: `Ticket ${ticket.ticketNumber} generado` })
    await loadAppointments()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  }
}

function openCrud(type, row = null) {
  crudType.value = type
  crudEditId.value = row?.id || null
  Object.keys(crudForm).forEach(k => delete crudForm[k])
  if (row) Object.assign(crudForm, { ...row })
  if (type === 'svc' && !row) refreshNextServicePreview()
  crudDialog.value = true
}

async function refreshNextServicePreview() {
  try {
    const data = await api.ventas.nextServiceCode()
    nextServicePreview.value = data.nextCode
  } catch {
    nextServicePreview.value = ''
  }
}

async function saveCrud() {
  saving.value = true
  try {
    const a = api.company.agenda
    if (crudType.value === 'prof') {
      if (crudEditId.value) await a.updateProfessional(crudEditId.value, crudForm)
      else await a.createProfessional(crudForm)
    } else if (crudType.value === 'svc') {
      const payload = {
        description: crudForm.description,
        basePrice: crudForm.basePrice,
        durationMinutes: crudForm.durationMinutes,
      }
      if (crudEditId.value) await a.updateService(crudEditId.value, payload)
      else await a.createService(payload)
    } else if (crudType.value === 'cli') {
      if (crudEditId.value) await a.updateClient(crudEditId.value, crudForm)
      else await a.createClient(crudForm)
    }
    $q.notify({ type: 'positive', message: 'Guardado' })
    crudDialog.value = false
    await loadCatalogs()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function openModelDialog() {
  Object.assign(modelForm, {
    professionalId: null, name: '', slotDurationMinutes: 30,
    programming: [{ dayOfWeek: 1, startTime: '14:00', endTime: '17:00' }],
  })
  modelDialog.value = true
}

async function saveModel() {
  if (!modelForm.professionalId || !modelForm.name || !modelForm.programming.length) {
    $q.notify({ type: 'warning', message: 'Complete profesional, nombre y al menos un día de programación' })
    return
  }
  saving.value = true
  try {
    await api.company.agenda.createScheduleTemplate(modelForm)
    $q.notify({ type: 'positive', message: 'Modelo creado' })
    modelDialog.value = false
    Object.assign(modelForm, {
      professionalId: null, name: '', slotDurationMinutes: 30,
      programming: [{ dayOfWeek: 1, startTime: '14:00', endTime: '17:00' }],
    })
    scheduleModels.value = await api.company.agenda.scheduleTemplates()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    saving.value = false
  }
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO')
}

function statusColor(s) {
  return { programada: 'blue', cumplida: 'positive', facturada: 'teal', reagendada: 'orange', cancelada: 'grey' }[s] || 'grey'
}

function statusLabel(s) {
  return { programada: 'Programada', cumplida: 'Cumplida', facturada: 'Facturada', reagendada: 'Reagendada', cancelada: 'Cancelada' }[s] || s
}
</script>
