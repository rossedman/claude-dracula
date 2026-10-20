export type DraculaSettings = {
  enabled: boolean
  accent: string
  /** Bat avatar and vampire working/closing words. */
  spooky: boolean
  /** Organ sting when a turn finishes, and the tool cues (macOS). */
  sound: boolean
  /** Dark Dracula or its light sibling Alucard. */
  theme?: 'dracula' | 'alucard'
  /** A light gothic voice in Claude's replies. */
  persona?: boolean
}

/** One file the session touched, for the crypt pane. */
export type CryptFile = { path: string; added: number; removed: number; edits: number }

/** What the crypt pane and the band above the prompt show of the session. */
export type CryptStats = {
  tools: Record<string, number>
  errors: number
  files: CryptFile[]
}

/** Facts about the night, read at session start and after shell commands. */
export type Night = {
  branch: string | null
  /** Minutes east of UTC, from the host's clock; null when unknown. */
  utcOffset: number | null
  /** The time the band last read, in epoch milliseconds, refreshed each minute. */
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    dracula: {
      settings: DraculaSettings
      /** The working line's animation frame, ticked while a turn runs. */
      frame: number
      crypt: CryptStats
      night: Night
    }
  }
}
