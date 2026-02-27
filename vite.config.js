import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    '__API_KEY__': JSON.stringify(process.env.API_KEY),
  }
})
