<template>
  <LoginPageShell title="Panel administrativo" subtitle="Acceso super administrador ConexaSoft">
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
        icon="admin_panel_settings"
      />
    </q-form>

    <template #links>
      <router-link to="/login">¿Usuario de compañía?</router-link>
      <span class="login-card__sep">·</span>
      <router-link to="/">Sitio web</router-link>
    </template>
  </LoginPageShell>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { saveAuth } from 'src/utils/auth.js'
import { applyAdminTheme } from 'src/utils/company-theme.js'
import LoginPageShell from 'src/components/auth/LoginPageShell.vue'

onMounted(() => {
  applyAdminTheme()
})

const $q = useQuasar()
const router = useRouter()

const email = ref('')
const password = ref('')
const showPass = ref(false)
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    const data = await api.admin.login(email.value.trim().toLowerCase(), password.value.trim())
    saveAuth(data, 'admin')
    $q.notify({ type: 'positive', message: 'Bienvenido, ' + data.user.fullName })
    router.push('/admin/dashboard')
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    loading.value = false
  }
}
</script>
