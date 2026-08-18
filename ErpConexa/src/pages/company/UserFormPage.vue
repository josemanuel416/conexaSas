<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      :title="isEdit ? 'Editar usuario' : 'Nuevo usuario'"
      icon="person_add"
      :subtitle="isEdit ? 'Actualice datos y permisos de acceso' : 'Registre un nuevo usuario con permisos por módulo'"
    />

    <div class="company-page-card" style="max-width: 900px">
      <q-inner-loading :showing="loading" />

      <q-form v-if="!loading" @submit.prevent="onSubmit" class="q-gutter-md">
        <div class="text-subtitle2 text-primary">Datos del usuario</div>

          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-6">
              <q-input v-model="form.fullName" label="Nombre completo *" outlined dense
                :rules="[v => !!v || 'Requerido']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input v-model="form.email" label="Email *" type="email" outlined dense
                :rules="[v => !!v || 'Requerido']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input
                v-model="form.password"
                :label="isEdit ? 'Nueva contraseña' : 'Contraseña *'"
                :hint="isEdit ? 'Dejar vacío para no cambiar' : 'Mínimo 6 caracteres'"
                :type="showPass ? 'text' : 'password'"
                autocomplete="new-password"
                outlined dense
                :rules="passwordRules"
              >
                <template #append>
                  <q-icon :name="showPass ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer" @click="showPass = !showPass" />
                </template>
              </q-input>
            </div>
            <div v-if="!isEdit" class="col-12 col-md-6">
              <q-input
                v-model="form.confirmPassword"
                label="Confirmar contraseña *"
                :type="showConfirmPass ? 'text' : 'password'"
                autocomplete="new-password"
                outlined dense
                :rules="confirmPasswordRules"
              >
                <template #append>
                  <q-icon :name="showConfirmPass ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer" @click="showConfirmPass = !showConfirmPass" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-6">
              <q-select
                v-model="form.role"
                :options="roleOptions"
                label="Rol *"
                outlined dense emit-value map-options
              />
            </div>
            <div v-if="hasCajaModule" class="col-12 col-md-6">
              <q-select
                v-model="form.cashRegisterId"
                :options="cashRegisterOptions"
                label="Caja asignada"
                outlined dense emit-value map-options clearable
                hint="Usuarios no administrativos solo ven su caja"
              />
            </div>
            <div v-if="isEdit" class="col-12">
              <q-toggle v-model="form.isActive" label="Usuario activo" color="positive" />
            </div>
          </div>

          <q-separator />
          <div class="text-subtitle2 text-primary">Permisos de acceso</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Asigne los permisos según los módulos contratados y el criterio de la compañía.
          </div>

          <div v-if="permCatalog.system?.length" class="q-mb-md">
            <div class="text-body2 text-weight-medium q-mb-sm">
              <q-icon name="settings" class="q-mr-xs" /> Sistema
            </div>
            <div class="row q-col-gutter-sm">
              <div v-for="perm in permCatalog.system" :key="perm.id" class="col-12 col-sm-6">
                <q-checkbox
                  v-model="form.permissions"
                  :val="perm.id"
                  :label="perm.name"
                  color="primary"
                >
                  <q-tooltip v-if="perm.description">{{ perm.description }}</q-tooltip>
                </q-checkbox>
              </div>
            </div>
          </div>

          <div v-for="mod in permCatalog.modules" :key="mod.code" class="q-mb-md">
            <div class="text-body2 text-weight-medium q-mb-sm">
              <q-icon :name="mod.icon || 'extension'" class="q-mr-xs" /> {{ mod.name }}
            </div>
            <div class="row q-col-gutter-sm">
              <div v-for="perm in mod.permissions" :key="perm.id" class="col-12 col-sm-6">
                <q-checkbox
                  v-model="form.permissions"
                  :val="perm.id"
                  :label="perm.name"
                  color="primary"
                >
                  <q-tooltip v-if="perm.description">{{ perm.description }}</q-tooltip>
                </q-checkbox>
              </div>
            </div>
          </div>

          <div class="row q-gutter-sm q-mt-md">
            <q-btn type="submit" color="primary"
              :label="isEdit ? 'Guardar cambios' : 'Crear usuario'"
              :loading="saving" unelevated />
            <q-btn flat label="Cancelar" to="/users" />
          </div>
        </q-form>
    </div>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()

const saving = ref(false)
const loading = ref(false)
const showPass = ref(false)
const showConfirmPass = ref(false)
const permCatalog = ref({ system: [], modules: [] })
const cashRegisters = ref([])

const hasCajaModule = computed(() =>
  permCatalog.value.modules?.some((m) => m.code === 'caja')
)

const cashRegisterOptions = computed(() =>
  cashRegisters.value.map((r) => ({ label: `${r.code} — ${r.name}`, value: r.id }))
)

const userId = computed(() => route.params.id)
const isEdit = computed(() => !!userId.value)

const roleOptions = [
  { label: 'Usuario', value: 'user' },
  { label: 'Administrador', value: 'company_admin' },
]

const form = reactive({
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'user',
  isActive: true,
  permissions: [],
  cashRegisterId: null,
})

const passwordRules = computed(() => {
  if (isEdit.value) {
    return [
      (v) => !v || v.trim().length >= 6 || 'Mínimo 6 caracteres',
    ]
  }
  return [
    (v) => !!v?.trim() || 'Requerido',
    (v) => v.trim().length >= 6 || 'Mínimo 6 caracteres',
  ]
})

const confirmPasswordRules = computed(() => [
  (v) => !!v?.trim() || 'Requerido',
  (v) => v.trim() === form.password.trim() || 'Las contraseñas no coinciden',
])

onMounted(async () => {
  loading.value = true
  try {
    permCatalog.value = await api.company.permissions()

    if (permCatalog.value.modules?.some((m) => m.code === 'caja')) {
      try {
        cashRegisters.value = await api.caja.registers()
      } catch { /* sin acceso a caja */ }
    }

    if (isEdit.value) {
      const user = await api.company.user(userId.value)
      form.fullName = user.fullName
      form.email = user.email
      form.role = user.role
      form.isActive = user.isActive
      form.cashRegisterId = user.cashRegisterId || null
      form.permissions = user.permissions.map(p => p.id)
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
    router.push('/users')
  } finally {
    loading.value = false
  }
})

async function onSubmit() {
  saving.value = true
  try {
    const fullName = form.fullName.trim()
    const email = form.email.trim().toLowerCase()
    const password = form.password.trim()
    const confirmPassword = form.confirmPassword.trim()

    if (!fullName || !email) {
      throw new Error('Nombre y email son requeridos')
    }

    if (isEdit.value) {
      const payload = {
        fullName,
        email,
        role: form.role,
        isActive: form.isActive,
        cashRegisterId: form.cashRegisterId || null,
      }
      if (password) {
        if (password.length < 6) throw new Error('La contraseña debe tener mínimo 6 caracteres')
        payload.password = password
      }
      await api.company.updateUser(userId.value, payload)
      await api.company.updateUserPermissions(userId.value, form.permissions)
      $q.notify({ type: 'positive', message: 'Usuario y permisos actualizados' })
    } else {
      if (!password) throw new Error('La contraseña es requerida')
      if (password.length < 6) throw new Error('La contraseña debe tener mínimo 6 caracteres')
      if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden')

      await api.company.createUser({
        fullName,
        email,
        password,
        role: form.role,
        permissions: form.permissions,
        cashRegisterId: form.cashRegisterId || null,
      })
      $q.notify({ type: 'positive', message: 'Usuario creado' })
    }
    router.push('/users')
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}
</script>
