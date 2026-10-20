import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { PixelstackSettings } from '../types'
import { sparkTile } from './icons'
import { BLOCKS, accents, colors, defaultAccent, modeBlocks, parseAccent } from './tokens'

const STORE_KEY = 'settings'
const settings = atom({ plugin: 'pixelstack', key: 'settings' } as const, {
  enabled: true,
  accent: defaultAccent,
} as PixelstackSettings)

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
  '`/pixelstack on` / `off` turns the theme on or off.',
  `\`/pixelstack accent <${Object.keys(accents).join('|')}|#hex>\` swaps the accent.`,
  '`/pixelstack status` shows the current settings.',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get(STORE_KEY)) as Partial<PixelstackSettings> | undefined
    if (saved && typeof saved === 'object') {
      await update($, settings, current => ({
        enabled: typeof saved.enabled === 'boolean' ? saved.enabled : current.enabled,
        accent: typeof saved.accent === 'string' ? saved.accent : current.accent,
      }))
    }
    await $.command.register({
      name: 'pixelstack',
      description: 'Pixelstack theme: on, off, accent <name|#hex>, status',
    })

    return next(e)
  })

  on('command.run', { command: 'pixelstack' }, async ($, e) => {
    const [verb = 'status', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const current = await read($, settings)
    let changed: PixelstackSettings | null = null

    if (verb === 'on' || verb === 'off') {
      changed = { ...current, enabled: verb === 'on' }
    } else if (verb === 'accent') {
      const accent = parseAccent(rest.join(' '))
      if (!accent) return { text: `Unknown accent. ${HELP}` }
      changed = { ...current, accent, enabled: true }
    } else if (verb !== 'status') {
      return { text: HELP }
    }

    if (changed) {
      const next = changed
      await update($, settings, () => next)
      await $.store.set(STORE_KEY, next)
      $.ui.toast(next.enabled ? `Pixelstack on · accent ${next.accent}` : 'Pixelstack off')
    }

    const now = changed ?? current
    return { text: `Pixelstack is ${now.enabled ? 'on' : 'off'}, accent ${now.accent}.` }
  })

  // The person's own prompt: a grass bubble, right-aligned, with a hard outline.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { enabled } = await read($, settings)
    if (!enabled || e.props.isExpanded || !PROMPT_ORIGINS.has(e.props.origin.kind)) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" justifyContent="flex-end" marginY={1}>
        <Box borderStyle="bold" borderColor={colors.soil} backgroundColor={colors.grass} paddingX={1}>
          <Text color={colors.bone}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  // Claude's reply: a pixel avatar on the first block, the reply in a wood-framed card.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled || e.props.isSummary) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'

    let avatar: JSX.Element
    if (!e.props.isFirstOfReply) {
      avatar = <Box width={isTerminal ? 1 : 24} />
    } else if (e.surface === 'terminal') {
      avatar = (
        <Text color={accent} bold>
          ▣
        </Text>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      avatar = <Svg source={sparkTile(accent)} alt="Claude" width={24} height={24} />
    }

    return (
      <Box flexDirection="row" gap={1}>
        {avatar}
        <Box flexGrow={1} borderStyle="bold" borderColor={colors.wood} paddingX={1}>
          <Markdown text={e.props.text} />
        </Box>
      </Box>
    )
  })

  // The working line: an 8-block bar that fills as the turn moves along.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const filled = modeBlocks[e.props.mode] ?? 1
    const label = e.props.message ?? e.props.word

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={accent}>{'█'.repeat(filled)}</Text>
        <Text color={colors.wood}>{'░'.repeat(BLOCKS - filled)}</Text>
        <Text color={colors.muted}>{label}</Text>
      </Box>
    )
  })

  // A tool call: a compact chip with a status block, the tool and its argument.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const status = e.props.isErrored
      ? { color: colors.ember, word: 'error' }
      : e.props.isInterrupted
        ? { color: colors.muted, word: 'stopped' }
        : e.props.isRunning
          ? { color: accent, word: 'running' }
          : { color: colors.sky, word: 'done' }
    const arg = summarize(e.props.input)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={status.color}>■</Text>
        <Text bold>{e.props.tool}</Text>
        {arg.length > 0 && <Text color={colors.muted} wrap="truncate-end">{arg}</Text>}
        <Text color={status.color} dimColor>
          {status.word}
        </Text>
      </Box>
    )
  })

  // The line closing a turn (terminal): a block and the duration.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled || e.props.isExpanded || e.props.waitingFor) return next(e)
    const { Text } = $.ui.resolve(e)
    const seconds = Math.max(1, Math.round(e.props.durationMs / 1000))
    const shown = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

    return (
      <Text color={colors.muted}>
        <Text color={accent}>■</Text> {shown}
      </Text>
    )
  })

  // The band above the prompt: an accent swatch and the theme's name.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { enabled, accent } = await read($, settings)
    if (!enabled || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={accent}>██</Text>
        <Text color={colors.muted}>Pixelstack</Text>
      </Box>
    )
  })
}
