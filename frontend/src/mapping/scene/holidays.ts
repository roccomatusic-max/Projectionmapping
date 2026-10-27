/**
 * When the holidays fall, by the calendar: fixed days (the Fourth of July),
 * the nth weekday of a month (Thanksgiving, Mother's Day), the last Monday
 * of May (Memorial Day), Easter and the days set by it (Mardi Gras), the
 * Hebrew calendar (Hanukkah) and tables for the ones set by the moon
 * (Lunar New Year, Diwali). Used by the countdowns and the live info boards;
 * all worked out on the computer, so nothing needs the internet.
 */

/** The nth weekday (0 Sunday) of a month. */
export function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(year, month, 1).getDay()
  return new Date(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
}

/** Easter Sunday (the Western date). */
export function easter(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const hh = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - hh - k) % 7
  const m = Math.floor((a + 11 * hh + 22 * l) / 451)
  const month = Math.floor((hh + l - 7 * m + 114) / 31)
  const day = ((hh + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const RD_UNIX = 719_163
const HEBREW_EPOCH = -1_373_427

/** Days from the Hebrew epoch to the new year (Rosh Hashanah) of a Hebrew year, before the postponements. */
function hebrewElapsed(year: number) {
  const months = Math.floor((235 * year - 234) / 19)
  const parts = 12084 + 13753 * months
  const day = months * 29 + Math.floor(parts / 25920)
  return (3 * (day + 1)) % 7 < 3 ? day + 1 : day
}

/** Rosh Hashanah of a Hebrew year, as a fixed day count (1 = 1 January of year 1). */
export function roshHashanah(year: number) {
  const [a, b, c] = [hebrewElapsed(year - 1), hebrewElapsed(year), hebrewElapsed(year + 1)]
  const delay = c - b === 356 ? 2 : b - a === 382 ? 1 : 0
  return HEBREW_EPOCH + b + delay
}

/** The evening the first Hanukkah candle is lit (the eve of 25 Kislev) in a Gregorian year: [year, month, day]. */
export function hanukkahEve(gregorianYear: number): [number, number, number] {
  const hy = gregorianYear + 3761
  const length = roshHashanah(hy + 1) - roshHashanah(hy)
  const heshvan = length % 10 === 5 ? 30 : 29
  const kislev25 = roshHashanah(hy) + 30 + heshvan + 24
  const d = new Date((kislev25 - 1 - RD_UNIX) * 86_400_000)
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
}

/** Lunar New Year's day in each year (month from 0, day). */
export const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2025: [0, 29], 2026: [1, 17], 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 3], 2031: [0, 23], 2032: [1, 11],
  2033: [0, 31], 2034: [1, 19], 2035: [1, 8], 2036: [0, 28], 2037: [1, 15], 2038: [1, 4], 2039: [0, 24], 2040: [1, 12],
}
export const ZODIAC = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig']

/** The last weekday (0 Sunday) of a month. */
export function lastWeekday(year: number, month: number, weekday: number) {
  const last = new Date(year, month + 1, 0)
  return new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7))
}

/** Diwali (the night of Lakshmi Puja) in each year (month from 0, day), as observed in the US. */
export const DIWALI: Record<number, [number, number]> = {
  2025: [9, 20], 2026: [10, 8], 2027: [9, 29], 2028: [9, 17], 2029: [10, 5], 2030: [9, 26], 2031: [10, 14], 2032: [10, 2],
  2033: [9, 22], 2034: [10, 10], 2035: [9, 30],
}

/** The day a moon-set holiday falls in a year from its table, or the table's nearest year's day for years past it. */
function fromTable(table: Record<number, [number, number]>, year: number): Date {
  const known = table[year]
  if (known) return new Date(year, known[0], known[1])
  const years = Object.keys(table).map(Number)
  const near = years.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a))
  return new Date(year, table[near][0], table[near][1])
}

export function lunarNewYear(year: number) {
  return fromTable(LUNAR_NEW_YEAR, year)
}

export function diwali(year: number) {
  return fromTable(DIWALI, year)
}

/** The first evening of Hanukkah as a date. */
export function hanukkahStart(year: number) {
  const [y, m, d] = hanukkahEve(year)
  return new Date(y, m, d)
}

/** The animal of the Lunar New Year that starts in a Gregorian year. */
export function zodiacOf(year: number) {
  return ZODIAC[(((year - 4) % 12) + 12) % 12]
}

/** The seven principles of Kwanzaa, one for each day from 26 December. */
export const KWANZAA_PRINCIPLES = ['Umoja', 'Kujichagulia', 'Ujima', 'Ujamaa', 'Nia', 'Kuumba', 'Imani']
