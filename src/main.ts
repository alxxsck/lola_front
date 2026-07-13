import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css'
import '@/app/styles/main.css'
import App from './App.vue'
import { router } from '@/app/router'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: Aura,
      options: { darkModeSelector: '.lola-dark', cssLayer: false },
    },
  })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#app')
