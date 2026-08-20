<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      :title="isEdit ? 'Editar compañía' : 'Crear compañía'"
      icon="business"
      :subtitle="isEdit ? 'Datos, identidad visual y administrador de la empresa' : 'Registre una nueva empresa en el ecosistema Conexa'"
    />

    <div class="company-page-card admin-form-card--wide">
      <q-inner-loading :showing="loading" />

      <q-form v-if="!loading" @submit.prevent="onSubmit" class="q-gutter-md">
          <div class="text-subtitle2 text-primary">Datos de la compañía</div>

          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-6">
              <q-input v-model="form.name" label="Nombre *" outlined dense
                :rules="[v => !!v || 'Requerido']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input v-model="form.nit" label="NIT *" outlined dense
                :rules="[v => !!v || 'Requerido']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input v-model="form.email" label="Email compañía" type="email" outlined dense />
            </div>
            <div class="col-12 col-md-6">
              <q-input v-model="form.phone" label="Teléfono" outlined dense />
            </div>
            <div class="col-12">
              <q-input v-model="form.address" label="Dirección" outlined dense />
            </div>
            <div v-if="isEdit" class="col-12">
              <q-toggle
                v-model="form.isActive"
                label="Compañía activa"
                color="positive"
              />
            </div>
            <div v-if="isEdit && form.slug" class="col-12">
              <q-banner dense rounded class="bg-blue-1 text-blue-10">
                Código de ingreso en <strong>/login</strong> (si el email está en varias compañías):
                <code class="q-ml-sm">{{ form.slug }}</code>
              </q-banner>
            </div>
          </div>

          <q-separator class="q-my-md" />
          <div class="text-subtitle2 text-primary">Identidad visual (panel de la compañía)</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Colores que verá la empresa en su ERP (header, botones, acentos) y en la factura PDF.
          </div>

          <div class="row q-col-gutter-md items-start q-mb-md">
            <div class="col-12">
              <div class="text-caption q-mb-xs">Logo corporativo</div>
            </div>
            <div class="col-auto">
              <div class="logo-preview-shell rounded-borders">
                <q-inner-loading :showing="logoLoadState === 'loading' || uploadingLogo">
                  <q-spinner color="primary" size="28px" />
                </q-inner-loading>

                <img
                  v-if="logoPreviewUrl && logoLoadState !== 'error'"
                  :src="logoPreviewUrl"
                  alt="Vista previa del logo"
                  class="logo-preview-image"
                  @load="onLogoImageLoad"
                  @error="onLogoImageError"
                />

                <div v-else-if="logoLoadState === 'error'" class="logo-preview-empty text-negative">
                  <q-icon name="broken_image" size="28px" />
                  <div class="text-caption q-mt-xs">{{ logoErrorMessage || 'No se pudo cargar' }}</div>
                </div>

                <div v-else-if="!logoPreviewUrl && !uploadingLogo" class="logo-preview-empty text-grey-6">
                  <q-icon name="image" size="28px" />
                  <div class="text-caption q-mt-xs">Sin logo</div>
                </div>
              </div>

              <div class="q-mt-xs">
                <q-chip
                  v-if="logoLoadState === 'loaded'"
                  dense
                  color="positive"
                  text-color="white"
                  icon="check_circle"
                >
                  Logo listo
                </q-chip>
                <q-chip
                  v-else-if="logoLoadState === 'error'"
                  dense
                  color="negative"
                  text-color="white"
                  icon="error"
                >
                  Revisar archivo
                </q-chip>
              </div>
            </div>
            <div class="col">
              <q-file
                v-model="logoFile"
                label="Subir logo (PNG, JPG, WebP)"
                accept="image/png,image/jpeg,image/webp"
                outlined
                dense
                clearable
                :disable="uploadingLogo"
                @update:model-value="onLogoSelected"
              >
                <template #prepend>
                  <q-icon name="image" />
                </template>
              </q-file>
              <q-input
                v-model="form.logoPath"
                label="Ruta del logo (factura PDF)"
                outlined
                dense
                readonly
                class="q-mt-sm"
                hint="Se guarda automáticamente al subir el archivo"
              >
                <template #prepend>
                  <q-icon name="link" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-auto flex items-end">
              <q-btn
                outline
                color="primary"
                icon="palette"
                label="Tomar colores del logo"
                :disable="!canExtractColors || extractingColors"
                :loading="extractingColors"
                @click="applyLogoColors"
              />
            </div>
          </div>

          <div class="row q-col-gutter-md items-center">
            <div class="col-12 col-md-4">
              <div class="text-caption q-mb-xs">Color principal</div>
              <q-input v-model="form.themePrimary" outlined dense readonly>
                <template #prepend>
                  <q-icon name="palette" :style="{ color: form.themePrimary }" />
                </template>
                <template #append>
                  <q-btn flat round dense icon="colorize">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-color v-model="form.themePrimary" format-model="hex" />
                    </q-popup-proxy>
                  </q-btn>
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-4">
              <div class="text-caption q-mb-xs">Color secundario</div>
              <q-input v-model="form.themeSecondary" outlined dense readonly>
                <template #prepend>
                  <q-icon name="palette" :style="{ color: form.themeSecondary }" />
                </template>
                <template #append>
                  <q-btn flat round dense icon="colorize">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-color v-model="form.themeSecondary" format-model="hex" />
                    </q-popup-proxy>
                  </q-btn>
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-4">
              <div class="text-caption q-mb-xs">Color de acento</div>
              <q-input v-model="form.themeAccent" outlined dense readonly>
                <template #prepend>
                  <q-icon name="palette" :style="{ color: form.themeAccent }" />
                </template>
                <template #append>
                  <q-btn flat round dense icon="colorize">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-color v-model="form.themeAccent" format-model="hex" />
                    </q-popup-proxy>
                  </q-btn>
                </template>
              </q-input>
            </div>
            <div class="col-12">
              <q-banner dense rounded :style="themePreviewStyle" class="text-white">
                Vista previa — {{ form.name || 'Nombre compañía' }}
              </q-banner>
            </div>
          </div>

          <q-separator class="q-my-md" />
          <div class="text-subtitle2 text-primary">
            Administrador de la compañía
            <span v-if="isEdit" class="text-caption text-grey-7 q-ml-sm">
              (credenciales de ingreso en /login)
            </span>
          </div>

          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-6">
              <q-input v-model="form.adminName" label="Nombre admin *" outlined dense
                :rules="[v => !!v || 'Requerido']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input v-model="form.adminEmail" label="Email admin *" type="email" outlined dense
                :rules="[v => !!v || 'Requerido']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input
                v-model="form.adminPassword"
                :label="isEdit ? 'Nueva contraseña' : 'Contraseña admin *'"
                :hint="isEdit ? 'Dejar vacío para no cambiar la contraseña' : 'Mínimo 6 caracteres'"
                :type="showPass ? 'text' : 'password'"
                autocomplete="new-password"
                outlined
                dense
                :rules="adminPasswordRules"
              >
                <template #append>
                  <q-icon :name="showPass ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer" @click="showPass = !showPass" />
                </template>
              </q-input>
            </div>
            <div v-if="isEdit" class="col-12 col-md-6 flex items-center">
              <q-toggle
                v-model="form.adminIsActive"
                label="Admin activo (puede ingresar)"
                color="positive"
              />
            </div>
            <div v-if="isEdit && form.adminLastLogin" class="col-12">
              <q-banner dense rounded class="bg-grey-2 text-grey-8">
                Último ingreso: {{ formatDate(form.adminLastLogin) }}
              </q-banner>
            </div>
          </div>

          <template v-if="!isEdit">
            <q-separator class="q-my-md" />
            <div class="text-subtitle2 text-primary">Módulos del contrato</div>

            <div class="row q-col-gutter-sm">
              <div v-for="mod in availableModules" :key="mod.id" class="col-12 col-sm-6 col-md-4">
                <q-checkbox
                  v-model="form.modules"
                  :val="mod.id"
                  :label="mod.name"
                  color="primary"
                />
              </div>
            </div>
          </template>

          <div class="row q-gutter-sm q-mt-md">
            <q-btn
              type="submit"
              color="primary"
              icon="save"
              :label="isEdit ? 'Guardar cambios' : 'Crear compañía'"
              :loading="saving"
              unelevated
            />
            <q-btn flat icon="arrow_back" label="Cancelar" to="/admin/companies" />
            <q-btn
              v-if="isEdit"
              flat
              color="primary"
              icon="extension"
              label="Módulos"
              :to="`/admin/companies/${companyId}/modules`"
            />
          </div>
        </q-form>
    </div>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api, assetUrl } from 'src/services/api.js'
