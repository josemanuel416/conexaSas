<template>
  <div class="client-form-grid">
    <q-select
      v-model="model.documentType"
      class="f-tipo"
      :options="documentTypeOptions"
      label="Tipo doc. *"
      outlined
      dense
      hide-bottom-space
      emit-value
      map-options
      @update:model-value="onDocumentTypeChange"
    />
    <q-input
      v-model="model.documentNumber"
      class="f-numero"
      :label="documentNumberLabel"
      outlined
      dense
      hide-bottom-space
      @update:model-value="onDocumentNumberChange"
    />
    <div class="f-consulta-dian row items-center q-gutter-xs">
      <q-btn
        color="primary"
        icon="cloud_download"
        label="Consultar DIAN"
        outline
        dense
        no-caps
        :loading="loadingDianLookup"
        :disable="!canConsultDian"
        @click="consultDian"
      />
      <q-badge v-if="dianValidated" color="positive" outline>
        Validado DIAN
      </q-badge>
    </div>
    <q-input
      v-if="isNit"
      v-model="model.verificationDigit"
      class="f-dv"
      label="DV"
      outlined
      dense
      readonly
      hide-bottom-space
      bg-color="grey-2"
    />
    <q-select
      v-model="model.personType"
      class="f-naturaleza"
      :options="personTypeOptions"
      label="Naturaleza *"
      outlined
      dense
      hide-bottom-space
      emit-value
      map-options
      :disable="isNit"
      @update:model-value="onPersonTypeChange"
    />
    <q-select
      v-model="model.taxLevelCode"
      class="f-iva"
      :options="filteredTaxOptions"
      label="Resp. fiscal / IVA *"
      outlined
      dense
      hide-bottom-space
      emit-value
      map-options
    />

    <q-input
      v-if="model.personType === 'juridica'"
      v-model="model.businessName"
      class="f-nombre"
      label="Razón social *"
      outlined
      dense
      hide-bottom-space
    />
    <template v-else>
      <q-input
        v-model="model.firstName"
        class="f-nombre"
        label="Primer nombre *"
        outlined
        dense
        hide-bottom-space
      />
      <q-input
        v-model="model.middleName"
        class="f-segundo"
        label="Segundo nombre"
        outlined
        dense
        hide-bottom-space
      />
      <q-input
        v-model="model.lastName"
        class="f-apellido"
        label="Apellidos *"
        outlined
        dense
        hide-bottom-space
      />
    </template>

    <q-input
      v-model="model.email"
      class="f-email"
      label="Email"
      type="email"
      outlined
      dense
      hide-bottom-space
    />
    <q-input
      v-model="model.phone"
      class="f-tel"
      label="Teléfono"
      outlined
      dense
      hide-bottom-space
    />
    <q-input
      v-model="model.address"
      class="f-direccion"
      label="Dirección"
      outlined
      dense
      hide-bottom-space
    />
    <q-select
      v-model="selectedDepartment"
      class="f-depto"
      :options="departmentOptions"
      label="Departamento *"
      outlined
      dense
      hide-bottom-space
      emit-value
      map-options
      use-input
      input-debounce="200"
      :loading="loadingDepartments"
      @filter="filterDepartments"
      @update:model-value="onDepartmentChange"
    />
    <q-select
      v-model="selectedCity"
      class="f-ciudad"
      :options="cityOptions"
      label="Ciudad *"
      outlined
      dense
      hide-bottom-space
      emit-value
      map-options
      use-input
      input-debounce="200"
      :loading="loadingCities"
      :disable="!selectedDepartment"
      @filter="filterCities"
      @update:model-value="onCityChange"
    />
    <q-input
      :model-value="model.cityCode"
      class="f-dane"
      label="DANE"
      outlined
      dense
      readonly
      hide-bottom-space
      bg-color="grey-2"
    />
    <q-input
      model-value="CO"
      class="f-pais"
      label="País"
      outlined
      dense
      readonly
      hide-bottom-space
      bg-color="grey-2"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import {
  DIAN_DOCUMENT_TYPES,
  PERSON_TYPES,
  TAX_LEVEL_OPTIONS,
  isNitDocument,
  defaultPersonTypeForDocument,
  defaultTaxLevel,
} from 'src/utils/dian-client.js'
import { calcNitVerificationDigit } from 'src/utils/nit-dv.js'
import { api } from 'src/services/api.js'

const $q = useQuasar()
const model = defineModel({ type: Object, required: true })

const props = defineProps({
  dianLookupFn: {
    type: Function,
    default: null,
  },
})

const documentTypeOptions = DIAN_DOCUMENT_TYPES
const personTypeOptions = PERSON_TYPES

const departments = ref([])
const cities = ref([])
const departmentOptions = ref([])
const cityOptions = ref([])
const loadingDepartments = ref(false)
const loadingCities = ref(false)
const loadingDianLookup = ref(false)
const dianValidated = ref(false)
const selectedDepartment = ref(null)
const selectedCity = ref(null)

const isNit = computed(() => isNitDocument(model.value.documentType))

const documentNumberLabel = computed(() =>
  isNit.value ? 'NIT *' : 'Número *'
)

const canConsultDian = computed(() =>
  Boolean(model.value.documentType && String(model.value.documentNumber || '').replace(/\D/g, '').length >= 5)
)

const filteredTaxOptions = computed(() =>
  TAX_LEVEL_OPTIONS.filter(
    (o) => !o.personType || o.personType === model.value.personType || o.vat
  ).map((o) => ({ label: o.label, value: o.value }))
)

