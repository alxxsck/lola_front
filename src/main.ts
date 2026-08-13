import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import 'primeicons/primeicons.css';
import '@/app/styles/theme.css';
import '@/app/styles/main.css';
import App from './App.vue';
import { router } from '@/app/router';
import { RetenivePrimePreset } from '@/app/theme/retenive-prime-preset';
import { primeVueRussianLocale } from '@/app/primevue-ru';
import { initializeTheme } from '@/shared/theme/theme';
import { registerSupportNotificationLogoutCleanup } from '@/features/support-notifications/model/support-notification-logout';

initializeTheme();
registerSupportNotificationLogoutCleanup();

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, {
    locale: primeVueRussianLocale,
    theme: {
      preset: RetenivePrimePreset,
      options: { darkModeSelector: '.retenive-dark', cssLayer: false },
    },
  })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#app');