import { themeHeaderStyle } from 'src/utils/company-theme.js'
import { extractLogoColors } from 'src/utils/logo-colors.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'
import { formatDateTime } from 'src/utils/date-format.js'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()

const saving = ref(false)
const loading = ref(false)
const showPass = ref(false)
const availableModules = ref([])
const logoFile = ref(null)
const logoPreviewUrl = ref('')
const logoLoadState = ref('idle')
const logoErrorMessage = ref('')
const uploadingLogo = ref(false)
const extractingColors = ref(false)
const pendingLogoFile = ref(null)
let managedLogoObjectUrl = ''
let logoTriedBlobFallback = false

const companyId = computed(() => route.params.id)
const isEdit = computed(() => !!companyId.value && route.name !== 'admin-companies-create')

const adminPasswordRules = computed(() => {
  if (isEdit.value) {
    return [(v) => !v || v.trim().length >= 6 || 'Mínimo 6 caracteres']
  }
  return [
    (v) => !!v?.trim() || 'Requerido',
    (v) => v.trim().length >= 6 || 'Mínimo 6 caracteres',
  ]
})

const form = reactive({
  name: '',
  nit: '',
  slug: '',
  email: '',
  phone: '',
  address: '',
  isActive: true,
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  adminIsActive: true,
  adminLastLogin: null,
  modules: [],
  themePrimary: '#1976D2',
  themeSecondary: '#0D47A1',
  themeAccent: '#00E5FF',
  logoPath: '',
})

