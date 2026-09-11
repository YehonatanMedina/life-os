// ---------------------------------------------------------------------------
// GitHub מזויף בזיכרון — מותקן לכל הקשר דפדפן דרך context.route.
// שום בקשה לא יוצאת החוצה: הכל נענה כאן.
//
//   GET   /user                                  -> { login }
//   GET   /gists/:id                             -> הגיסט (files -> content)
//   PATCH /gists/:id                             -> מיזוג הקבצים + רישום ביומן patches
//   POST  /gists                                 -> יצירת גיסט (מחזיר את המזהה הקבוע)
//   GET   /repos/:owner/life-os-atlas/contents/:f -> raw / 304 לפי ETag / 404
//   PUT   /repos/:owner/life-os-atlas/contents/:f -> כתיבה עם sha (409 אם ישן), רישום ב-writes
//   POST  /repos/:owner/life-os-atlas/issues     -> שומר את הגוף, מחזיר 201
//
// hooks: פונקציות שמקבלות את הבקשה ויכולות להחזיר תשובה חלופית (401, 409, 500)
// או השהיה — כדי לדמות כשלים לכל מכשיר (tag) בנפרד.
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto'
import type { BrowserContext, Route } from '@playwright/test'

export type ReqInfo = {
  tag: string
  method: string
  path: string
  headers: Record<string, string>
  body?: string
}

export type Override =
  | { status: number; body?: string; headers?: Record<string, string> }
  | { delayMs: number }
  | undefined
  | void

export type Hook = (info: ReqInfo) => Override | Promise<Override>

export type Patch = { tag: string; at: number; files: Record<string, string> }
export type Issue = { tag: string; number: number; title: string; body: string; at: number }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'etag, x-ratelimit-remaining',
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex')

export class FakeGithub {
  gistId = 'g1a2b3c4d5e6f7a8b9c0'
  login = 'tester'
  /** קבצי הגיסט: שם -> תוכן גלוי (המצב עצמו מגיע מוצפן מהאפליקציה) */
  files: Record<string, string> = {}
  patches: Patch[] = []
  /** קבצי המאגר של אטלס */
  repo = new Map<string, { text: string; etag: string }>()
  issues: Issue[] = []
  /** כתיבות של האפליקציה לקובצי המאגר (המסלול המהיר כותב thread.json / memory.json) */
  writes: Array<{ tag: string; name: string; at: number; message: string }> = []
  requests: Array<{ tag: string; method: string; path: string; at: number; status: number }> = []
  hooks: Hook[] = []
  private issueSeq = 100

  setGistFile(name: string, content: string) {
    this.files[name] = content
  }
  setRepoFile(name: string, text: string) {
    this.repo.set(name, { text, etag: `W/"${sha(text)}"` })
  }
  deleteRepoFile(name: string) {
    this.repo.delete(name)
  }
  /** כל הטלאים שנגעו בקובץ מסוים */
  patchesWith(name: string): Patch[] {
    return this.patches.filter((p) => name in p.files)
  }
  patchesFrom(tag: string): Patch[] {
    return this.patches.filter((p) => p.tag === tag)
  }
  requestsMatching(re: RegExp, tag?: string) {
    return this.requests.filter((r) => re.test(`${r.method} ${r.path}`) && (!tag || r.tag === tag))
  }

  private gistJSON() {
    const files: Record<string, unknown> = {}
    for (const [name, content] of Object.entries(this.files)) {
      files[name] = {
        filename: name,
        type: 'application/json',
        language: 'JSON',
        raw_url: `https://gist.githubusercontent.com/${this.login}/${this.gistId}/raw/${name}`,
        size: content.length,
        truncated: false,
        content,
      }
    }
    return { id: this.gistId, public: false, files, updated_at: new Date().toISOString() }
  }

