<template>
  <q-page class="company-page company-page--wide q-pa-lg">
    <CompanyPageHeader
      :title="`Módulos — ${company?.name || 'Compañía'}`"
      icon="extension"
      subtitle="Active o desactive los módulos contratados por la empresa"
    />

    <div class="company-page-card admin-form-card">
      <q-inner-loading :showing="loading" />

      <template v-if="company">
        <q-list bordered separator class="rounded-borders">
          <q-item v-for="mod in company.modules" :key="mod.id">
            <q-item-section avatar>
              <q-icon :name="mod.icon || 'extension'" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ mod.name }}</q-item-label>
              <q-item-label caption>{{ mod.description }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-toggle
                v-model="mod.is_enabled"
                color="primary"
                @update:model-value="markDirty"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <div class="row q-gutter-sm q-mt-lg">
          <q-btn
            color="primary"
            icon="save"
            label="Guardar cambios"
            :loading="saving"
            :disable="!dirty"
            @click="save"
            unelevated
          />
          <q-btn flat icon="arrow_back" label="Volver" to="/admin/companies" />
        </div>
      </template>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import CompanyPageHeader from 'src/components/company/CompanyPageHeader.vue'

const $q = useQuasar()
const route = useRoute()

const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const company = ref(null)

async function loadCompany() {
  loading.value = true
  dirty.value = false
  try {
    company.value = await api.admin.company(route.params.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    loading.value = false
  }
}

onMounted(loadCompany)

watch(
  () => route.params.id,
  (id, prev) => {
    if (id && id !== prev) loadCompany()
  },
)

function markDirty() {
  dirty.value = true
}

async function save() {
  saving.value = true
  try {
    const modules = company.value.modules.map((m) => ({
      moduleId: m.id,
      isEnabled: m.is_enabled,
    }))
    await api.admin.updateModules(route.params.id, modules)
    $q.notify({ type: 'positive', message: 'Módulos actualizados' })
    dirty.value = false
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}
</script>