const canExtractColors = computed(() =>
  logoLoadState.value === 'loaded' && Boolean(logoPreviewUrl.value || pendingLogoFile.value)
)

const themePreviewStyle = computed(() =>
  themeHeaderStyle({
    primary: form.themePrimary,
    secondary: form.themeSecondary,
    accent: form.themeAccent,
  })
)

onMounted(async () => {
  await loadCompanyForm()
})

watch(companyId, async (id, prev) => {
  if (id && id !== prev && isEdit.value) {
    await loadCompanyForm()
  }
})

async function loadCompanyForm() {
  if (isEdit.value) {
    loading.value = true
    revokeManagedLogoUrl()
    setLogoPreviewUrl('')
    logoLoadState.value = 'idle'
    try {
      const company = await api.admin.company(companyId.value)
      form.name = company.name
      form.nit = company.nit
      form.slug = company.slug || ''
      form.email = company.email || ''
      form.phone = company.phone || ''
      form.address = company.address || ''
      form.isActive = company.isActive
      if (company.theme) {
        form.themePrimary = company.theme.primary
        form.themeSecondary = company.theme.secondary
        form.themeAccent = company.theme.accent
      }
      form.logoPath = company.logoPath || ''
      await refreshLogoPreview()
      if (company.admin) {
        form.adminName = company.admin.fullName
        form.adminEmail = company.admin.email
        form.adminIsActive = company.admin.isActive
        form.adminLastLogin = company.admin.lastLogin
      }
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
      router.push('/admin/companies')
    } finally {
      loading.value = false
    }
  } else if (!availableModules.value.length) {
    availableModules.value = await api.admin.modules()
  }
}

onBeforeUnmount(revokeManagedLogoUrl)

function revokeManagedLogoUrl() {
  if (managedLogoObjectUrl) {
    URL.revokeObjectURL(managedLogoObjectUrl)
    managedLogoObjectUrl = ''
  }
}

function setLogoPreviewUrl(url, { managed = false } = {}) {
  revokeManagedLogoUrl()
  logoPreviewUrl.value = url
  if (managed) managedLogoObjectUrl = url
}

async function refreshLogoPreview() {
  if (!isEdit.value || !form.logoPath) {
    setLogoPreviewUrl('')
    logoLoadState.value = 'idle'
    logoErrorMessage.value = ''
    return
  }

  logoLoadState.value = 'loading'
  logoErrorMessage.value = ''
  logoTriedBlobFallback = false
  setLogoPreviewUrl(assetUrl(form.logoPath, Date.now()), { managed: false })
}

function onLogoImageLoad() {
  logoLoadState.value = 'loaded'
  logoErrorMessage.value = ''
}

