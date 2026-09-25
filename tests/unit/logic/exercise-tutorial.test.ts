// הקישור "איך עושים את זה" לכל תרגיל.
//
// הבדיקה הזו קיימת כי לרוב התרגילים בתוכנית לא היה קישור בכלל — הוא הופיע
// רק אם מישהו הדביק אותו ידנית. הכלל שנשמר כאן: לכל תרגיל יש קישור, הקישור
// הידני גובר, ושם עברי מתורגם לחיפוש באנגלית לפני שנופלים לשם עצמו.
import { describe, it, expect } from 'vitest'
import { exerciseSearch, exerciseTutorial } from '../../../src/skills'

describe('exerciseSearch', () => {
  it('מתרגם שם עברי מוכר לחיפוש באנגלית', () => {
    expect(exerciseSearch('תרגול עמידת ידיים על הקיר')).toBe('wall handstand hold proper form')
    expect(exerciseSearch('קפיצות פוגו')).toBe('pogo jumps proper form')
  })

  it('הביטוי הספציפי גובר על הכללי', () => {
    expect(exerciseSearch('שכיבות סמיכה בעמידת ידיים על הקיר')).toBe('wall handstand push up proper form')
    expect(exerciseSearch('הרמות עקבים על רגל אחת')).toBe('single leg calf raise proper form')
    expect(exerciseSearch('הרמות עקבים בעמידה')).toBe('standing calf raise proper form')
  })

  it('לוקח את האנגלית שבתוך השם כשאין מילון', () => {
    expect(exerciseSearch('Hollow Body Hold (החזקת סירה)')).toBe('Hollow Body Hold proper form')
  })

  it('נופל לשם העברי כשאין כלום', () => {
    expect(exerciseSearch('תרגיל שלא קיים בתוכנית')).toBe('תרגיל שלא קיים בתוכנית טכניקה נכונה')
  })
})

describe('exerciseTutorial', () => {
  it('לכל תרגיל יש קישור יוטיוב גם בלי שדה video', () => {
    const url = exerciseTutorial({ name: 'מתח (Pull-ups)' })
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('pull ups proper form')
  })

  it('קישור ידני גובר על החיפוש', () => {
    expect(exerciseTutorial({ name: 'מתח (Pull-ups)', video: 'https://youtu.be/abc' })).toBe('https://youtu.be/abc')
  })

  it('שדה ריק או רווחים נחשב כאילו אין קישור', () => {
    expect(exerciseTutorial({ name: 'קפיצות פוגו', video: '   ' })).toContain('search_query=')
  })
})