  async handle(tag: string, route: Route): Promise<void> {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const path = url.pathname
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers())) headers[k.toLowerCase()] = v
    const body = req.postData() ?? undefined

    const done = async (status: number, payload?: string, extra: Record<string, string> = {}, contentType = 'application/json') => {
      this.requests.push({ tag, method, path, at: Date.now(), status })
      await route.fulfill({
        status,
        headers: { ...CORS, ...extra },
        contentType: payload === undefined ? undefined : contentType,
        body: payload ?? '',
      })
    }

    if (method === 'OPTIONS') return done(204)

    for (const h of this.hooks) {
      const o = await h({ tag, method, path, headers, body })
      if (!o) continue
      if ('delayMs' in o) {
        await new Promise((r) => setTimeout(r, o.delayMs))
        continue
      }
      return done(o.status, o.body ?? JSON.stringify({ message: `fake ${o.status}` }), o.headers)
    }

    if (method === 'GET' && path === '/user') return done(200, JSON.stringify({ login: this.login }))

    const gist = path.match(/^\/gists\/([^/]+)$/)
    if (gist) {
      if (gist[1] !== this.gistId) return done(404, JSON.stringify({ message: 'Not Found' }))
      if (method === 'GET') return done(200, JSON.stringify(this.gistJSON()))
      if (method === 'PATCH') {
        let parsed: any = {}
        try {
          parsed = JSON.parse(body ?? '{}')
        } catch {
          return done(422, JSON.stringify({ message: 'bad json' }))
        }
        const written: Record<string, string> = {}
        for (const [name, f] of Object.entries<any>(parsed.files ?? {})) {
          if (f === null) {
            delete this.files[name]
            continue
          }
          if (typeof f?.content === 'string') {
            this.files[name] = f.content
            written[name] = f.content
          }
        }
        this.patches.push({ tag, at: Date.now(), files: written })
        return done(200, JSON.stringify(this.gistJSON()))
      }
    }
    if (method === 'POST' && path === '/gists') {
      let parsed: any = {}
      try {
        parsed = JSON.parse(body ?? '{}')
      } catch {
        /* ignore */
      }
      for (const [name, f] of Object.entries<any>(parsed.files ?? {})) {
        if (typeof f?.content === 'string') this.files[name] = f.content
      }
      return done(201, JSON.stringify(this.gistJSON()))
    }

    const contents = path.match(/^\/repos\/([^/]+)\/life-os-atlas\/contents\/([^/]+)$/)
    if (contents && method === 'GET') {
      if (contents[1] !== this.login) return done(404, JSON.stringify({ message: 'Not Found' }))
      const f = this.repo.get(decodeURIComponent(contents[2]))
      if (!f) return done(404, JSON.stringify({ message: 'Not Found' }))
      if (headers['if-none-match'] && headers['if-none-match'] === f.etag) return done(304, undefined, { etag: f.etag })
      const raw = (headers['accept'] ?? '').includes('raw')
      if (raw) return done(200, f.text, { etag: f.etag }, 'application/vnd.github.raw+json')
      return done(
        200,
        JSON.stringify({ name: contents[2], encoding: 'base64', content: Buffer.from(f.text).toString('base64'), sha: sha(f.text) }),
        { etag: f.etag },
      )
    }
    if (contents && method === 'PUT') {
      if (contents[1] !== this.login) return done(404, JSON.stringify({ message: 'Not Found' }))
      let parsed: any = {}
      try {
        parsed = JSON.parse(body ?? '{}')
      } catch {
        return done(422, JSON.stringify({ message: 'bad json' }))
      }
      const name = decodeURIComponent(contents[2])
      const cur = this.repo.get(name)
      // כמו GitHub: קובץ קיים דורש sha תואם; קובץ חדש — בלי sha
      if (cur && parsed.sha !== sha(cur.text)) return done(409, JSON.stringify({ message: 'sha does not match' }))
      if (!cur && parsed.sha) return done(422, JSON.stringify({ message: 'no such file' }))
      const text = Buffer.from(String(parsed.content ?? ''), 'base64').toString('utf8')
      this.setRepoFile(name, text)
      this.writes.push({ tag, name, at: Date.now(), message: String(parsed.message ?? '') })
      return done(cur ? 200 : 201, JSON.stringify({ content: { name, sha: sha(text) }, commit: { sha: sha(text + Date.now()) } }))
    }
    const issues = path.match(/^\/repos\/([^/]+)\/life-os-atlas\/issues$/)
    if (issues && method === 'POST') {
      if (issues[1] !== this.login) return done(404, JSON.stringify({ message: 'Not Found' }))
      let parsed: any = {}
      try {
        parsed = JSON.parse(body ?? '{}')
      } catch {
        return done(422, JSON.stringify({ message: 'bad json' }))
      }
      const number = ++this.issueSeq
      this.issues.push({ tag, number, title: String(parsed.title ?? ''), body: String(parsed.body ?? ''), at: Date.now() })
      return done(201, JSON.stringify({ number, title: parsed.title, state: 'open' }))
    }

    return done(404, JSON.stringify({ message: `fake: no route for ${method} ${path}` }))
  }
}

/** מתקין את המזויף על הקשר דפדפן. הרשומות מסומנות ב-tag של המכשיר. */
export async function installFakeGithub(context: BrowserContext, fake: FakeGithub, tag: string): Promise<void> {
  await context.route('https://api.github.com/**', (route) => fake.handle(tag, route))
  // raw_url של גיסט קטוע — לא אמור לקרות במזויף, אבל שלא יברח החוצה
  await context.route('https://gist.githubusercontent.com/**', (route) =>
    route.fulfill({ status: 404, headers: CORS, body: 'no raw in fake' }),
  )
}