async function onLogoImageError() {
  if (!logoTriedBlobFallback && isEdit.value && companyId.value) {
    logoTriedBlobFallback = true
    try {
      const { url } = await api.admin.fetchCompanyLogoBlob(companyId.value)
      setLogoPreviewUrl(url, { managed: true })
      logoLoadState.value = 'loading'
      return
    } catch (err) {
      setLogoPreviewUrl('')
      logoLoadState.value = 'error'
      logoErrorMessage.value = err.message || 'Archivo no encontrado. Suba el logo nuevamente.'
      return
    }
  }

  setLogoPreviewUrl('')
  logoLoadState.value = 'error'
  logoErrorMessage.value = 'Archivo no encontrado. Suba el logo nuevamente.'
}

async function onLogoSelected(file) {
  if (!file) {
    if (form.logoPath && isEdit.value) {
      await refreshLogoPreview()
    } else {
      setLogoPreviewUrl('')
      logoLoadState.value = 'idle'
    }
    pendingLogoFile.value = null
    return
  }

  pendingLogoFile.value = file
  setLogoPreviewUrl(URL.createObjectURL(file), { managed: true })
  logoLoadState.value = 'loaded'

  if (isEdit.value) {
    await uploadLogo(file)
    return
  }
}

async function uploadLogo(file) {
  if (!file || !companyId.value) return
  uploadingLogo.value = true
  logoLoadState.value = 'loading'
  try {
    const company = await api.admin.uploadCompanyLogo(companyId.value, file)
    form.logoPath = company.logoPath || ''
    await refreshLogoPreview()
    logoFile.value = null
    pendingLogoFile.value = null
    $q.notify({ type: 'positive', message: 'Logo subido correctamente' })
  } catch (err) {
    logoLoadState.value = logoPreviewUrl.value ? 'loaded' : 'error'
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    uploadingLogo.value = false
  }
}

async function applyLogoColors() {
  const source = pendingLogoFile.value || logoPreviewUrl.value
  if (!source) return

  extractingColors.value = true
  try {
    const colors = await extractLogoColors(source)
    form.themePrimary = colors.primary
    form.themeSecondary = colors.secondary
    form.themeAccent = colors.accent
    $q.notify({ type: 'positive', message: 'Colores aplicados desde el logo' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'No se pudieron extraer colores' })
  } finally {
    extractingColors.value = false
  }
}

async function onSubmit() {
  saving.value = true
  try {
    const adminPassword = form.adminPassword.trim()
    const theme = {
      primary: form.themePrimary,
      secondary: form.themeSecondary,
      accent: form.themeAccent,
    }

    if (isEdit.value) {
      const payload = {
        name: form.name.trim(),
        nit: form.nit.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        isActive: form.isActive,
        theme,
        logoPath: form.logoPath || null,
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim().toLowerCase(),
        adminIsActive: form.adminIsActive,
      }
      if (adminPassword) {
        if (adminPassword.length < 6) {
          throw new Error('La contraseña debe tener mínimo 6 caracteres')
        }
        payload.adminPassword = adminPassword
      }
      await api.admin.updateCompany(companyId.value, payload)
      if (adminPassword) form.adminPassword = ''
      $q.notify({ type: 'positive', message: adminPassword ? 'Compañía y contraseña del admin actualizadas' : 'Compañía y admin actualizados' })
    } else {
      if (!adminPassword) throw new Error('La contraseña admin es requerida')
      if (adminPassword.length < 6) throw new Error('La contraseña debe tener mínimo 6 caracteres')

      const created = await api.admin.createCompany({
        name: form.name.trim(),
        nit: form.nit.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim().toLowerCase(),
        adminPassword,
        theme,
        modules: form.modules,
      })
      if (pendingLogoFile.value) {
        await api.admin.uploadCompanyLogo(created.id, pendingLogoFile.value)
      }
      $q.notify({ type: 'positive', message: 'Compañía creada exitosamente' })
    }
    router.push('/admin/companies')
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function formatDate(value) {
  if (!value) return ''
  return formatDateTime(value)
}
</script>

<style scoped>
.logo-preview-shell {
  width: 180px;
  height: 96px;
  position: relative;
  overflow: hidden;
  border: 1px solid #cfd8dc;
  background:
    linear-gradient(45deg, #eceff1 25%, transparent 25%),
    linear-gradient(-45deg, #eceff1 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eceff1 75%),
    linear-gradient(-45deg, transparent 75%, #eceff1 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-color: #fafafa;
}

.logo-preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  padding: 8px;
  box-sizing: border-box;
}

.logo-preview-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
