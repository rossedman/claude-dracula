import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { DraculaSettings } from '../types'
import { batTile, sparkTile } from './icons'
import {
  SEGMENTS,
  accents,
  colors,
  defaultAccent,
  modeSegments,
  parseAccent,
  pick,
  spookyPastWords,
  spookyWords,
} from './tokens'

const STORE_KEY = 'settings'
const settings = atom({ plugin: 'dracula', key: 'settings' } as const, {
  enabled: true,
  accent: defaultAccent,
  spooky: true,
  sound: false,
} as DraculaSettings)

const ORGAN = { asset: 'sounds/organ.wav' } as const

// Accents saved by the earlier blocky palette; they move to the Dracula default.
const RETIRED_ACCENTS = new Set(['#79B33D', '#E8B83A', '#6FB7E8', '#D9553B'])

const PROMPT_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

/** A one-line summary of a tool call's input: its command, path, pattern or url. */
function summarize(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      const line = value.split('\n')[0] ?? ''
      return line.length > 60 ? `${line.slice(0, 57)}...` : line
    }
  }
  return ''
}

const HELP = [
  '`/dracula on` / `off` turns the theme on or off.',
  `\`/dracula accent <${Object.keys(accents).join('|')}|#hex>\` swaps the accent.`,
  '`/dracula spooky on` / `off` turns the bat avatar and vampire words on or off.',
  '`/dracula sound on` / `off` plays an organ sting when a turn finishes (macOS).',
  '`/dracula status` shows the current settings.',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get(STORE_KEY)) as Partial<DraculaSettings> | undefined
    if (saved && typeof saved === 'object') {
      await update($, settings, current => ({
        enabled: typeof saved.enabled === 'boolean' ? saved.enabled : current.enabled,
        accent:
          typeof saved.accent === 'string' && !RETIRED_ACCENTS.has(saved.accent)
            ? saved.accent
            : current.accent,
        spooky: typeof saved.spooky === 'boolean' ? saved.spooky : current.spooky,
        sound: typeof saved.sound === 'boolean' ? saved.sound : current.sound,
      }))
    }
    await $.command.register({
      name: 'dracula',
      description: 'Dracula theme: on, off, accent <name|#hex>, spooky on|off, sound on|off, status',
    })

    return next(e)
  })

  on('command.run', { command: 'dracula' }, async ($, e) => {
    const [verb = 'status', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const current = await read($, settings)
    let changed: DraculaSettings | null = null

    if (verb === 'on' || verb === 'off') {
      changed = { ...current, enabled: verb === 'on' }
    } else if (verb === 'accent') {
      const accent = parseAccent(rest.join(' '))
      if (!accent) return { text: `Unknown accent. ${HELP}` }
      changed = { ...current, accent, enabled: true }
    } else if ((verb === 'spooky' || verb === 'sound') && (rest[0] === 'on' || rest[0] === 'off')) {
      changed = { ...current, [verb]: rest[0] === 'on' }
    } else if (verb !== 'status') {
      return { text: HELP }
    }

    if (changed) {
      const next = changed
      await update($, settings, () => next)
      await $.store.set(STORE_KEY, next)
      $.ui.toast(next.enabled ? `Dracula on · accent ${next.accent}` : 'Dracula off')
      if (verb === 'sound' && next.sound) {
        void $.audio.play(ORGAN).catch(() => undefined)
      }
    }

    const now = changed ?? current
    const onOff = (value: boolean) => (value ? 'on' : 'off')
    return {
      text: `Dracula is ${onOff(now.enabled)}, accent ${now.accent}, spooky ${onOff(now.spooky)}, sound ${onOff(now.sound)}.`,
    }
  })

  // The organ sting when the main conversation's turn ends with an answer.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const { enabled, sound } = await read($, settings)
    if (enabled && sound && e.reason === 'answer' && !e.agentId) {
      void $.audio.play(ORGAN, { gain: 0.6 }).catch(() => undefined)
    }

    return result
  })

  // The person's own prompt: a current-line bubble with a rounded accent border.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled || e.props.isExpanded || !PROMPT_ORIGINS.has(e.props.origin.kind)) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" justifyContent="flex-end" marginY={1}>
        <Box borderStyle="round" borderColor={accent} backgroundColor={colors.currentLine} paddingX={1}>
          <Text color={colors.foreground}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  // Claude's reply: a spark (or bat) avatar on the first block, the reply in a rounded card.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const { enabled, accent, spooky } = await read($, settings)
    if (!enabled || e.props.isSummary) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'

    let avatar: JSX.Element
    if (!e.props.isFirstOfReply) {
      avatar = <Box width={isTerminal ? (spooky ? 2 : 1) : 24} />
    } else if (e.surface === 'terminal') {
      avatar = (
        <Text color={accent} bold>
          {spooky ? '🦇' : '✦'}
        </Text>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      const source = spooky ? batTile(accent) : sparkTile(accent)
      avatar = <Svg source={source} alt="Claude" width={24} height={24} />
    }

    return (
      <Box flexDirection="row" gap={1}>
        {avatar}
        <Box flexGrow={1} borderStyle="round" borderColor={colors.comment} paddingX={1}>
          <Markdown text={e.props.text} />
        </Box>
      </Box>
    )
  })

  // The working line: a segmented progress line that fills as the turn moves along.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const { enabled, accent, spooky } = await read($, settings)
    if (!enabled) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const filled = modeSegments[e.props.mode] ?? 1
    const word = spooky ? pick(spookyWords, e.props.word) : e.props.word
    const label = e.props.message ?? `${word}${e.props.suffix}`

    return (
      <Box flexDirection="row" gap={1}>
        <Text>
          <Text color={accent}>{'━'.repeat(filled)}</Text>
          <Text color={colors.currentLine}>{'━'.repeat(SEGMENTS - filled)}</Text>
        </Text>
        <Text color={colors.pink}>{label}</Text>
      </Box>
    )
  })

  // A tool call: a status dot, the tool in cyan, its argument in comment gray.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { enabled } = await read($, settings)
    if (!enabled || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const status = e.props.isErrored
      ? { color: colors.red, word: 'error' }
      : e.props.isInterrupted
        ? { color: colors.comment, word: 'stopped' }
        : e.props.isRunning
          ? { color: colors.orange, word: 'running' }
          : { color: colors.green, word: 'done' }
    const arg = summarize(e.props.input)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={status.color}>●</Text>
        <Text color={colors.cyan} bold>
          {e.props.tool}
        </Text>
        {arg.length > 0 && (
          <Text color={colors.comment} wrap="truncate-end">
            {arg}
          </Text>
        )}
        <Text color={status.color}>{status.word}</Text>
      </Box>
    )
  })

  // A tool's result: the engine's own drawing, hung from a gutter mark in the status color.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { enabled } = await read($, settings)
    if (!enabled) return next(e)
    const drawn = await next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={e.props.isErrored ? colors.red : colors.comment}>╰</Text>
        <Box flexGrow={1} flexDirection="column">
          {drawn}
        </Box>
      </Box>
    )
  })

  // The line closing a turn (terminal): a diamond, a word and the duration.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const { enabled, accent, spooky } = await read($, settings)
    if (!enabled || e.props.isExpanded || e.props.waitingFor) return next(e)
    const { Text } = $.ui.resolve(e)
    const seconds = Math.max(1, Math.round(e.props.durationMs / 1000))
    const shown = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

    return (
      <Text color={colors.comment}>
        <Text color={accent}>◆</Text> {spooky ? `${pick(spookyPastWords, e.props.word)} for ${shown}` : shown}
      </Text>
    )
  })

  // The band above the prompt: the palette's dots and the theme's name.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const palette = [colors.purple, colors.pink, colors.cyan, colors.green, colors.orange]
    const dots = [accent, ...palette.filter(color => color !== accent)].slice(0, 5)

    return (
      <Box flexDirection="row" gap={1}>
        <Text>
          {dots.map(color => (
            <Text color={color}>● </Text>
          ))}
        </Text>
        <Text color={colors.comment}>dracula</Text>
      </Box>
    )
  })
}
