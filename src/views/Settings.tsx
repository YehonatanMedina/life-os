import React, { useMemo, useState } from 'react'
import { actions, alive, nextOrder, store, uid, useApp } from '../store'
import { HE_DAYS, HE_DAYS_SHORT, plural, shortDate, timeToMinutes, today as todayISO } from '../dates'

/** תדירות בשבועות — כי כך גם עורכים אותה בגיליון */
function everyText(days: number): string {
  if (days % 7 !== 0) return days === 1 ? 'כל יום' : `כל ${days} ימים`
  const w = days / 7
  return w === 1 ? 'כל שבוע' : w === 2 ? 'כל שבועיים' : `כל ${w} שבועות`
}
import { Confirm, DateField, Field, NumField, onColor, Sheet, Switch, TimeField, useToast } from '../ui'
import type { HabitDef, HabitStep, RecurRule, WeeklyDef } from '../types'
import { saveFile } from '../cloud'
import CloudCard from './CloudCard'
import NotifyCard from './NotifyCard'
import DatesCard from './DatesCard'

export default function SettingsView() {
  const s = useApp()
  const toast = useToast()
  const [reset, setReset] = useState(false)
  const [habit, setHabit] = useState<HabitDef | null>(null)
  const [weekly, setWeekly] = useState<WeeklyDef | null>(null)
  const [rule, setRule] = useState<RecurRule | null>(null)
  const [about, setAbout] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (p: Partial<typeof s.settings>) => actions.setSettings(p)

  const exportJson = async () => {
    const data = JSON.stringify(store.get(), null, 2)
    const ok = await saveFile(`life-os-${todayISO()}.json`, data)
    toast(ok ? 'קובץ הגיבוי ירד' : 'ההורדה נחסמה — נסה מהמחשב')
  }

  const [pendingImport, setPendingImport] = useState<{ state: any; name: string } | null>(null)

  const importJson = (file: File) => {
    const fr = new FileReader()
    fr.onload = () => {
      try {
        const parsed = actions.normalizeImport(JSON.parse(String(fr.result)))
        if (!parsed) throw new Error('bad')
        setPendingImport({ state: parsed, name: file.name })
      } catch {
        toast('הקובץ לא נראה כמו גיבוי של המערכת')
      }
    }
    fr.readAsText(file)
  }


  return (
    <div className="stack narrow" style={{ paddingTop: 12 }}>
      <div className="desk-head">
        <h1>הגדרות</h1>
      </div>

      {/* ------------------------------------------------ יעדים */}
      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 12 }}>יעדים ושעות</div>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field grow">
            <span>שעת קימה</span>
            <TimeField value={s.settings.wakeTime} onChange={(v) => set({ wakeTime: v })} />
          </label>
          <label className="field grow">
            <span>שעת שינה</span>
            <TimeField value={s.settings.bedTime} onChange={(v) => set({ bedTime: v })} />
          </label>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field grow">
            <span>אורך אסימון</span>
            <NumField
              value={s.settings.tokenMinutes}
              min={10}
              max={240}
              suffix="דק׳"
              onChange={(v) => set({ tokenMinutes: v })}
            />
          </label>
          <label className="field grow">
            <span>יעד יומי</span>
            <NumField value={s.settings.dailyTokenGoal} min={1} max={12} onChange={(v) => set({ dailyTokenGoal: v })} />
          </label>
          <label className="field grow">
            <span>יעד שבועי</span>
            <NumField value={s.settings.weeklyTokenGoal} min={1} max={80} onChange={(v) => set({ weeklyTokenGoal: v })} />
          </label>
        </div>
        <div className="tiny faint">
          כרגע: {s.settings.dailyTokenGoal} אסימונים ביום ={' '}
          {((s.settings.dailyTokenGoal * s.settings.tokenMinutes) / 60).toFixed(1)} שעות נטו,{' '}
          {s.settings.weeklyTokenGoal} בשבוע.
        </div>

        <div className="section-title" style={{ margin: '16px 0 4px' }}>
          מתי הקיבולת יורדת
        </div>
        <div className="tiny faint" style={{ marginBottom: 10 }}>
          הכל כבוי = היעד המלא בכל יום, כולל חגים וימי מבחן. ליום ספציפי עם ציפייה אחרת
          (טיסה וכדומה) קובעים "קיבולת ליום" מתוך עריכת האירוע ביומן.
        </div>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 14 }}>שישי ושבת</div>
            <div className="tiny faint">
              60% מהיעד ({Math.max(1, Math.round(s.settings.dailyTokenGoal * 0.6))} אסימונים)
            </div>
          </div>
          <Switch
            label="קיבולת מופחתת בשישי ושבת"
            on={s.settings.easyWeekend}
            onChange={(v) => set({ easyWeekend: v })}
          />
        </div>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 14 }}>חגים</div>
            <div className="tiny faint">חג מלא — אפס · ערב חג — חצי</div>
          </div>
          <Switch
            label="קיבולת מופחתת בחגים"
            on={s.settings.easyHoliday}
            onChange={(v) => set({ easyHoliday: v })}
          />
        </div>
        <div className="spread">
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 14 }}>ימי מבחן</div>
            <div className="tiny faint">מבחן אחד — 2 אסימונים · שניים — אחד</div>
          </div>
          <Switch
            label="קיבולת מופחתת בימי מבחן"
            on={s.settings.easyExamDay}
            onChange={(v) => set({ easyExamDay: v })}
          />
        </div>
      </div>

      {/* ------------------------------------------------ בלוקים קבועים */}
      <div className="card">
        <div className="spread" style={{ padding: '12px 13px 6px' }}>
          <div>
            <b>מבנה השבוע הקבוע</b>
            <div className="tiny faint">הבלוקים האלה נכנסים ליומן אוטומטית. כל מופע ניתן להזזה בנפרד.</div>
          </div>
          <button
            className="btn sm"
            onClick={() =>
              setRule({
                id: uid('rl'),
                updatedAt: 0,
                title: '',
                kind: 'block',
                start: '09:00',
                end: '11:00',
                days: [0, 1, 2, 3, 4],
                from: todayISO(),
                active: true,
              })
            }
          >
            + חדש
          </button>
        </div>
        <div className="list">
          {alive(s.rules).map((r) => (
            <button className="item tappable" key={r.id} onClick={() => setRule(r)} style={{ textAlign: 'start' }}>
              <div className="txt">
                <div className="ttl truncate">
                  {r.title} {!r.active && <span className="chip">כבוי</span>}
                </div>
                <div className="sub2">
                  <span className="ltr">{r.start}–{r.end}</span> · {r.days.map((d) => HE_DAYS_SHORT[d]).join(' ')}
                </div>
              </div>
              <span className="faint">›</span>
            </button>
          ))}
          {alive(s.rules).length === 0 && <div className="empty">אין בלוקים קבועים.</div>}
        </div>
      </div>

      {/* ------------------------------------------------ הרגלים */}
      <div className="card">
        <div className="spread" style={{ padding: '12px 13px 6px' }}>
          <b>הרגלים יומיים</b>
          <button
            className="btn sm"
            onClick={() => setHabit({ id: uid('hb'), updatedAt: 0, name: '', emoji: '✅', order: nextOrder(s.habits), steps: [] })}
          >
            + חדש
          </button>
        </div>
        <div className="list">
          {alive(s.habits)
            .sort((a, b) => a.order - b.order)
            .map((h) => (
              <button className="item tappable" key={h.id} onClick={() => setHabit(h)} style={{ textAlign: 'start' }}>
                <div className="txt">
                  <div className="ttl">
                    {h.emoji} {h.name}
                  </div>
                  <div className="sub2">
                    {h.minutes ? `${h.minutes} דק׳` : 'בלי משך'}
                    {h.steps?.length ? ` · ${plural(h.steps.length, 'שלב אחד', 'שלבים')}` : ''}
                  </div>
                </div>
                <span className="faint">›</span>
              </button>
            ))}
        </div>
      </div>

      {/* ------------------------------------------------ שבועיים */}
      <div className="card">
        <div className="spread" style={{ padding: '12px 13px 6px' }}>
          <b>אסימונים שבועיים</b>
          <button
            className="btn sm"
            onClick={() => setWeekly({ id: uid('wk'), updatedAt: 0, name: '', emoji: '⭐', order: nextOrder(s.weekly), kind: 'check' })}
          >
            + חדש
          </button>
        </div>
        <div className="list">
          {alive(s.weekly)
            .sort((a, b) => a.order - b.order)
            .map((w) => (
              <button className="item tappable" key={w.id} onClick={() => setWeekly(w)} style={{ textAlign: 'start' }}>
                <div className="txt">
                  <div className="ttl">
                    {w.emoji} {w.name}
                  </div>
                  <div className="sub2">
                    {w.kind === 'progress' ? `יעד ${w.targetMinutes} דק׳` : 'סימון'}
                    {w.everyDays ? ` · ${everyText(w.everyDays)}` : ''}
                    {w.alertDow !== undefined ? ` · תזכורת ביום ${HE_DAYS[w.alertDow]}` : ''}
                  </div>
                </div>
                <span className="faint">›</span>
              </button>
            ))}
        </div>
      </div>

      {/* ------------------------------------------------ תאריכים קבועים */}
      <DatesCard />

      {/* ------------------------------------------------ תצוגה */}
      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 12 }}>תצוגה והתנהגות</div>

        <div className="spread" style={{ marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>ערכת נושא</span>
          <div className="row" style={{ gap: 3 }}>
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={`btn xs${s.settings.theme === t ? ' primary' : ''}`} onClick={() => set({ theme: t })}>
                {t === 'system' ? 'מערכת' : t === 'light' ? 'בהיר' : 'כהה'}
              </button>
            ))}
          </div>
        </div>

        <div className="spread" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>צליל בסיום אסימון</div>
          </div>
          <Switch label="צליל בסיום אסימון" on={s.settings.sound} onChange={(v) => set({ sound: v })} />
        </div>

        <div className="spread" style={{ marginBottom: 14 }}>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 14 }}>התראות מערכת</div>
            <div className="tiny faint">כשאסימון מסתיים, גם אם הלשונית ברקע</div>
          </div>
          <Switch
            label="התראות מערכת"
            on={s.settings.notifications}
            onChange={async (v) => {
              if (v && 'Notification' in window) {
                const p = await Notification.requestPermission()
                if (p !== 'granted') return toast('ההרשאה נדחתה')
              }
              set({ notifications: v })
            }}
          />
        </div>

        <div className="spread" style={{ marginBottom: 14 }}>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 14 }}>נעילת סקירה שבועית</div>
            <div className="tiny faint">ביום {HE_DAYS[s.settings.reviewDow]} האפליקציה ננעלת עד למילוי הסקירה</div>
          </div>
          <Switch label="נעילת סקירה שבועית" on={s.settings.reviewLock} onChange={(v) => set({ reviewLock: v })} />
        </div>

        <Field label="טווח השעות שמוצג ביומן">
          <div className="row">
            <select
              className="select grow"
              value={s.settings.dayStartHour}
              onChange={(e) => {
                const v = Number(e.target.value)
                set({ dayStartHour: v, dayEndHour: Math.max(v + 6, s.settings.dayEndHour) })
              }}
            >
              {Array.from({ length: 13 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {`מ־${String(h).padStart(2, '0')}:00`}
                </option>
              ))}
            </select>
            <select
              className="select grow"
              value={s.settings.dayEndHour}
              onChange={(e) => set({ dayEndHour: Number(e.target.value) })}
            >
              {Array.from({ length: 25 }, (_, i) => i)
                .filter((h) => h >= s.settings.dayStartHour + 6)
                .map((h) => (
                  <option key={h} value={h}>
                    {h === 24 ? 'עד חצות' : `עד ${String(h).padStart(2, '0')}:00`}
                  </option>
                ))}
            </select>
          </div>
          <div className="tiny faint" style={{ marginTop: 5 }}>
            אירועים מחוץ לטווח יוצגו בכל מקרה — הרשת מתרחבת אליהם לבד.
          </div>
        </Field>
      </div>

      {/* ------------------------------------------------ סנכרון */}
      <CloudCard />

      {/* ------------------------------------------------ התראות דחיפה */}
      <NotifyCard />

      {/* ------------------------------------------------ גיבוי */}
      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 10 }}>גיבוי</div>
        <p className="small muted" style={{ marginTop: 0 }}>
          קובץ JSON עם הכל. לפני כל ייבוא יורד גיבוי אוטומטי של מה שיש עכשיו.
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn grow" onClick={exportJson}>
            ייצוא גיבוי
          </button>
          <label className="btn grow" style={{ cursor: 'pointer' }}>
            ייבוא גיבוי
            <input
              type="file"
              accept="application/json"
              className="sr"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
                e.currentTarget.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div className="card pad">
        <div className="row">
          <button className="btn ghost grow" onClick={() => setAbout(true)}>
            על המערכת
          </button>
          <button className="btn danger grow" onClick={() => setReset(true)}>
            איפוס להתחלה
          </button>
        </div>
      </div>

      <div className="tiny faint center" style={{ padding: '4px 0 20px' }}>
        מזהה מכשיר: {s.deviceId}
      </div>

      {/* ------------------------------------------------ גיליונות */}
      <HabitSheet habit={habit} onClose={() => setHabit(null)} />
      <WeeklySheet w={weekly} onClose={() => setWeekly(null)} />
      <RuleSheet rule={rule} onClose={() => setRule(null)} />

      <Sheet open={about} onClose={() => setAbout(false)} title="על המערכת">
        <div className="small stack">
          <p style={{ margin: 0 }}>
            <b>הפילוסופיה:</b> לא לו״ז נוקשה של דקות — אלא <b>אסימוני Deep Work</b> ושלבים. מודדים את הקלט
            (זמן ריכוז נטו), לא את הפלט. סביב זה יש ליבת ברזל יומית — קימה, שגרות, אימון — ואסימונים שבועיים
            צפים שאפשר לסמן כשזה קורה.
          </p>
          <p style={{ margin: 0 }}>
            <b>הכלל של יום {HE_DAYS[s.settings.reviewDow]}:</b> אתה מסתכל על המספרים, עונה על תשע שאלות,
            ומחליט מה יורד מהצלחת.
          </p>
          <p style={{ margin: 0 }}>
            <b>שמירה:</b> הכל נשמר מקומית בדפדפן ומיד. אפשר לייצא גיבוי בכל רגע.
          </p>
        </div>
      </Sheet>

      <Confirm
        open={!!pendingImport}
        title="לייבא את הגיבוי?"
        body={
          pendingImport
            ? `${pendingImport.name} — ${plural((pendingImport.state.tasks || []).length, 'משימה אחת', 'משימות')}, ${plural((pendingImport.state.sessions || []).length, 'סשן אחד', 'סשנים')}. הנתונים הנוכחיים יוחלפו (גיבוי אוטומטי יירד קודם).`
            : undefined
        }
        confirmLabel="ייבוא"
        onCancel={() => setPendingImport(null)}
        onConfirm={async () => {
          await saveFile(`life-os-pre-import-${todayISO()}.json`, JSON.stringify(store.get(), null, 2))
          actions.replaceAll(pendingImport!.state)
          setPendingImport(null)
          toast('הנתונים יובאו')
        }}
      />

      <Confirm
        open={reset}
        title="לאפס הכל?"
        body="כל המשימות, האירועים, הסשנים והסקירות יימחקו ויחזרו לנתוני הפתיחה. פעולה בלתי הפיכה — כדאי לייצא גיבוי קודם."
        confirmLabel="איפוס"
        onCancel={() => setReset(false)}
        onConfirm={() => {
          actions.resetAll()
          setReset(false)
          toast('הכל אופס להתחלה')
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function HabitSheet({ habit, onClose }: { habit: HabitDef | null; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const [d, setD] = useState<HabitDef | null>(null)
  const [del, setDel] = useState(false)
  const [step, setStep] = useState('')
  React.useEffect(() => setD(habit ? { ...habit, steps: habit.steps ? [...habit.steps] : [] } : null), [habit])
  if (!d) return null
  const up = (p: Partial<HabitDef>) => setD((x) => (x ? { ...x, ...p } : x))
  const exists = s.habits.some((h) => h.id === d.id && !h.deleted)

  return (
    <>
      <Sheet open onClose={onClose} title="הרגל יומי">
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field" style={{ width: 78 }}>
            <span>אימוג׳י</span>
            <input className="input center" value={d.emoji} maxLength={4} onChange={(e) => up({ emoji: e.target.value })} />
          </label>
          <label className="field grow">
            <span>שם</span>
            <input
              className="input"
              value={d.name}
              onChange={(e) => up({ name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <label className="field" style={{ width: 96 }}>
            <span>דקות</span>
            <NumField value={d.minutes ?? 0} min={0} max={600} onChange={(v) => up({ minutes: v || undefined })} />
          </label>
        </div>

        <Field label="צ׳קליסט (השלבים בתוך השגרה)">
          <div className="card list" style={{ marginBottom: 8 }}>
            {(d.steps ?? []).length === 0 && <div className="empty tiny">אין שלבים</div>}
            {(d.steps ?? []).map((x, i) => (
              <div className="item" key={x.id} style={{ minHeight: 42 }}>
                <span className="faint tiny">{i + 1}</span>
                <input
                  className="input grow"
                  style={{ border: 0, padding: '4px 6px', background: 'none' }}
                  value={x.text}
                  onChange={(e) => {
                    const text = e.target.value
                    setD((cur) =>
                      cur
                        ? { ...cur, steps: (cur.steps ?? []).map((y) => (y.id === x.id ? { ...y, text } : y)) }
                        : cur,
                    )
                  }}
                />
                <button
                  className="btn ghost xs"
                  aria-label="מחיקת השלב"
                  onClick={() => setD((cur) => (cur ? { ...cur, steps: (cur.steps ?? []).filter((y) => y.id !== x.id) } : cur))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <input
            className="input"
            placeholder="+ שלב חדש"
            value={step}
            onChange={(e) => setStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && step.trim()) {
                const st: HabitStep = { id: uid('hs'), text: step.trim() }
                setD((cur) => (cur ? { ...cur, steps: [...(cur.steps ?? []), st] } : cur))
                setStep('')
              }
            }}
          />
        </Field>

        <div className="sheet-actions">
          <button
            className="btn primary grow"
            onClick={() => {
              if (!d.name.trim()) return toast('צריך שם')
              actions.upsertHabit({ ...d, name: d.name.trim() })
              toast('נשמר')
              onClose()
            }}
          >
            שמירה
          </button>
          <button className="btn grow" onClick={onClose}>
            ביטול
          </button>
          {exists && (
            <>
              <span className="spacer" />
              <button className="btn danger" onClick={() => setDel(true)}>
                מחיקה
              </button>
            </>
          )}
        </div>
      </Sheet>
      <Confirm
        open={del}
        title="למחוק את ההרגל?"
        onCancel={() => setDel(false)}
        onConfirm={() => {
          actions.deleteHabit(d.id)
          setDel(false)
          onClose()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
function WeeklySheet({ w, onClose }: { w: WeeklyDef | null; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const [d, setD] = useState<WeeklyDef | null>(null)
  const [del, setDel] = useState(false)
  React.useEffect(() => setD(w ? { ...w } : null), [w])
  if (!d) return null
  const up = (p: Partial<WeeklyDef>) => setD((x) => (x ? { ...x, ...p } : x))
  const exists = s.weekly.some((x) => x.id === d.id && !x.deleted)

  return (
    <>
      <Sheet open onClose={onClose} title="אסימון שבועי">
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field" style={{ width: 78 }}>
            <span>אימוג׳י</span>
            <input className="input center" value={d.emoji} maxLength={4} onChange={(e) => up({ emoji: e.target.value })} />
          </label>
          <label className="field grow">
            <span>שם</span>
            <input className="input" value={d.name} onChange={(e) => up({ name: e.target.value })} />
          </label>
        </div>

        <Field label="סוג">
          <div className="row">
            <button className={`btn sm grow${d.kind === 'check' ? ' primary' : ''}`} onClick={() => up({ kind: 'check' })}>
              סימון בלבד
            </button>
            <button
              className={`btn sm grow${d.kind === 'progress' ? ' primary' : ''}`}
              onClick={() => up({ kind: 'progress', targetMinutes: d.targetMinutes ?? 180 })}
            >
              מד התקדמות
            </button>
          </div>
        </Field>

        {d.kind === 'progress' && (
          <Field label="יעד דקות בשבוע">
            <NumField
              value={d.targetMinutes ?? 180}
              min={10}
              max={2000}
              suffix="דק׳"
              onChange={(v) => up({ targetMinutes: v })}
            />
          </Field>
        )}

        <Field label="תזכורת ביום קבוע">
          <div className="row wrap">
            <button className={`btn xs${d.alertDow === undefined ? ' primary' : ''}`} onClick={() => up({ alertDow: undefined })}>
              ללא
            </button>
            {HE_DAYS.map((n, i) => (
              <button key={i} className={`btn xs${d.alertDow === i ? ' primary' : ''}`} onClick={() => up({ alertDow: i })}>
                {HE_DAYS_SHORT[i]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="תדירות">
          <div className="row wrap">
            {[
              { v: undefined, l: 'כל שבוע' },
              { v: 14, l: 'כל שבועיים' },
              { v: 21, l: 'כל 3 שבועות' },
              { v: 28, l: 'כל 4 שבועות' },
            ].map((o) => (
              <button
                key={o.l}
                className={`btn xs${(d.everyDays ?? undefined) === o.v ? ' primary' : ''}`}
                onClick={() => up({ everyDays: o.v, anchorDate: o.v ? d.anchorDate ?? todayISO() : undefined })}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Field>

        {!!d.everyDays && (
          <Field label="נספר מהשבוע של">
            <DateField value={d.anchorDate} onChange={(v) => up({ anchorDate: v })} />
          </Field>
        )}

        <Field label="רמז">
          <input className="input" value={d.hint ?? ''} onChange={(e) => up({ hint: e.target.value })} />
        </Field>

        <div className="sheet-actions">
          <button
            className="btn primary grow"
            onClick={() => {
              if (!d.name.trim()) return toast('צריך שם')
              actions.upsertWeekly({ ...d, name: d.name.trim() })
              toast('נשמר')
              onClose()
            }}
          >
            שמירה
          </button>
          <button className="btn grow" onClick={onClose}>
            ביטול
          </button>
          {exists && (
            <>
              <span className="spacer" />
              <button className="btn danger" onClick={() => setDel(true)}>
                מחיקה
              </button>
            </>
          )}
        </div>
      </Sheet>
      <Confirm
        open={del}
        title="למחוק את האסימון השבועי?"
        onCancel={() => setDel(false)}
        onConfirm={() => {
          actions.deleteWeekly(d.id)
          setDel(false)
          onClose()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
function RuleSheet({ rule, onClose }: { rule: RecurRule | null; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const [d, setD] = useState<RecurRule | null>(null)
  const [del, setDel] = useState(false)
  React.useEffect(() => setD(rule ? { ...rule, days: [...rule.days] } : null), [rule])
  if (!d) return null
  const exists = s.rules.some((r) => r.id === d.id && !r.deleted)
  const up = (p: Partial<RecurRule>) => setD((x) => (x ? { ...x, ...p } : x))
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)

  return (
    <Sheet open onClose={onClose} title="בלוק קבוע">
      <Field label="שם">
        <input
          className="input"
          value={d.title}
          onChange={(e) => up({ title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="למשל: עבודה עמוקה — בוקר"
        />
      </Field>

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field grow">
          <span>התחלה</span>
          <TimeField value={d.start} onChange={(v) => up({ start: v })} />
        </label>
        <label className="field grow">
          <span>סיום</span>
          <TimeField value={d.end} onChange={(v) => up({ end: v })} />
        </label>
      </div>

      <Field label="ימים">
        <div className="row wrap">
          {HE_DAYS.map((n, i) => (
            <button
              key={i}
              className={`btn xs${d.days.includes(i) ? ' primary' : ''}`}
              onClick={() =>
                setD((x) =>
                  x
                    ? { ...x, days: x.days.includes(i) ? x.days.filter((y) => y !== i) : [...x.days, i].sort() }
                    : x,
                )
              }
            >
              {HE_DAYS_SHORT[i]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="מסלול (לא חובה)">
        <div className="tag-scroll">
          <button className={`tag${!d.trackId ? ' on' : ''}`} style={!d.trackId ? { background: 'var(--accent)' } : undefined} onClick={() => up({ trackId: undefined })}>
            ללא
          </button>
          {tracks.map((tr) => (
            <button
              key={tr.id}
              className={`tag${d.trackId === tr.id ? ' on' : ''}`}
              style={
                d.trackId === tr.id
                  ? { background: tr.color, color: onColor(tr.color), borderColor: 'transparent' }
                  : { ['--tc' as any]: tr.color }
              }
              onClick={() => up({ trackId: tr.id })}
            >
              {tr.emoji} {tr.name}
            </button>
          ))}
        </div>
      </Field>

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="grow" style={{ fontWeight: 700, fontSize: 13.5 }}>
          בלוק Deep Work
        </span>
        <Switch label="בלוק Deep Work" on={!!d.deep} onChange={(v) => up({ deep: v })} />
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="grow" style={{ fontWeight: 700, fontSize: 13.5 }}>
          פעיל
        </span>
        <Switch label="סדרה פעילה" on={d.active} onChange={(v) => up({ active: v })} />
      </div>

      <div className="sheet-actions">
        <button
          className="btn primary grow"
          onClick={() => {
            if (!d.title.trim()) return toast('צריך שם')
            if (!d.days.length) return toast('בחר לפחות יום אחד')
            if (timeToMinutes(d.end) <= timeToMinutes(d.start)) return toast('שעת הסיום חייבת להיות אחרי ההתחלה')
            actions.upsertRule({ ...d, title: d.title.trim() })
            toast('נשמר · היומן עודכן מהיום והלאה')
            onClose()
          }}
        >
          שמירה
        </button>
        <button className="btn grow" onClick={onClose}>
          ביטול
        </button>
        {exists && (
          <>
            <span className="spacer" />
            <button className="btn danger" onClick={() => setDel(true)}>
              מחיקה
            </button>
          </>
        )}
      </div>
      <div className="tiny faint" style={{ marginTop: 10 }}>
        שינוי מעדכן את כל המופעים מהיום והלאה. מופע בודד שהזזת ידנית ביומן נשאר במקום שקבעת לו.
      </div>

      <Confirm
        open={del}
        title="למחוק את הבלוק הקבוע?"
        body="כל המופעים העתידיים יימחקו מהיומן. מה שכבר עבר, ומופעים בודדים שהזזת ידנית, יישארו."
        onCancel={() => setDel(false)}
        onConfirm={() => {
          actions.deleteRule(d.id)
          setDel(false)
          onClose()
          toast('הבלוק נמחק')
        }}
      />
    </Sheet>
  )
}
