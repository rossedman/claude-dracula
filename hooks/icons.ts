// Vector icons as SVG source for the remote surfaces.
import { colors } from './tokens'

/** The Claude avatar: a four-point spark on a rounded current-line tile. */
export function sparkTile(accent: string, tile: string = colors.currentLine): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
    `<rect width="24" height="24" rx="7" fill="${tile}"/>`,
    `<path d="M12 4.5 L13.9 10.1 L19.5 12 L13.9 13.9 L12 19.5 L10.1 13.9 L4.5 12 L10.1 10.1 Z" fill="${accent}"/>`,
    '</svg>',
  ].join('')
}

/** The spooky-mode avatar: an original bat silhouette on the same tile. */
export function batTile(accent: string, tile: string = colors.currentLine): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
    `<rect width="24" height="24" rx="7" fill="${tile}"/>`,
    '<g transform="translate(12 12) scale(1.3) translate(-12 -12)">',
    `<path fill="${accent}" d="M12 9.2 L11.1 7.6 L10.7 9.6 C9.1 8.6 6.6 8.3 3.6 9.1 C5 10 5.6 11.4 5.5 13 C6.4 12.3 7.6 12.2 8.5 12.9 C8.9 13.9 9.8 14.5 10.7 14.5 L12 16.6 L13.3 14.5 C14.2 14.5 15.1 13.9 15.5 12.9 C16.4 12.2 17.6 12.3 18.5 13 C18.4 11.4 19 10 20.4 9.1 C17.4 8.3 14.9 8.6 13.3 9.6 L12.9 7.6 Z"/>`,
    `<circle cx="11.1" cy="10.9" r=".55" fill="${tile}"/>`,
    `<circle cx="12.9" cy="10.9" r=".55" fill="${tile}"/>`,
    '</g>',
    '</svg>',
  ].join('')
}

/** The reply card's header mark on the remote surfaces: a crescent moon and two stars. */
export function moonTile(accent: string, star: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
    `<path fill="${accent}" d="M10.6 2.2 A6 6 0 1 0 13.8 11.4 A4.8 4.8 0 1 1 10.6 2.2 Z"/>`,
    `<circle cx="12.6" cy="3.6" r=".7" fill="${star}"/>`,
    `<circle cx="14.4" cy="7" r=".45" fill="${star}"/>`,
    '</svg>',
  ].join('')
}
