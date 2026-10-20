export type PixelstackSettings = {
  enabled: boolean
  accent: string
  /** Bat avatar and vampire working/closing words. */
  spooky: boolean
  /** Organ sting when a turn finishes (macOS). */
  sound: boolean
}

declare module 'claude-code' {
  interface PluginState {
    pixelstack: { settings: PixelstackSettings }
  }
}
