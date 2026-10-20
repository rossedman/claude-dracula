export type PixelstackSettings = { enabled: boolean; accent: string }

declare module 'claude-code' {
  interface PluginState {
    pixelstack: { settings: PixelstackSettings }
  }
}
