<template>
  <div class="help-chat" :style="brandStyle">
    <q-card v-if="open" class="help-chat__panel">
      <q-bar class="help-chat__bar text-white">
        <q-icon name="menu_book" />
        <div class="q-ml-sm text-subtitle2">Ayuda Conexa</div>
        <q-space />
        <q-btn flat dense round icon="close" color="white" aria-label="Cerrar ayuda" @click="closeHelp" />
      </q-bar>

      <div class="help-chat__manual">
        <div v-if="manualLoading" class="text-grey-7">Cargando manual…</div>
        <template v-else-if="manual">
          <div class="help-chat__manual-head">
            <div>
              <div class="help-chat__title">{{ manual.title }}</div>
              <div class="text-caption text-grey-7">{{ kindLabel(manual.kind) }}</div>
            </div>
            <q-btn
              v-if="manual.video"
              unelevated
              dense
              no-caps
              icon="play_circle"
              label="Ver proceso"
              class="help-chat__watch"
              :loading="videoLoading"
              @click="toggleVideo"
            />
          </div>
          <div v-if="videoError" class="text-negative text-caption q-mb-xs">{{ videoError }}</div>
          <div class="help-chat__manual-body">
            <p
              v-for="(block, index) in manualBlocks"
              :key="index"
              :class="block.heading ? 'help-chat__heading' : 'help-chat__paragraph'"
            >
              {{ block.text }}
            </p>
          </div>
        </template>
        <div v-else class="text-grey-7">Elija un manual desde el chat.</div>
      </div>

      <q-separator />

      <q-scroll-area ref="scrollArea" class="help-chat__messages">
        <div v-for="(message, index) in messages" :key="index" class="help-chat__message" :class="`help-chat__message--${message.role}`">
          <div class="help-chat__bubble">{{ message.text }}</div>
          <div v-if="message.articles?.length" class="help-chat__sources">
            <q-btn
              v-for="article in message.articles"
              :key="article.id"
              flat
              dense
              no-caps
              class="help-chat__source"
              icon="menu_book"
              :label="article.title"
              @click="openManual(article.id)"
            />
          </div>
        </div>
        <div v-if="loading" class="help-chat__message help-chat__message--assistant">
          <div class="help-chat__bubble text-grey-7">Buscando en los manuales…</div>
        </div>
      </q-scroll-area>

      <form class="help-chat__form" @submit.prevent="ask(draft)">
        <q-input
          v-model="draft"
          dense
          outlined
          autogrow
          placeholder="Pregunte y abra el manual relacionado"
          :disable="loading"
          @keydown.enter.exact.prevent="ask(draft)"
        />
        <q-btn round unelevated icon="send" type="submit" class="help-chat__send" :disable="loading || draft.trim().length < 3" aria-label="Enviar pregunta" />
      </form>
    </q-card>

    <q-btn
      v-else
      round
      unelevated
      icon="help"
      size="lg"
      class="help-chat__fab"
      aria-label="Ayuda"
      @click="openHelp(helpTopicId)"
    />

    <q-dialog v-model="videoOpen">
      <q-card class="help-video-dialog" :style="brandStyle">
        <q-bar class="help-video-dialog__bar text-white">
          <q-icon name="play_circle" />
          <div class="q-ml-sm ellipsis">{{ manual?.title || 'Proceso' }}</div>
          <q-space />
          <q-btn flat dense round icon="close" color="white" aria-label="Cerrar video" v-close-popup />
        </q-bar>
        <video
          v-if="videoSrc"
          class="help-video-dialog__player"
          :src="videoSrc"
          controls
          autoplay
          playsinline
          @error="onVideoError"
        />
        <div v-else class="help-video-dialog__waiting">Cargando video…</div>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { api } from 'src/services/api.js'
import { CONEXASOFT_BRAND } from 'src/config/conexasoft-brand.js'
import { useHelpChat } from 'src/composables/useHelpChat.js'
import { resolveHelpTopic } from 'src/utils/help-topics.js'

const brandStyle = {
  '--help-primary': CONEXASOFT_BRAND.primary,
  '--help-secondary': CONEXASOFT_BRAND.secondary,
  '--help-accent': CONEXASOFT_BRAND.accent,
  '--help-fill': '#E3F2FD',
  '--help-border': '#90CAF9',
}

const route = useRoute()
const { open, manualId, openHelp, openManual, closeHelp } = useHelpChat()
const helpTopicId = computed(() => resolveHelpTopic(route.path, route.query.tab) || 'mod-inicio')
const draft = ref('')
const loading = ref(false)
const manualLoading = ref(false)
const manual = ref(null)
const videoSrc = ref('')
const videoOpen = ref(false)
const videoLoading = ref(false)
const videoError = ref('')
const scrollArea = ref(null)
const messages = ref([
  {
    role: 'assistant',
    text: 'Arriba está el manual de esta pantalla. Pregunte por otro módulo o proceso y abra su manual con el enlace.',
    articles: [],
  },
])

