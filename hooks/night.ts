// The night outside: the moon's phase, the local hour and what the hour is called.

const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const SYNODIC_DAYS = 29.530588853
const PHASES = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

/** The moon's phase on a date, as one of eight emoji. */
export function moonPhase(now: number): string {
  const days = (now - NEW_MOON) / 86_400_000
  const age = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS
  return PHASES[Math.round((age / SYNODIC_DAYS) * 8) % 8] ?? PHASES[0] ?? ''
}

/** Hours and minutes on the host's clock, given its offset from UTC in minutes. */
export function localTime(now: number, utcOffset: number | null): { hour: number; minute: number } {
  const date = new Date(now + (utcOffset ?? -new Date(now).getTimezoneOffset()) * 60_000)
  return { hour: date.getUTCHours(), minute: date.getUTCMinutes() }
}

/** `3:12am`. */
export function clockText({ hour, minute }: { hour: number; minute: number }): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`
}

/** What the hour is called, spooky mode. */
export function hourName(hour: number): string {
  if (hour < 3) return 'the witching hour'
  if (hour < 6) return 'the dead of night'
  if (hour < 9) return 'dawn approaches'
  if (hour < 18) return 'daylight, regrettably'
  if (hour < 21) return 'dusk'
  return 'nightfall'
}

/** `+0130` or `-0500` as minutes east of UTC; null for anything else. */
export function parseOffset(text: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (!m) return null
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -minutes : minutes
}
