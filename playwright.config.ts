import { defineConfig, devices } from '@playwright/test'

// בדיקות קצה־לקצה מול שרת הפיתוח. שני פרופילים: מחשב וטלפון.
// הרשת החיצונית חסומה בבדיקות (ראו tests/e2e/fixtures.ts) — שום קריאה ל-GitHub האמיתי.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // ה-SW עוקף את page.route ומגיע לרשת האמיתית — בבדיקות הוא חסום
    serviceWorkers: 'block',
  },
  // בדיקות הטלפון מניחות ניווט תחתון, בדיקות המחשב מניחות סרגל צד — כל פרופיל מריץ את שלו
  projects: [
    { name: 'desktop', testIgnore: /[\/]mobile[\/]/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testIgnore: /[\/]desktop[\/]/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
