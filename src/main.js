import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import '@/styles/utilities.css'
import router from './router/index.js'
import App from './App.vue'
import { useAuthStore } from '@/stores/auth.js'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#CE1124',
          'primary-darken-1': '#9A0B1A',
          background: '#FFFFFF',
          surface: '#FFFFFF',
        },
      },
    },
  },
})

const app = createApp(App)
app.use(createPinia())
useAuthStore().startAuthListener()
app.use(router)
app.use(vuetify)
app.mount('#app')
navigator.storage?.persist?.()

