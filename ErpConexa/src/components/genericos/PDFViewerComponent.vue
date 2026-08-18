<template>
  <div>
    <div v-if="!hideButtonView">
      <q-btn round color="primary" icon="print" @click="openDialog">
        <q-tooltip>Imprimir</q-tooltip>
      </q-btn>
    </div>

    <q-dialog
      :model-value="dialogOpen"
      :maximized="maximized"
      transition-show="flip-down"
      transition-hide="flip-up"
      full-width
      @update:model-value="onDialogUpdate"
    >
      <q-card class="bg-grey-9 text-white pdf-viewer-card" :class="{ 'pdf-viewer-card--maximized': maximized }">
        <q-bar class="bg-primary pdf-viewer-titlebar">
          <q-icon v-if="titleIcon" :name="titleIcon" class="q-mr-sm" />
          <div v-if="title" class="text-subtitle2 q-mr-md">{{ title }}</div>

          <q-btn-toggle
            v-model="viewMode"
            push
            glossy
            no-caps
            toggle-color="secondary"
            :options="[
              { label: 'Paginado', value: 'paged', icon: 'article' },
              { label: 'Scroll', value: 'scroll', icon: 'view_agenda' },
            ]"
            dense
          >
            <q-tooltip>Cambiar modo de visualización</q-tooltip>
          </q-btn-toggle>

          <q-separator vertical inset class="q-mx-sm" />

          <q-breadcrumbs
            v-if="numPages && viewMode === 'paged'"
            active-color="white"
            style="font-size: 16px"
          >
            <q-breadcrumbs-el :label="String(currentPage)" icon="description" />
            <q-breadcrumbs-el :label="String(numPages)" />
          </q-breadcrumbs>

          <div v-if="numPages && viewMode === 'scroll'" class="text-white text-body2">
            <q-icon name="description" size="sm" class="q-mr-xs" />
            {{ numPages }} {{ numPages === 1 ? 'página' : 'páginas' }}
          </div>

          <q-btn-group v-if="viewMode === 'paged'" push class="q-ml-sm">
            <q-btn text-color="white" icon="keyboard_arrow_up" :disable="!previousValid" @click="currentPage--" />
            <q-btn text-color="white" icon="keyboard_arrow_down" :disable="!nextValid" @click="currentPage++" />
          </q-btn-group>

          <q-separator vertical inset class="q-mx-sm" />

          <q-btn-group push>
            <q-btn text-color="white" icon="zoom_in" @click="scale += 0.1">
              <q-tooltip>Acercar</q-tooltip>
            </q-btn>
            <q-btn text-color="white" icon="zoom_out" :disable="scale <= 0.4" @click="scale -= 0.1">
              <q-tooltip>Alejar</q-tooltip>
            </q-btn>
          </q-btn-group>

          <q-separator v-if="numPages" vertical inset class="q-mx-sm" />

          <q-input
            v-if="numPages"
            v-model.number="gotoPageInput"
            type="number"
            label="Ir a pág."
            dense
            dark
            outlined
            input-class="text-center text-white"
            label-color="white"
            style="width: 100px"
            :min="1"
            :max="numPages"
            @keyup.enter="goToPage(gotoPageInput)"
            @change="goToPage(gotoPageInput)"
          >
            <template #prepend>
              <q-icon name="description" color="white" size="xs" />
            </template>
            <q-tooltip>Ir a página específica (Enter)</q-tooltip>
          </q-input>

          <q-space />

          <q-btn v-if="!hideButtonDownload" flat round dense icon="save_alt" :disable="!hasDocument" @click="download">
            <q-tooltip>Descargar</q-tooltip>
          </q-btn>

          <q-btn v-if="!hideButtonPrint" flat round dense icon="print" :disable="!hasDocument" @click="print">
            <q-tooltip>Imprimir</q-tooltip>
          </q-btn>

          <q-btn dense flat icon="close" @click="closeDialog">
            <q-tooltip>Cerrar</q-tooltip>
          </q-btn>
        </q-bar>

        <q-card-section v-if="isInitialLoading || waitingForDocument" class="text-center q-pa-xl">
          <q-spinner-ball color="white" size="2em" />
        </q-card-section>

        <q-card-section v-else-if="error" class="text-center text-negative q-pa-lg">
          {{ error }}
        </q-card-section>

        <q-card-section v-else-if="viewMode === 'paged'" class="text-center pdf-viewer-pages">
          <div class="q-pa-xs">
            <div class="text-caption text-grey-4">Página {{ currentPage }} de {{ numPages || '—' }}</div>
            <canvas :id="viewerId" class="pdf-viewer-canvas" />
          </div>
        </q-card-section>

        <q-card-section
          v-else-if="viewMode === 'scroll'"
          class="text-center q-pa-none pdf-viewer-scroll-section"
        >
          <q-scroll-area class="pdf-viewer-scroll-area">
            <div v-for="pageNum in numPages" :key="pageNum" class="q-pa-xs">
              <div class="text-caption text-grey-4">Página {{ pageNum }} de {{ numPages }}</div>
              <canvas :id="`${viewerId}-page-${pageNum}`" class="pdf-viewer-canvas" />
            </div>
          </q-scroll-area>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { uid, useQuasar } from 'quasar'
