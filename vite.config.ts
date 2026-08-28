import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  // נתיבים יחסיים — כדי שהאתר יעבוד גם תחת תת־תיקייה (GitHub Pages)
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'docs',        // GitHub Pages מוגש מהתיקייה הזו
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000,
    reportCompressedSize: false,
  },
})
