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
    if (expanded.value.includes(id)) {
      expanded.value = expanded.value.filter((key) => key !== id)
    } else {
      expanded.value = [...expanded.value, id]
    }
  }

  function setExpanded(val) {
    expanded.value = val
  }

  function invalidateDetail(id) {
    delete detailCache[id]
  }

  return {
    expanded,
    detailCache,
    detailLoading,
    toggleRowExpand,
    setExpanded,
    loadDetailIfNeeded,
    invalidateDetail,
  }
}