import pdfjsLib from 'src/utils/pdfjs-setup'
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  document: { default: null },
  documentName: { type: String, default: 'documento' },
  title: { type: String, default: '' },
  titleIcon: { type: String, default: 'picture_as_pdf' },
  hideButtonView: { type: Boolean, default: true },
  hideButtonPrint: { type: Boolean, default: false },
  hideButtonDownload: { type: Boolean, default: false },
  escalaInicial: { type: Number, default: 1.5 },
  modeView: { type: String, default: 'scroll' },
  maximized: { type: Boolean, default: false },
  beforeAction: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue', 'print', 'download', 'close'])

const $q = useQuasar()
const viewerId = ref(`pdf-viewer-${uid()}`)
const dialogOpen = ref(false)
const scale = ref(props.escalaInicial)
const pdf = shallowRef(null)
const docBlob = ref(null)
const objectUrl = ref(null)
const loadingTask = shallowRef(null)
const numPages = ref(null)
const currentPage = ref(1)
const loading = ref(false)
const error = ref('')
const viewMode = ref(props.modeView)
const gotoPageInput = ref(1)
let loadToken = 0
let printFrame = null

const previousValid = computed(() => currentPage.value > 1)
const nextValid = computed(() => currentPage.value < numPages.value)
const hasDocument = computed(() => Boolean(docBlob.value))
const waitingForDocument = computed(() => dialogOpen.value && !docBlob.value && !error.value)
const isInitialLoading = computed(() => loading.value && !pdf.value)
const canUsePrintShortcut = computed(() => !props.hideButtonPrint || !props.hideButtonDownload)

watch(
  () => props.modelValue,
  (visible) => {
    dialogOpen.value = visible
    if (visible) {
      loadDocument()
    } else {
      teardownViewer()
    }
  },
  { immediate: true }
)

watch(
  () => props.document,
  () => {
    if (dialogOpen.value) loadDocument()
  }
)

watch(
  () => currentPage.value,
  (page) => {
    if (viewMode.value === 'paged') renderPage()
    gotoPageInput.value = page
  }
)

watch(
  () => scale.value,
  async () => {
    if (!pdf.value) return
    if (viewMode.value === 'paged') {
      await renderPage()
    } else {
      await renderAllPages()
    }
  }
)

watch(
  () => viewMode.value,
  async (mode) => {
    if (!pdf.value) return
    await nextTick()
    if (mode === 'scroll') {
      await renderAllPages()
    } else {
      await renderPage()
    }
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handlePrintShortcut, { capture: true })
  printFrame?.remove()
  printFrame = null
  teardownViewer()
})

function onDialogUpdate(value) {
  dialogOpen.value = value
  emit('update:modelValue', value)
  if (!value) emit('close')
}

function openDialog() {
  onDialogUpdate(true)
}

function closeDialog() {
  onDialogUpdate(false)
}

