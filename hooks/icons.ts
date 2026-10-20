// Rect-grid pixel icons as SVG source, drawn crisp at any size.
import { colors } from './tokens'

/** The Claude avatar: a pixel spark on an accent tile with a soil outline. */
export function sparkTile(accent: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" shape-rendering="crispEdges">',
    `<rect width="10" height="10" fill="${colors.soil}"/>`,
    `<rect x="1" y="1" width="8" height="8" fill="${accent}"/>`,
    `<rect x="4" y="2" width="2" height="6" fill="${colors.soil}"/>`,
    `<rect x="2" y="4" width="6" height="2" fill="${colors.soil}"/>`,
    '</svg>',
  ].join('')
}