function applyDianSuggested(suggested) {
  if (!suggested) return

  if (suggested.personType === 'juridica' && suggested.businessName) {
    model.value.personType = 'juridica'
    model.value.businessName = suggested.businessName
  } else if (suggested.personType === 'natural') {
    model.value.personType = 'natural'
    if (suggested.firstName) model.value.firstName = suggested.firstName
    if (suggested.middleName != null) model.value.middleName = suggested.middleName
    if (suggested.lastName) model.value.lastName = suggested.lastName
  }

  if (suggested.email) {
    model.value.email = suggested.email
  }

  dianValidated.value = Boolean(suggested.dianValidated)
}

async function consultDian() {
  if (!canConsultDian.value) {
    $q.notify({ type: 'warning', message: 'Ingrese tipo y número de documento' })
    return
  }

  loadingDianLookup.value = true
  dianValidated.value = false
  try {
    const lookupApi = props.dianLookupFn || ((params) => api.ventas.dianClientLookup(params))
    const result = await lookupApi({
      documentType: model.value.documentType,
      documentNumber: String(model.value.documentNumber).replace(/\D/g, ''),
    })

    if (!result.found) {
      $q.notify({
        type: 'negative',
        message: result.message || 'Documento no encontrado en la base DIAN',
      })
      return
    }

    applyDianSuggested(result.suggested)
    $q.notify({
      type: 'positive',
      message: `DIAN: ${result.receiverName || 'Adquiriente encontrado'}`,
      caption: result.receiverEmail || undefined,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Error consultando DIAN' })
  } finally {
    loadingDianLookup.value = false
  }
}

onMounted(async () => {
  loadingDepartments.value = true
  try {
    departments.value = await api.catalog.departments()
    departmentOptions.value = mapDepartmentOptions(departments.value)
    await syncLocationFromModel()
  } finally {
    loadingDepartments.value = false
  }
})

function mapDepartmentOptions(list) {
  return list.map((d) => ({
    label: `${d.name} (${d.code})`,
    value: d.code,
    name: d.name,
  }))
}

function mapCityOptions(list) {
  return list.map((c) => ({
    label: `${c.name} (${c.code})`,
    value: c.code,
    name: c.name,
    departmentCode: c.departmentCode,
    departmentName: c.departmentName,
  }))
}

async function loadCities(departmentCode, search = '') {
  if (!departmentCode) {
    cities.value = []
    cityOptions.value = []
    return
  }
  loadingCities.value = true
  try {
    const params = { department: departmentCode }
    if (search) params.q = search
    cities.value = await api.catalog.cities(params)
    cityOptions.value = mapCityOptions(cities.value)
  } finally {
    loadingCities.value = false
  }
}

async function syncLocationFromModel() {
  if (model.value.departmentCode) {
    selectedDepartment.value = model.value.departmentCode
    await loadCities(model.value.departmentCode)
    if (model.value.cityCode) {
      selectedCity.value = model.value.cityCode
      if (!cityOptions.value.some((o) => o.value === model.value.cityCode)) {
        cityOptions.value.unshift({
          label: `${model.value.cityName || 'Municipio'} (${model.value.cityCode})`,
          value: model.value.cityCode,
          name: model.value.cityName,
        })
      }
    }
  }
}

function filterDepartments(val, update) {
  update(() => {
    const needle = val.toLowerCase()
    departmentOptions.value = mapDepartmentOptions(
      departments.value.filter(
        (d) => d.name.toLowerCase().includes(needle) || d.code.includes(val)
      )
    )
  })
}

function filterCities(val, update, abort) {
  if (!selectedDepartment.value) {
    update(() => {
      cityOptions.value = []
    })
    return
  }
  loadingCities.value = true
  const params = { department: selectedDepartment.value }
  if (val) params.q = val
  api.catalog
    .cities(params)
    .then((rows) => {
      update(() => {
        cities.value = rows
        cityOptions.value = mapCityOptions(rows)
        loadingCities.value = false
      })
    })
    .catch(() => {
      loadingCities.value = false
      abort()
    })
}

function onDepartmentChange(code) {
  const dept = departments.value.find((d) => d.code === code)
  model.value.departmentCode = code || ''
  model.value.departmentName = dept?.name || ''
  selectedCity.value = null
  model.value.cityCode = ''
  model.value.cityName = ''
  loadCities(code)
}

function onCityChange(code) {
  const city = cityOptions.value.find((c) => c.value === code)
  model.value.cityCode = code || ''
  model.value.cityName = city?.name || ''
  if (city?.departmentCode) {
    model.value.departmentCode = city.departmentCode
    model.value.departmentName = city.departmentName || model.value.departmentName
  }
}

function onDocumentTypeChange(type) {
  dianValidated.value = false
  model.value.personType = defaultPersonTypeForDocument(type)
  if (!isNitDocument(type)) {
    model.value.verificationDigit = ''
  } else {
    updateVerificationDigit()
  }
  syncTaxLevel()
}

function onDocumentNumberChange() {
  dianValidated.value = false
  if (isNit.value) updateVerificationDigit()
}

function onPersonTypeChange() {
  syncTaxLevel()
}

function updateVerificationDigit() {
  const dv = calcNitVerificationDigit(model.value.documentNumber)
  model.value.verificationDigit = dv != null ? String(dv) : ''
}

function syncTaxLevel() {
  const current = TAX_LEVEL_OPTIONS.find((o) => o.value === model.value.taxLevelCode)
  const matchesPerson =
    !current?.personType || current.personType === model.value.personType
  if (!matchesPerson && !current?.vat) {
    model.value.taxLevelCode = defaultTaxLevel(model.value.personType)
  }
}

watch(
  () => model.value.documentNumber,
  () => {
    if (isNit.value) updateVerificationDigit()
  }
)
</script>
