// claude-dracula palettes: the Dracula color scheme and its light sibling Alucard
// (https://draculatheme.com, MIT).
export type Palette = {
  name: 'dracula' | 'alucard'
  background: string
  /** A step darker than the background (lighter on Alucard): the reply card. */
  raised: string
  currentLine: string
  /** Row tints behind a diff's added and removed lines. */
  added: string
  removed: string
  foreground: string
  comment: string
  cyan: string
  green: string
  orange: string
  pink: string
  purple: string
  red: string
  yellow: string
}

export const dracula: Palette = {
  name: 'dracula',
  background: '#282A36',
  raised: '#21222C',
  currentLine: '#44475A',
  added: '#2B3D33',
  removed: '#43293A',
  foreground: '#F8F8F2',
  comment: '#6272A4',
  cyan: '#8BE9FD',
  green: '#50FA7B',
  orange: '#FFB86C',
  pink: '#FF79C6',
  purple: '#BD93F9',
  red: '#FF5555',
  yellow: '#F1FA8C',
}

export const alucard: Palette = {
  name: 'alucard',
  background: '#FFFBEB',
  raised: '#F5F0DA',
  currentLine: '#CFCFDE',
  added: '#DDEFD6',
  removed: '#F6DCD8',
  foreground: '#1F1F1F',
  comment: '#635D97',
  cyan: '#036A96',
  green: '#14710A',
  orange: '#A34D14',
  pink: '#A3144D',
  purple: '#644AC9',
  red: '#CB3A2A',
  yellow: '#846E15',
}

/** The dark palette, for code that draws the same in either theme. */
export const colors = dracula

/** Each Dracula accent's Alucard counterpart, so a preset follows the theme. */
export function themed(accent: string, palette: Palette): string {
  if (palette.name === 'dracula') return accent
  const preset = (Object.keys(accents) as (keyof Palette)[]).find(key => dracula[key] === accent)
  return preset ? palette[preset] : accent
}

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
