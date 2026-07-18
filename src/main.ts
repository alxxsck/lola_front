import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import 'primeicons/primeicons.css'
import '@/app/styles/theme.css'
import '@/app/styles/main.css'
import App from './App.vue'
import { router } from '@/app/router'
import { LolaPrimePreset } from '@/app/theme/lola-prime-preset'
import { initializeTheme } from '@/shared/theme/theme'

initializeTheme()

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: LolaPrimePreset,
      options: { darkModeSelector: '.lola-dark', cssLayer: false },
    },
  })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#app')
