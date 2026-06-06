import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import router from './router/index.js'
import App from './App.vue'
import { useAuthStore } from '@/stores/auth.js'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1D9E75',
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
