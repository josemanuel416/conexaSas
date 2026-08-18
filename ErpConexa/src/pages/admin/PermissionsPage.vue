<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      title="Permisos del sistema"
      icon="security"
      subtitle="Catálogo de permisos asignables por módulo"
    />

    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-4">
        <div class="company-page-card text-center">
          <div class="text-h4 text-primary text-weight-bold">{{ stats.total }}</div>
          <div class="text-grey-7">Total permisos</div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="company-page-card text-center">
          <div class="text-h4 text-positive text-weight-bold">{{ stats.active }}</div>
          <div class="text-grey-7">Activos</div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="company-page-card text-center">
          <div class="text-h4 text-primary text-weight-bold">{{ stats.byModule }}</div>
          <div class="text-grey-7">Módulos con permisos</div>
        </div>
      </div>
    </div>

    <div class="row justify-end q-mb-md">
      <q-btn color="primary" icon="add" label="Nuevo permiso" @click="openDialog()" unelevated />
    </div>

    <div class="company-page-card q-mb-md" v-if="grouped.system.length">
        <div class="text-subtitle1 q-mb-sm">
          <q-icon name="settings" class="q-mr-xs" /> Sistema
        </div>
        <q-table
          class="company-data-table"
          :rows="grouped.system"
          :columns="columns"
          row-key="id"
          flat dense hide-pagination :rows-per-page-options="[0]"
        >
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'grey'">
                {{ props.row.isActive ? 'Activo' : 'Inactivo' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense icon="edit" color="primary" @click="openDialog(props.row)" />
            </q-td>
          </template>
        </q-table>
    </div>

    <div class="company-page-card q-mb-md" v-for="mod in grouped.modules" :key="mod.code">
        <div class="text-subtitle1 q-mb-sm">
          <q-icon :name="mod.icon || 'extension'" class="q-mr-xs" /> {{ mod.name }}
          <q-badge color="blue-grey" class="q-ml-sm">{{ mod.code }}</q-badge>
        </div>
        <q-table
          class="company-data-table"
          :rows="mod.permissions"
          :columns="columns"
          row-key="id"
          flat dense hide-pagination :rows-per-page-options="[0]"
        >
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'grey'">
                {{ props.row.isActive ? 'Activo' : 'Inactivo' }}
              </q-badge>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense icon="edit" color="primary" @click="openDialog(props.row)" />
              <q-btn flat dense icon="add" color="primary"
                @click="openDialog(null, mod)" title="Añadir permiso a este módulo" />
            </q-td>
          </template>
        </q-table>
    </div>

    <q-inner-loading :showing="loading" />

    <!-- Dialog crear/editar -->
    <q-dialog v-model="dialog" persistent>
      <q-card class="company-form-dialog">
        <q-card-section>
          <div class="text-h6">{{ editing ? 'Editar permiso' : 'Nuevo permiso' }}</div>
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <q-select
            v-if="!editing"
            v-model="form.moduleId"
            :options="moduleOptions"
            label="Módulo *"
            outlined dense emit-value map-options
            @update:model-value="onModuleChange"
          />

          <q-input
            v-if="!editing"
            v-model="form.code"
            label="Código *"
            hint="Formato: modulo.accion (ej: ventas.anular)"
            outlined dense
            :error="!!codeError"
            :error-message="codeError"
            @blur="validateCode"
            @update:model-value="codeError = ''"
          >
            <template #append>
              <q-icon
                v-if="codeValid === true" name="check_circle" color="positive"
              />
              <q-icon
                v-if="codeValid === false" name="error" color="negative"
              />
            </template>
          </q-input>

          <q-input v-else v-model="form.code" label="Código" outlined dense readonly />

          <q-input v-model="form.name" label="Nombre *" outlined dense />
          <q-input v-model="form.description" label="Descripción" outlined dense type="textarea" rows="2" />
          <q-input v-model.number="form.sortOrder" label="Orden" type="number" outlined dense />
          <q-toggle v-model="form.isActive" label="Permiso activo" color="positive" />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" :label="editing ? 'Guardar' : 'Crear'"
            :loading="saving" :disable="!canSave" @click="save" unelevated />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()

const loading = ref(true)
const saving = ref(false)
const dialog = ref(false)
const editing = ref(false)
const editId = ref(null)
const codeError = ref('')
const codeValid = ref(null)

const permissions = ref([])
const grouped = ref({ system: [], modules: [] })
const stats = ref({ total: 0, active: 0, byModule: 0 })
const modules = ref([])

const form = reactive({
  moduleId: null,
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  isActive: true,
})

const moduleOptions = computed(() => [
  { label: 'Sistema (usuarios)', value: null },
  ...modules.value.map(m => ({ label: `${m.name} (${m.code})`, value: m.id })),
])

const columns = [
  { name: 'code', label: 'Código', field: 'code', align: 'left', style: 'font-family: monospace' },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left' },
  { name: 'userCount', label: 'Usuarios', field: 'userCount', align: 'center' },
  { name: 'sortOrder', label: 'Orden', field: 'sortOrder', align: 'center' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

const canSave = computed(() => {
  if (!form.name) return false
  if (!editing.value && (!form.code || codeValid.value !== true)) return false
  return true
})

onMounted(loadData)

async function loadData() {
  loading.value = true
  const [data, mods] = await Promise.all([
    api.admin.permissions(),
    api.admin.modules(),
  ])
  permissions.value = data.permissions
  grouped.value = data.grouped
  stats.value = data.stats
  modules.value = mods
  loading.value = false
}

function onModuleChange(moduleId) {
  if (!editing.value && moduleId) {
    const mod = modules.value.find(m => m.id === moduleId)
    if (mod && !form.code) form.code = `${mod.code}.`
  } else if (!moduleId && !form.code) {
    form.code = 'usuarios.'
  }
  codeValid.value = null
  codeError.value = ''
}

function openDialog(perm = null, mod = null) {
  editing.value = !!perm
  editId.value = perm?.id || null
  codeError.value = ''
  codeValid.value = perm ? true : null

  if (perm) {
    form.moduleId = perm.moduleId
    form.code = perm.code
    form.name = perm.name
    form.description = perm.description || ''
    form.sortOrder = perm.sortOrder
    form.isActive = perm.isActive
  } else {
    const modId = mod ? modules.value.find(m => m.code === mod.code)?.id : null
    form.moduleId = modId
    form.code = mod ? `${mod.code}.` : ''
    form.name = ''
    form.description = ''
    form.sortOrder = 0
    form.isActive = true
  }

  dialog.value = true
}

async function validateCode() {
  if (!form.code || editing.value) return

  try {
    const result = await api.admin.validatePermission({
      code: form.code,
      moduleId: form.moduleId,
    })
    codeValid.value = result.valid
    codeError.value = result.error || ''
  } catch (err) {
    codeValid.value = false
    codeError.value = err.message
  }
}

async function save() {
  if (!editing.value) await validateCode()
  if (!canSave.value) return

  saving.value = true
  try {
    if (editing.value) {
      await api.admin.updatePermission(editId.value, {
        name: form.name,
        description: form.description,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      })
      $q.notify({ type: 'positive', message: 'Permiso actualizado' })
    } else {
      await api.admin.createPermission({
        code: form.code,
        name: form.name,
        description: form.description,
        moduleId: form.moduleId,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      })
      $q.notify({ type: 'positive', message: 'Permiso creado' })
    }
    dialog.value = false
    await loadData()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}
</script>
