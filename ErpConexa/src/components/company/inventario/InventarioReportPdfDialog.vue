<template>
  <PDFViewerComponent
    :model-value="modelValue"
    :document="pdfBlob"
    :document-name="pdfFilename"
    :title="title"
    title-icon="picture_as_pdf"
    hide-button-view
    maximized
    mode-view="scroll"
    @update:model-value="emit('update:modelValue', $event)"
    @close="onClose"
  />
</template>

<script setup>
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import PDFViewerComponent from 'src/components/genericos/PDFViewerComponent.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Informe de inventario' },
  loader: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue'])

const $q = useQuasar()
const pdfBlob = ref(null)
const pdfFilename = ref('')
let loadToken = 0

watch(
  () => [props.modelValue, props.loader],
  ([visible, loader]) => {
    if (visible && typeof loader === 'function') {
      loadPdf(loader)
    } else if (!visible) {
      cleanup()
    }
  },
)

function onClose() {
  cleanup()
}

function cleanup() {
  loadToken += 1
  pdfBlob.value = null
  pdfFilename.value = ''
}

async function loadPdf(loader) {
  const token = ++loadToken
  pdfBlob.value = null
  pdfFilename.value = ''

  try {
    const result = await loader()
    if (token !== loadToken) return
    pdfBlob.value = result.blob
    pdfFilename.value = result.filename
  } catch (e) {
    if (token !== loadToken) return
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar el PDF' })
    emit('update:modelValue', false)
  }
}
</script>