async function runBeforeAction(action) {
  if (typeof props.beforeAction !== 'function') return true
  try {
    const result = await props.beforeAction(action)
    return result !== false
  } catch (err) {
    console.error('[PDFViewer] beforeAction:', err)
    return false
  }
}

async function resolveDocumentBlob(document) {
  if (!document) return null
  if (document instanceof Blob) return document
  if (document instanceof ArrayBuffer) return new Blob([document], { type: 'application/pdf' })
  if (document instanceof Uint8Array) return new Blob([document], { type: 'application/pdf' })
  if (typeof document === 'string' && document.startsWith('data:')) {
    const response = await fetch(document)
    return response.blob()
  }
  throw new Error('Formato de documento no soportado')
}

function revokeObjectUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
}

function teardownViewer() {
  loadToken += 1
  window.removeEventListener('keydown', handlePrintShortcut, { capture: true })
  loadingTask.value?.destroy?.()
  loadingTask.value = null
  pdf.value = null
  docBlob.value = null
  numPages.value = null
  currentPage.value = 1
  gotoPageInput.value = 1
  error.value = ''
  loading.value = false
  revokeObjectUrl()
}

async function loadDocument() {
  if (!props.document) {
    loading.value = true
    error.value = ''
    return
  }

  const token = ++loadToken
  error.value = ''
  loading.value = true
  pdf.value = null
  numPages.value = null
  revokeObjectUrl()

  try {
    docBlob.value = await resolveDocumentBlob(props.document)
    if (token !== loadToken || !docBlob.value) return

    const arrayBuffer = await docBlob.value.arrayBuffer()
    if (token !== loadToken) return

    const task = pdfjsLib.getDocument({ data: arrayBuffer })
    loadingTask.value = task
    const loadedPdf = await task.promise
    if (token !== loadToken) return

    pdf.value = markRaw(loadedPdf)
    numPages.value = loadedPdf.numPages
    currentPage.value = 1
    gotoPageInput.value = 1
    viewMode.value = props.modeView

    window.addEventListener('keydown', handlePrintShortcut, { capture: true })

    loading.value = false
    await nextTick()

    if (viewMode.value === 'paged') {
      await renderPage()
    } else {
      await renderAllPages()
    }
  } catch (err) {
    if (token !== loadToken) return
    error.value = err.message || 'No se pudo cargar el PDF'
    $q.notify({ type: 'negative', message: error.value })
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function renderPage() {
  if (!pdf.value) return
  await nextTick()
  try {
    const page = await pdf.value.getPage(currentPage.value)
    const viewport = page.getViewport({ scale: scale.value })
    const canvas = document.getElementById(viewerId.value)
    if (!canvas) return
    const context = canvas.getContext('2d')
    canvas.height = viewport.height
    canvas.width = viewport.width
    await page.render({ canvasContext: context, viewport }).promise
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Error al renderizar la página' })
  }
}

async function renderAllPages() {
  if (!pdf.value || !numPages.value) return
  await nextTick()
  try {
    for (let pageNum = 1; pageNum <= pdf.value.numPages; pageNum += 1) {
      const page = await pdf.value.getPage(pageNum)
      const viewport = page.getViewport({ scale: scale.value })
      const canvas = document.getElementById(`${viewerId.value}-page-${pageNum}`)
      if (!canvas) continue
      const context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width
      await page.render({ canvasContext: context, viewport }).promise
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Error al renderizar páginas' })
  }
}

function goToPage(pageNumber) {
  if (!pageNumber || pageNumber < 1 || pageNumber > numPages.value) {
    $q.notify({
      type: 'warning',
      message: `Ingrese un número de página válido (1-${numPages.value})`,
    })
    gotoPageInput.value = currentPage.value
    return
  }

  if (viewMode.value === 'paged') {
    currentPage.value = pageNumber
    return
  }

  const canvasElement = document.getElementById(`${viewerId.value}-page-${pageNumber}`)
  const parentDiv = canvasElement?.parentElement
  const scrollArea = parentDiv?.closest('.q-scrollarea__container')
  if (scrollArea && parentDiv) {
    const scrollAreaRect = scrollArea.getBoundingClientRect()
    const parentRect = parentDiv.getBoundingClientRect()
    scrollArea.scrollTo({
      top: (parentRect.top - scrollAreaRect.top) + scrollArea.scrollTop,
      behavior: 'smooth',
    })
  } else {
    parentDiv?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function collectPrintCanvases() {
  if (viewMode.value === 'paged') {
    const canvas = document.getElementById(viewerId.value)
    return canvas ? [canvas] : []
  }

  const canvases = []
  for (let pageNum = 1; pageNum <= numPages.value; pageNum += 1) {
    const canvas = document.getElementById(`${viewerId.value}-page-${pageNum}`)
    if (canvas) canvases.push(canvas)
  }
  return canvases
}

function getPrintFrame() {
  if (!printFrame) {
    printFrame = document.createElement('iframe')
    printFrame.setAttribute('aria-hidden', 'true')
    printFrame.title = 'Impresión'
    printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(printFrame)
  }
  return printFrame
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printCanvases(canvases) {
  const iframe = getPrintFrame()
  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) {
    $q.notify({ type: 'negative', message: 'No se pudo abrir el diálogo de impresión' })
    return
  }

  const printTitle = props.documentName || props.title || 'Documento'
  const pages = canvases
    .map((canvas) => `<img src="${canvas.toDataURL('image/png')}" alt="Página" />`)
    .join('')

  doc.open()
  doc.write(`<!DOCTYPE html>
<html><head><title>${escapeHtml(printTitle)}</title>
<style>
  @page { margin: 8mm; }
  body { margin: 0; background: #fff; }
  img { display: block; width: 100%; page-break-after: always; }
  img:last-child { page-break-after: auto; }
</style></head><body>${pages}</body></html>`)
  doc.close()

  const win = iframe.contentWindow
  if (!win) {
    $q.notify({ type: 'negative', message: 'No se pudo abrir el diálogo de impresión' })
    return
  }

  let done = false
  const finish = () => {
    if (done) return
    done = true
    try {
      doc.open()
      doc.write('')
      doc.close()
    } catch {
      /* noop */
    }
  }

  win.focus()
  win.addEventListener('afterprint', finish, { once: true })
  win.print()
  setTimeout(finish, 3000)
}

async function print() {
  const canContinue = await runBeforeAction('print')
  if (!canContinue || !docBlob.value || !pdf.value) return

  if (viewMode.value === 'paged') {
    await renderPage()
  } else {
    await renderAllPages()
  }
  await nextTick()

  const canvases = collectPrintCanvases()
  if (!canvases.length) {
    $q.notify({ type: 'warning', message: 'No hay páginas para imprimir' })
    return
  }

  emit('print')
  printCanvases(canvases)
}

function handlePrintShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key?.toLowerCase() !== 'p') return
  if (!dialogOpen.value || !canUsePrintShortcut.value) return
  event.preventDefault()
  print()
}

async function download() {
  const canContinue = await runBeforeAction('download')
  if (!canContinue || !docBlob.value) return

  let documentName = props.documentName || 'documento'
  if (!documentName.toLowerCase().endsWith('.pdf')) documentName += '.pdf'

  const url = URL.createObjectURL(docBlob.value)
  const link = document.createElement('a')
  link.href = url
  link.download = documentName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  emit('download')
  $q.notify({ type: 'positive', message: `Descargado ${documentName}` })
}

defineExpose({
  openDialog,
  closeDialog,
  print,
  download,
})
</script>

<style scoped>
.pdf-viewer-titlebar {
  position: sticky;
  top: 0;
  z-index: 10;
}

.pdf-viewer-card--maximized {
  width: 100vw;
  height: 100vh;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
}

.pdf-viewer-scroll-section {
  flex: 1;
  min-height: 0;
  height: auto;
}

.pdf-viewer-scroll-area {
  height: 100%;
  width: 100%;
}

.pdf-viewer-pages {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.pdf-viewer-canvas {
  display: inline-block;
  max-width: calc(100vw - 48px);
  height: auto;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
</style>
