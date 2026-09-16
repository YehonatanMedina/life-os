// ---------------------------------------------------------------------------
// מפיק את קריינות הבוקר מ-docs/news/latest.json אל docs/news/latest.mp3.
//
// שרשרת ספקים, לפי המפתחות שקיימים ב-Secrets:
//   1. ELEVENLABS_API_KEY  — האיכות הטובה ביותר בעברית (eleven v3 / flash)
//   2. OPENAI_API_KEY      — gpt-4o-mini-tts, טוב וזול
//   3. בלי מפתחות          — edge-tts (חינם, הקול הנוכחי)
// מחליפים ספק על ידי הוספת Secret בלבד — בלי לגעת בקוד.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { execSync } from 'child_process'

import { AUDIO_FILE, audioUrl, isAudioFresh, narrationChunks, readSidecar, stampEditions, textHash, writeSidecar } from './edition-text.mjs'

const ed = JSON.parse(fs.readFileSync('docs/news/latest.json', 'utf8'))
const chunks = narrationChunks(ed)
const fullText = chunks.join('\n\n')
const hash = textHash(chunks)
const OUT = AUDIO_FILE
const bytesOf = () => (fs.existsSync(OUT) ? fs.statSync(OUT).size : 0)
// TTS_STAMP_ONLY: יש קובץ שהוקלט מהטקסט הזה, חסרה רק החתימה (הרצה ידנית)
const stampOnly = process.env.TTS_STAMP_ONLY === '1'
const force = process.env.TTS_FORCE === 'true' || process.env.TTS_FORCE === '1'
console.log('date:', ed.date, 'chars:', fullText.length, 'hash:', hash, stampOnly ? '(stamp only)' : '')

// כבר יש קריינות לטקסט הזה בדיוק — לא מקליטים שוב, ולא דוחפים commit שיעיר אותנו מחדש
if (!force && !stampOnly && isAudioFresh(readSidecar(), ed, hash, bytesOf())) {
  console.log('audio already matches this edition — nothing to do')
  process.exit(0)
}

async function elevenlabs() {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return false
  const voice = process.env.ELEVEN_VOICE_ID || ''
  let voiceId = voice
  if (!voiceId) {
    // בוחרים קול: קודם קול שמסומן עברית, אחרת הראשון ברשימה
    const vs = await (await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })).json()
    const all = vs.voices ?? []
    const heb = all.find((v) => JSON.stringify(v.labels ?? {}).toLowerCase().includes('hebrew'))
    voiceId = (heb ?? all[0])?.voice_id
    if (!voiceId) return false
    console.log('elevenlabs voice:', (heb ?? all[0]).name)
  }
  const model = process.env.ELEVEN_MODEL || 'eleven_v3'
  // v3 איטי לכל בקשה — מקבילים 3 קטעים בו־זמנית ושומרים על הסדר
  const gen = async (chunk, i) => {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunk,
        model_id: model,
        ...(model.includes('multilingual') ? {} : { language_code: 'he' }),
      }),
    })
    if (!r.ok) throw new Error(`chunk ${i}: ${r.status} ${(await r.text()).slice(0, 150)}`)
    const buf = Buffer.from(await r.arrayBuffer())
    console.log(`chunk ${i + 1}/${chunks.length} done (${buf.length}b)`)
    return buf
  }
  const bufs = new Array(chunks.length)
  try {
    let next = 0
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++
        bufs[i] = await gen(chunks[i], i)
      }
    }
    await Promise.all([worker(), worker(), worker()])
  } catch (e) {
    console.log('elevenlabs failed:', e.message)
    return false
  }
  fs.writeFileSync(OUT, Buffer.concat(bufs))
  console.log('elevenlabs ok')
  return true
}

async function openai() {
  const key = process.env.OPENAI_API_KEY
  if (!key) return false
  const bufs = []
  for (const chunk of chunks) {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: process.env.OPENAI_VOICE || 'onyx',
        input: chunk,
        instructions: 'קריין פודקאסט ישראלי, עברית טבעית ורהוטה, קצב רגוע וחם.',
        response_format: 'mp3',
      }),
    })
    if (!r.ok) {
      console.log('openai failed:', r.status, (await r.text()).slice(0, 200))
      return false
    }
    bufs.push(Buffer.from(await r.arrayBuffer()))
  }
  fs.writeFileSync(OUT, Buffer.concat(bufs))
  console.log('openai ok')
  return true
}

function edgeTts() {
  fs.writeFileSync('/tmp/narration.txt', fullText)
  execSync('pip install -q edge-tts', { stdio: 'inherit' })
  execSync(
    `python -c "import asyncio,edge_tts,io;t=io.open('/tmp/narration.txt',encoding='utf-8').read();asyncio.run(edge_tts.Communicate(t,voice='he-IL-AvriNeural',rate='+4%').save('${OUT}'))"`,
    { stdio: 'inherit' },
  )
  console.log('edge-tts ok')
  return true
}

const provider = stampOnly
  ? 'existing'
  : (await elevenlabs())
    ? 'elevenlabs'
    : (await openai())
      ? 'openai'
      : edgeTts()
        ? 'edge-tts'
        : ''
const bytes = bytesOf()
if (!provider || bytes < 500_000) {
  // נכשלנו? לא נוגעים בשדה audio — האפליקציה תקריא את המהדורה בעצמה,
  // במקום לנגן את הקריינות של אתמול מתחת לכותרות של היום.
  console.error('audio generation failed', { provider, bytes })
  process.exit(1)
}

writeSidecar({ date: ed.date, textHash: hash, bytes, provider, generatedAt: new Date().toISOString() })
const stamped = stampEditions(audioUrl(hash), ed.date)
console.log('mp3 bytes:', bytes, 'provider:', provider, 'stamped:', stamped.join(', ') || '(none)')
