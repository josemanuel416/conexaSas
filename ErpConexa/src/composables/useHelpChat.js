import { ref } from 'vue'

const open = ref(false)
const topicId = ref(null)
const manualId = ref(null)

export function useHelpChat() {
  function openHelp(id) {
    topicId.value = id || null
    manualId.value = id || null
    open.value = true
  }

  function openManual(id) {
    manualId.value = id
    open.value = true
  }

  function closeHelp() {
    open.value = false
  }

  return {
    open,
    topicId,
    manualId,
    openHelp,
    openManual,
    closeHelp,
  }
}
