// Vector icons as SVG source for the remote surfaces.
import { colors } from './tokens'

/** The Claude avatar: a four-point spark on a rounded current-line tile. */
export function sparkTile(accent: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
    `<rect width="24" height="24" rx="7" fill="${colors.currentLine}"/>`,
    `<path d="M12 4.5 L13.9 10.1 L19.5 12 L13.9 13.9 L12 19.5 L10.1 13.9 L4.5 12 L10.1 10.1 Z" fill="${accent}"/>`,
    '</svg>',
  ].join('')
}
