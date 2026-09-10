import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** מזהה בנייה — כל מכשיר משווה אותו למה שמוגש ומתעדכן לבד כשיש חדש */
const BUILD = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
const buildMeta = () => ({
  name: 'build-meta',
  transformIndexHtml(html: string) {
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta name="build" content="${BUILD}" />`)
  },
})

export default defineConfig({
  // נתיבים יחסיים — כדי שהאתר יעבוד גם תחת תת־תיקייה (GitHub Pages)
  base: './',
  plugins: [react(), viteSingleFile(), buildMeta()],
  build: {
    outDir: 'docs',        // GitHub Pages מוגש מהתיקייה הזו
    // לא מרוקנים: docs/news מתעדכן ישירות במאגר על ידי סוכן הבוקר,
    // ובנייה מקומית לא צריכה למחוק אותו
    emptyOutDir: false,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000,
    reportCompressedSize: false,
  },
})
