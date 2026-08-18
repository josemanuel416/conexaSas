import { ref, reactive, watch } from 'vue'

export function useExpandableRows(fetchDetail, { onError } = {}) {
  const expanded = ref([])
  const detailCache = reactive({})
  const detailLoading = reactive({})

  async function loadDetailIfNeeded(id) {
    if (!id || detailCache[id] || detailLoading[id]) return
    detailLoading[id] = true
    try {
      detailCache[id] = await fetchDetail(id)
    } catch (e) {
      onError?.(e)
    } finally {
      detailLoading[id] = false
    }
  }

  watch(expanded, (ids) => {
    for (const id of ids) loadDetailIfNeeded(id)
  })

  function toggleRowExpand(id) {
    const idx = expanded.value.indexOf(id)
    if (idx >= 0) expanded.value.splice(idx, 1)
    else expanded.value.push(id)
  }

  function setExpanded(val) {
    expanded.value = val
  }

  return {
    expanded,
    detailCache,
    detailLoading,
    toggleRowExpand,
    setExpanded,
    loadDetailIfNeeded,
  }
}