const manualBlocks = computed(() => {
  const text = String(manual.value?.manual || '')
  return text.split('\n').filter((line) => line.trim()).map((line) => ({
    heading: line.startsWith('## '),
    text: line.startsWith('## ') ? line.slice(3) : line,
  }))
})

watch(manualId, (id) => {
  if (open.value && id) loadManual(id)
}, { immediate: true })

watch(open, (isOpen) => {
  if (isOpen && manualId.value) loadManual(manualId.value)
})

watch(messages, () => {
  nextTick(() => {
    scrollArea.value?.setScrollPosition?.('vertical', 99999, 200)
  })
}, { deep: true })

function kindLabel(kind) {
  return { modulo: 'Manual del módulo', proceso: 'Manual del proceso', diccionario: 'Diccionario de datos' }[kind] || 'Manual'
}

function releaseVideo() {
  videoSrc.value = ''
  videoOpen.value = false
  videoLoading.value = false
  videoError.value = ''
}

function onVideoError(event) {
  const code = event?.target?.error?.code
  if (!code) return
  videoError.value = 'No se pudo reproducir el video del proceso'
}

async function toggleVideo() {
  videoError.value = ''
  if (!manual.value?.id || videoLoading.value) return
  videoLoading.value = true
  videoOpen.value = true
  try {
    const data = await api.ayuda.prepararVideo(manual.value.id)
    videoSrc.value = data.src
  } catch (error) {
    videoOpen.value = false
    videoError.value = error.message || 'No se pudo abrir el video del proceso'
  } finally {
    videoLoading.value = false
  }
}

async function loadManual(id) {
  if (!id || manual.value?.id === id) return
  releaseVideo()
  manualLoading.value = true
  try {
    manual.value = await api.ayuda.manual(id)
  } catch (error) {
    manual.value = {
      id,
      title: 'Manual no disponible',
      kind: 'proceso',
      manual: error.message || 'No se pudo abrir el manual.',
    }
  } finally {
    manualLoading.value = false
  }
}

async function ask(question) {
  const text = String(question || '').trim()
  if (text.length < 3 || loading.value) return
  messages.value.push({ role: 'user', text, articles: [] })
  draft.value = ''
  loading.value = true
  try {
    const result = await api.ayuda.consultar(text)
    messages.value.push({
      role: 'assistant',
      text: result.answer,
      articles: result.articles || [],
    })
  } catch (error) {
    messages.value.push({
      role: 'assistant',
      text: error.message || 'No se pudo consultar la ayuda.',
      articles: [],
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.help-chat {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 3000;
}

.help-chat__fab,
.help-chat__send {
  background: var(--help-secondary) !important;
  color: #fff !important;
}

.help-chat__fab {
  box-shadow: 0 8px 24px rgba(13, 71, 161, 0.35);
}

.help-chat__panel {
  position: absolute;
  right: 0;
  bottom: 68px;
  width: min(440px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--help-border);
  box-shadow: 0 16px 40px rgba(13, 71, 161, 0.22);
}

.help-chat__bar,
.help-video-dialog__bar {
  background: var(--help-secondary);
  border-bottom: 3px solid var(--help-accent);
}

.help-chat__manual-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.help-chat__title {
  color: var(--help-secondary);
  font-weight: 700;
  line-height: 1.3;
}

.help-chat__watch {
  flex: 0 0 auto;
  background: var(--help-primary) !important;
  color: #fff !important;
}

.help-video-dialog {
  width: min(920px, 94vw);
  max-width: 94vw;
  background: #041428;
}

.help-video-dialog__player {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 78vh;
  background: #000;
  object-fit: contain;
}

.help-video-dialog__waiting {
  color: #fff;
  padding: 28px 16px;
  text-align: center;
}

.help-chat__manual {
  max-height: 46%;
  overflow: auto;
  padding: 12px 14px 8px;
  background: #fff;
}

.help-chat__heading {
  margin: 8px 0 2px;
  font-weight: 700;
  color: var(--help-secondary);
}

.help-chat__paragraph {
  margin: 0 0 6px;
  line-height: 1.4;
  font-size: 0.9rem;
}

.help-chat__messages {
  flex: 1 1 auto;
  height: 0;
  background: var(--help-fill);
}

.help-chat__message {
  padding: 10px 12px 0;
}

.help-chat__bubble {
  white-space: pre-wrap;
  border-radius: 12px;
  padding: 10px 12px;
  line-height: 1.4;
  font-size: 0.92rem;
}

.help-chat__message--assistant .help-chat__bubble {
  background: #fff;
  border: 1px solid var(--help-border);
}

.help-chat__message--user {
  display: flex;
  justify-content: flex-end;
}

.help-chat__message--user .help-chat__bubble {
  background: var(--help-primary);
  color: #fff;
  max-width: 85%;
}

.help-chat__sources {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-top: 4px;
}

.help-chat__source {
  color: var(--help-secondary) !important;
}

.help-chat__form {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 10px 12px 12px;
  background: #fff;
  border-top: 1px solid var(--help-border);
}
</style>
