import { defineBoot } from '#q-app/wrappers'
import { getAuth } from 'src/utils/auth.js'
import { applyAdminTheme, applyCompanyTheme, isAdminRoute } from 'src/utils/company-theme.js'

export default defineBoot(() => {
  if (isAdminRoute()) {
    applyAdminTheme()
    return
  }
  const auth = getAuth('company')
  if (auth?.theme) {
    applyCompanyTheme(auth.theme)
  }
})
