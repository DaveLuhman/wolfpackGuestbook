import { defineConfig } from 'vite'
import tauri from 'vite-plugin-tauri'

export default defineConfig({
  plugins: [tauri()]
})
