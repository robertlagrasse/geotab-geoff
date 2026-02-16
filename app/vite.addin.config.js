import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Build the add-in as a single IIFE bundle (synchronous, no ES modules)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-addin',
    lib: {
      entry: resolve(__dirname, 'src/addin.jsx'),
      formats: ['iife'],
      name: 'GeoffAddin',
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'addin.[ext]',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
