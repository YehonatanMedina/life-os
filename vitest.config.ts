import { defineConfig } from 'vitest/config'

// בדיקות יחידה על הלוגיקה — חנות, מיזוג, תאריכים, אטלס, מנגנון ההתראות.
// jsdom כי המודולים נוגעים ב-localStorage ו-window.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    restoreMocks: true,
  },
})
