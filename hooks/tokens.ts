// Pixelstack palette: the Dracula color scheme (https://draculatheme.com, MIT).
export const colors = {
  background: '#282A36',
  currentLine: '#44475A',
  foreground: '#F8F8F2',
  comment: '#6272A4',
  cyan: '#8BE9FD',
  green: '#50FA7B',
  orange: '#FFB86C',
  pink: '#FF79C6',
  purple: '#BD93F9',
  red: '#FF5555',
  yellow: '#F1FA8C',
} as const

export const accents: Record<string, string> = {
  purple: colors.purple,
  pink: colors.pink,
  cyan: colors.cyan,
  green: colors.green,
  orange: colors.orange,
}

export const defaultAccent: string = colors.purple

/** Turns a preset name or a #rgb / #rrggbb hex into a color, or null. */
export function parseAccent(input: string): string | null {
  const value = input.trim().toLowerCase()
  const preset = accents[value]
  if (preset) return preset
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value) ? value.toUpperCase() : null
}

/** Filled segments of the progress line for each turn mode. */
export const modeSegments: Record<string, number> = {
  requesting: 2,
  thinking: 3,
  'tool-input': 5,
  'tool-use': 6,
  responding: 7,
}

export const SEGMENTS = 8

/** Working words while a turn runs, spooky mode. */
export const spookyWords = [
  'Lurking',
  'Brooding',
  'Haunting',
  'Conjuring',
  'Skulking',
  'Creeping',
  'Summoning',
  'Prowling',
  'Scheming',
  'Bewitching',
]

/** Past-tense words for the line closing a turn, spooky mode. */
export const spookyPastWords = ['Fed', 'Lurked', 'Haunted', 'Brooded', 'Conjured', 'Prowled', 'Feasted']

/** Picks a word from `list`, stable for the same `seed`. */
export function pick(list: readonly string[], seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return list[Math.abs(hash) % list.length] ?? list[0] ?? ''
}
