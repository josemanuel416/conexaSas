<template>
  <LoginPageShell title="Portal de compañía" subtitle="Ingrese con su usuario de empresa">
    <q-form @submit.prevent="onSubmit" class="q-gutter-md">
      <q-input
        v-model="email"
        label="Email"
        type="email"
        outlined
        dense
        :rules="[val => !!val || 'Requerido']"
      >
        <template #prepend><q-icon name="email" /></template>
      </q-input>

      <q-input
        v-if="showSlugField"
        v-model="companySlug"
        label="Código de empresa *"
        hint="No use el nombre del admin. Ej: connetc-group-sas"
        outlined
        dense
        :rules="[(v) => !!v?.trim() || 'Requerido cuando el email está en varias compañías']"
      >
        <template #prepend><q-icon name="tag" /></template>
      </q-input>

      <q-banner v-if="companyOptions.length" dense rounded class="bg-blue-1 text-blue-10">
        <div class="text-caption text-weight-medium q-mb-xs">Su email está en varias compañías. Use el código:</div>
        <div v-for="c in companyOptions" :key="c.slug" class="text-body2">
          <strong>{{ c.name }}</strong> → <code>{{ c.slug }}</code>
        </div>
      </q-banner>

      <q-input
        v-model="password"
        label="Contraseña"
        :type="showPass ? 'text' : 'password'"
        outlined
        dense
        :rules="[val => !!val || 'Requerido']"
      >
        <template #prepend><q-icon name="lock" /></template>
        <template #append>
          <q-icon
            :name="showPass ? 'visibility_off' : 'visibility'"
            class="cursor-pointer"
            @click="showPass = !showPass"
          />
        </template>
      </q-input>

      <q-btn
        type="submit"
        label="Ingresar"
        class="full-width login-submit-btn"
        :loading="loading"
        unelevated
        icon="login"
      />
    </q-form>

    <template #links>
      <router-link to="/admin/login">¿Administrador del sistema?</router-link>
      <span class="login-card__sep">·</span>
      <router-link to="/">Sitio web</router-link>
    </template>
  </LoginPageShell>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { saveAuth } from 'src/utils/auth.js'
import LoginPageShell from 'src/components/auth/LoginPageShell.vue'

const $q = useQuasar()
const router = useRouter()

const email = ref('')
const companySlug = ref('')
const password = ref('')
const showPass = ref(false)
const loading = ref(false)
const showSlugField = ref(false)
const companyOptions = ref([])

async function onSubmit() {
  loading.value = true
  try {
    const slug = companySlug.value.trim().toLowerCase() || null
    const data = await api.auth.login(
      email.value.trim().toLowerCase(),
      password.value.trim(),
      slug,
    )
    saveAuth(data, 'company')
    if (data.theme) {
      const { applyCompanyTheme } = await import('src/utils/company-theme.js')
      applyCompanyTheme(data.theme)
    }
    $q.notify({ type: 'positive', message: 'Bienvenido a ' + data.user.companyName })
    router.push('/dashboard')
  } catch (err) {
    const companies = err.details?.companies
    if (companies?.length) {
      showSlugField.value = true
      companyOptions.value = companies
    }
    const hint = err.details?.hint
    $q.notify({
      type: 'negative',
      message: err.message,
      caption: hint || (companies?.length ? 'Deje el código vacío si solo una compañía coincide con su contraseña' : undefined),
      timeout: 6000,
    })
  } finally {
    loading.value = false
  }
}
</script>
