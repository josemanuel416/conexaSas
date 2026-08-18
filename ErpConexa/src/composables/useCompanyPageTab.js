import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useCompanyPageTab(validTabs, defaultTab, onTabChange) {
  const route = useRoute()
  const router = useRouter()
  const tab = ref(validTabs.includes(route.query.tab) ? route.query.tab : defaultTab)

  watch(tab, (value) => {
    if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } })
    onTabChange?.(value)
  })

  watch(
    () => route.query.tab,
    (value) => {
      if (validTabs.includes(value) && value !== tab.value) tab.value = value
    }
  )

  return tab
}
