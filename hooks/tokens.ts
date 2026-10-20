// Pixelstack palette: an earthy blocky-world look (grass, dirt, wood, stone, sky).
export const colors = {
  soil: '#1E1A14',
  stone: '#3C3F44',
  darkWood: '#3B2A1E',
  lightStone: '#55595F',
  grass: '#4F7232',
  wood: '#6B5038',
  sky: '#6FB7E8',
  gold: '#E8B83A',
  ember: '#D9553B',
  bone: '#F1EDE3',
  muted: '#BDB6A6',
} as const

export const accents: Record<string, string> = {
  leaf: '#79B33D',
  gold: '#E8B83A',
  sky: '#6FB7E8',
  ember: '#D9553B',
}

export const defaultAccent = accents.leaf ?? '#79B33D'

/** Turns a preset name or a #rgb / #rrggbb hex into a color, or null. */
export function parseAccent(input: string): string | null {
  const value = input.trim().toLowerCase()
  const preset = accents[value]
  if (preset) return preset
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value) ? value.toUpperCase() : null
}

/** Filled blocks of the 8-block progress bar for each turn mode. */
export const modeBlocks: Record<string, number> = {
  requesting: 2,
  thinking: 3,
  'tool-input': 5,
  'tool-use': 6,
  responding: 7,
}

export const BLOCKS = 8
