# Test charter — shared context for the QA agents

Project: `C:\Users\user\Desktop\ניהול זמן` — "מערכת ההפעלה", a Hebrew RTL personal time-management PWA.
Stack: Vite 6 + React 18 + TypeScript, no UI library, single-file build into `docs/`. Read `README.md` first (it documents every feature, the sync design, Atlas, and the design system).

Key source files: `src/store.ts` (state, actions, merge logic), `src/types.ts`, `src/dates.ts` (logical day starts 03:30), `src/cloud.ts` (encrypted gist sync), `src/crypto.ts`, `src/atlas.ts` (Atlas transport + command application + undo), `src/ai.ts` (context/pulse/digest builders), `src/push.ts` + `scripts/notify-send.mjs` (phone notifications, Atlas reminders and deep-block check-in), `src/insights.ts`, `src/views/*.tsx` (Today, Atlas, CalendarView, Projects, Review, Settings, Workout, NewsCard, FocusTimer), `src/styles.css`, `src/App.tsx` (navigation: 5 tabs היום·אטלס·יומן·פרויקטים·סקירה + settings gear; keys 1–6).

## Harness (already installed and verified)
- Unit: `npx vitest run` — tests in `tests/unit/**/*.test.ts`, jsdom environment. Import from `../../src/...`. `src/store.ts` reads `localStorage['life-os-v1']` at import time and keeps a module singleton (`store`); use `vi.resetModules()` + dynamic `import()` when you need a fresh instance (e.g. to simulate two devices). Data key: `life-os-v1`.
- E2E: `npx playwright test [file] --project=desktop|mobile --reporter=line` — tests in `tests/e2e/*.spec.ts`, use `import { test, expect, readState } from './fixtures'` (the `app` fixture opens `/` on the dev server with all external network blocked and fails the test on any console error / page error). Dev server auto-starts on port 5173 and is shared. A fresh browser context has no credentials, so cloud sync is `off` — that is intended. To seed state: `page.addInitScript(() => localStorage.setItem('life-os-v1', JSON.stringify(...)))` before `goto`, or drive the UI.
- Traces/screenshots on failure land in `test-results/`.

## Hard rules
1. **Never** run `git push`, never create commits, never touch `.github/`, never call any real network (GitHub, gist, claude.ai). Never use real tokens. Everything runs against localhost with mocked responses.
2. **Do not edit files under `src/`** (several agents work in parallel; the orchestrator applies fixes). If you find a bug, write a precise report with a proposed patch (exact file, old/new code) instead.
3. Write your tests under the directory named in your assignment only. Tests you add must be deterministic and pass against correct behaviour; a failing test that documents a real bug is fine — mark it with `test.fixme(...)` after you confirmed it is a genuine defect, and describe it in the report.
4. Your deliverable is a report at `tests/reports/<your-name>.md` (in Hebrew or English, precise, with severity: critical / major / minor / cosmetic), plus your test files. Start the report with a one-paragraph summary and a table of findings. Include reproduction steps, expected vs actual, and the proposed patch.
5. Be genuinely rigorous: simulate real usage, edge cases, empty states, boundaries (midnight/03:30, month ends, RTL/LTR numbers, long text, zero tracks, many items), race conditions, reloads mid-flow, dark mode, both viewports. "It renders" is not a pass — verify data actually changed where it should, in every screen that shows it.
