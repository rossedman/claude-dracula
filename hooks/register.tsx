import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, Register, Timer } from 'claude-code'

import type { CryptStats, DraculaSettings, Night } from '../types'
import { batTile, moonTile, sparkTile } from './icons'
import type { Kit } from './markdown'
import { draculaMarkdown } from './markdown'
import { clockText, hourName, localTime, moonPhase, parseOffset } from './night'
import {
  SEGMENTS,
  accents,
  alucard,
  dracula,
  defaultAccent,
  modeSegments,
  parseAccent,
  pick,
  spookyPastWords,
  spookyWords,
  themed,
} from './tokens'
import type { Palette } from './tokens'
import { changeCounts, drawGroup, drawResult, toolColor, toolName } from './tools'

const STORE_KEY = 'settings'
const settings = atom({ plugin: 'dracula', key: 'settings' } as const, {
  enabled: true,
  accent: defaultAccent,
  spooky: true,
  sound: false,
  theme: 'dracula',
  persona: false,
} as DraculaSettings)
const frame = atom({ plugin: 'dracula', key: 'frame' } as const, 0)
const crypt = atom({ plugin: 'dracula', key: 'crypt' } as const, { tools: {}, errors: 0, files: [] } as CryptStats)
const night = atom({ plugin: 'dracula', key: 'night' } as const, { branch: null, utcOffset: null, now: 0 } as Night)

const ORGAN = { asset: 'sounds/organ.wav' } as const
const TOLL = { asset: 'sounds/toll.wav' } as const
const FLAP = { asset: 'sounds/flap.wav' } as const
const RISE = { asset: 'sounds/rise.wav' } as const

const CRYPT_PANE = 'dracula-crypt'

/** The working line: this many cells, the bat flitting over the filled part. */
const TRACK = 12
const FRAME_MS = 140
/** A shell command that runs at least this long earns a wing flap when it ends. */
const LONG_COMMAND_MS = 20_000

const PERSONA = [
  'Write with a faint gothic flavor, as a courteous old count of the night might: an occasional',
  'turn of phrase about shadows, candlelight, the crypt or the small hours, at most one per reply,',
  'and never inside code, commands, file paths or anything the person will copy. Clarity, accuracy',
  'and brevity come first; drop the flavor entirely for errors, warnings and anything serious.',
].join(' ')

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

/** The palette and the accent in it, for the current settings. */
function look(current: DraculaSettings): { c: Palette; accent: string } {
  const c = current.theme === 'alucard' ? alucard : dracula
  return { c, accent: themed(current.accent, c) }
}

/** The Dracula drawing, or the engine's plain one should the parse ever throw. */
function draw(dracula: () => JSX.Element, plain: () => JSX.Element): JSX.Element {
  try {
    return dracula()
  } catch {
    return plain()
  }
}

/** Text cut to a width with an ellipsis, or padded out to it. */
function fit(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

/** The checkout's branch, or null outside a git repository. */
async function readBranch($: EngineInterface): Promise<string | null> {
  try {
    const run = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 2000 })
    const name = run.stdout.trim()
    return run.exitCode === 0 && name ? name : null
  } catch {
    return null
  }
}

/** What a call did, kept for the crypt and the band, and the sound cue it earns. */
async function afterCall(
  $: EngineInterface,
  e: Args<'tool.call'>,
  ran: { isError?: boolean; result?: unknown },
  startedAt: number,
): Promise<void> {
  const isError = ran.isError === true
  const counts = !isError && (e.tool === 'Edit' || e.tool === 'Write') ? changeCounts(ran.result) : null
  const path = (e as { file_path?: unknown }).file_path
  await update($, crypt, stats => {
    const tools = { ...stats.tools, [e.tool]: (stats.tools[e.tool] ?? 0) + 1 }
    let files = stats.files
    if (counts && typeof path === 'string') {
      const prior = files.find(file => file.path === path)
      const file = {
        path,
        added: (prior?.added ?? 0) + counts.added,
        removed: (prior?.removed ?? 0) + counts.removed,
        edits: (prior?.edits ?? 0) + 1,
      }
      files = [...files.filter(one => one.path !== path), file].slice(-100)
    }
    return { tools, errors: stats.errors + (isError ? 1 : 0), files }
  })

  const command = (e as { command?: unknown }).command
  if (e.tool === 'Bash' && typeof command === 'string' && /\bgit\b/.test(command)) {
    const branch = await readBranch($)
    await update($, night, current => ({ ...current, branch }))
  }

  const { enabled, sound } = await read($, settings)
  if (enabled && sound) {
    const elapsed = startedAt > 0 ? (await $.clock.now()) - startedAt : 0
    const clip = isError
      ? TOLL
      : e.tool === 'ExitPlanMode'
        ? RISE
        : e.tool === 'Bash' && elapsed >= LONG_COMMAND_MS
          ? FLAP
          : null
    if (clip) void $.audio.play(clip, { gain: 0.7 }).catch(() => undefined)
  }
}

const HELP = [
  '`/dracula on` / `off` turns the theme on or off.',
  `\`/dracula accent <${Object.keys(accents).join('|')}|#hex>\` swaps the accent.`,
  '`/dracula dark` / `light` switches between Dracula and its light sibling, Alucard.',
  '`/dracula spooky on` / `off` turns the bat avatar and vampire words on or off.',
  '`/dracula sound on` / `off` plays an organ sting when a turn finishes, and cues for errors, long commands and approved plans (macOS).',
  '`/dracula persona on` / `off` gives Claude a faint gothic voice.',
  '`/dracula crypt` opens a pane of what this session has touched.',
  '`/dracula status` shows the current settings.',
].join('\n')

export const register: Register = on => {
  let ticker: Timer | null = null
  let tickerStop: Timer | null = null
  let minutes: Timer | null = null

  const stopTicker = () => {
    ticker?.cancel()
    tickerStop?.cancel()
    ticker = null
    tickerStop = null
  }

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
        theme: saved.theme === 'alucard' ? ('alucard' as const) : ('dracula' as const),
        persona: typeof saved.persona === 'boolean' ? saved.persona : false,
      }))
    }
    await $.command.register({
      name: 'dracula',
      description:
        'Dracula theme: on, off, accent <name|#hex>, dark, light, spooky, sound, persona, crypt, status',
    })

    const result = await next(e)

    // The band's branch, clock and moon; read now, the clock once a minute.
    const [branch, offset, now] = await Promise.all([
      readBranch($),
      $.process.run(['date', '+%z'], { timeoutMs: 2000 }).then(
        run => parseOffset(run.stdout),
        () => null,
      ),
      $.clock.now().catch(() => 0),
    ])
    await update($, night, () => ({ branch, utcOffset: offset, now }))
    minutes?.cancel()
    minutes = $.clock.every(60_000, () => {
      void $.clock.now().then(time => update($, night, current => ({ ...current, now: time })))
    })

    return result

  })

  on('command.run', { command: 'dracula' }, async ($, e) => {
    const [verb = 'status', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const current = await read($, settings)
    let changed: DraculaSettings | null = null

    if (verb === 'crypt') {
      await $.ui.open({ id: CRYPT_PANE, title: 'Crypt' })
      return { text: 'The crypt is open.' }
    }

    if (verb === 'on' || verb === 'off') {
      changed = { ...current, enabled: verb === 'on' }
    } else if (verb === 'dark' || verb === 'light') {
      changed = { ...current, theme: verb === 'light' ? 'alucard' : 'dracula', enabled: true }
    } else if (verb === 'accent') {
      const accent = parseAccent(rest.join(' '))
      if (!accent) return { text: `Unknown accent. ${HELP}` }
      changed = { ...current, accent, enabled: true }
    } else if (
      (verb === 'spooky' || verb === 'sound' || verb === 'persona') &&
      (rest[0] === 'on' || rest[0] === 'off')
    ) {
      changed = { ...current, [verb]: rest[0] === 'on' }
    } else if (verb !== 'status') {
      return { text: HELP }
    }

    if (changed) {
      const next = changed
      await update($, settings, () => next)
      await $.store.set(STORE_KEY, next)
      if (!next.enabled) stopTicker()
      const name = next.theme === 'alucard' ? 'Alucard' : 'Dracula'
      $.ui.toast(next.enabled ? `${name} on · accent ${next.accent}` : 'Dracula off')
      if (verb === 'sound' && next.sound) {
        void $.audio.play(ORGAN).catch(() => undefined)
      }
    }

    const now = changed ?? current
    const onOff = (value: boolean | undefined) => (value ? 'on' : 'off')
    return {
      text: `Dracula is ${onOff(now.enabled)}, theme ${now.theme ?? 'dracula'}, accent ${now.accent}, spooky ${onOff(now.spooky)}, sound ${onOff(now.sound)}, persona ${onOff(now.persona)}.`,
    }
  })

  // The working line's bat flies while a turn runs.
  on('prompt.submit', async ($, e, next) => {
    try {
      const { enabled } = await read($, settings)
      if (enabled) {
        stopTicker()
        ticker = $.clock.every(FRAME_MS, () => {
          void update($, frame, n => (n + 1) % 10_000)
        })
        tickerStop = $.clock.after(15 * 60_000, stopTicker)
      }
    } catch {
      // A still bat never costs the prompt.
    }

    return next(e)
  })

  // The organ sting when the main conversation's turn ends with an answer.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) stopTicker()
    const { enabled, sound } = await read($, settings)
    if (enabled && sound && e.reason === 'answer' && !e.agentId) {
      void $.audio.play(ORGAN, { gain: 0.6 }).catch(() => undefined)
    }

    return result
  })

  // What each call did, for the crypt and the band, and the sound cues.
  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now().catch(() => 0)
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    try {
      await afterCall($, e, ran, startedAt)
    } catch {
      // Bookkeeping never costs the call its result.
    }

    return ran
  })

  // The persona: one section after the engine's own.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const { enabled, persona } = await read($, settings)
    if (!enabled || !persona) return result

    return { sections: [...result.sections, { id: 'dracula:persona', text: PERSONA, scope: 'session' as const }] }
  })

  // The person's own prompt: a current-line bubble with a rounded accent border.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.isExpanded || !PROMPT_ORIGINS.has(e.props.origin.kind)) {
      return next(e)
    }
    const { c, accent } = look(current)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" justifyContent="flex-end" marginY={1}>
        <Box borderStyle="round" borderColor={accent} backgroundColor={c.currentLine} paddingX={1}>
          <Text color={c.foreground}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  // Claude's reply: a spark (or bat) avatar on the first block, the reply in a raised
  // rounded card under a moon-marked header, its markdown drawn in Dracula colors.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.isSummary) return next(e)
    const { c, accent } = look(current)
    const { spooky } = current
    const { Box, Link, Markdown, Text } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'
    const kit: Kit = { Box, Text, Link, c }

    let avatar: JSX.Element
    let header: JSX.Element | null = null
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
      const source = spooky ? batTile(accent, c.currentLine) : sparkTile(accent, c.currentLine)
      avatar = <Svg source={source} alt="Claude" width={24} height={24} />
      header = (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Svg source={moonTile(accent, c.yellow)} alt="" width={14} height={14} />
          <Text color={accent} bold size="footnote">
            Claude
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={1}>
        {avatar}
        <Box
          flexGrow={1}
          flexDirection="column"
          borderStyle="round"
          borderColor={c.comment}
          backgroundColor={c.raised}
          paddingX={1}
        >
          {header}
          {draw(
            () => draculaMarkdown(e.props.text, kit, !isTerminal),
            () => (
              <Markdown text={e.props.text} />
            ),
          )}
        </Box>
      </Box>
    )
  })

  // The working line: a track that fills as the turn moves along, a bat flitting over it.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled) return next(e)
    const { c, accent } = look(current)
    const { spooky } = current
    const tick = await read($, frame)
    const { Box, Text } = $.ui.resolve(e)
    const filled = Math.max(1, Math.round(((modeSegments[e.props.mode] ?? 1) / SEGMENTS) * TRACK))
    // Ping-pong over the filled cells.
    const span = Math.max(1, filled - 1)
    const step = tick % (span * 2)
    const at = Math.min(filled - 1, step <= span ? step : span * 2 - step)
    const flyer = spooky ? '🦇' : tick % 2 === 0 ? '✦' : '✧'
    const word = spooky ? pick(spookyWords, e.props.word) : e.props.word
    const label = e.props.message ?? `${word}${e.props.suffix}`

    return (
      <Box flexDirection="row" gap={1}>
        <Text>
          <Text color={accent}>{'━'.repeat(at)}</Text>
          <Text color={accent}>{flyer}</Text>
          <Text color={accent}>{'━'.repeat(filled - at - 1)}</Text>
          <Text color={c.currentLine}>{'━'.repeat(TRACK - filled)}</Text>
        </Text>
        <Text color={c.pink}>{label}</Text>
      </Box>
    )
  })

  // A tool call: a status dot, the tool in its color, its argument; a shell
  // command as a pink prompt and the command in yellow.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.isExpanded) return next(e)
    const { c } = look(current)
    const { Box, Text } = $.ui.resolve(e)
    const status = e.props.isErrored
      ? { color: c.red, word: 'error' }
      : e.props.isInterrupted
        ? { color: c.comment, word: 'stopped' }
        : e.props.isRunning
          ? { color: c.orange, word: 'running' }
          : { color: c.green, word: 'done' }
    const arg = summarize(e.props.input)
    const isShell = e.props.tool === 'Bash' && arg.length > 0

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={status.color}>●</Text>
        {isShell ? (
          <Text color={c.pink} bold>
            $
          </Text>
        ) : (
          <Text color={toolColor(e.props.tool, c)} bold>
            {toolName(e.props.tool)}
          </Text>
        )}
        {arg.length > 0 && (
          <Text color={isShell ? c.yellow : c.comment} wrap="truncate-end">
            {arg}
          </Text>
        )}
        <Text color={status.color}>{status.word}</Text>
      </Box>
    )
  })

  // A tool's result, hung from a gutter mark: the mod's own drawing for diffs, shell
  // output, reads and searches; the engine's for errors and every other tool.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled) return next(e)
    const { c } = look(current)
    const { Box, Link, Text } = $.ui.resolve(e)
    const kit: Kit = { Box, Text, Link, c }
    let ours: JSX.Element | null = null
    if (!e.props.isErrored) {
      try {
        ours = drawResult(e.props.tool, e.props.output, kit, e.surface !== 'terminal')
      } catch {
        ours = null
      }
    }
    const drawn = ours ?? (await next(e))

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={e.props.isErrored ? c.red : c.comment}>╰</Text>
        <Box flexGrow={1} flexDirection="column">
          {drawn}
        </Box>
      </Box>
    )
  })

  // A folded run of reads and searches: one row of tool chips.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.isExpanded || e.props.calls.length === 0) return next(e)
    const { c } = look(current)
    const { Box, Link, Text } = $.ui.resolve(e)

    return drawGroup(e.props.calls, e.props.isActive, { Box, Text, Link, c })
  })

  // The line closing a turn (terminal): a diamond, a word and the duration.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.isExpanded || e.props.waitingFor) return next(e)
    const { c, accent } = look(current)
    const { Text } = $.ui.resolve(e)
    const seconds = Math.max(1, Math.round(e.props.durationMs / 1000))
    const shown = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

    return (
      <Text color={c.comment}>
        <Text color={accent}>◆</Text>{' '}
        {current.spooky ? `${pick(spookyPastWords, e.props.word)} for ${shown}` : shown}
      </Text>
    )
  })

  // The band above the prompt: the palette's dots, the theme, the branch, the
  // session's tool count, and the moon and the hour.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.hasSurvey) return next(e)
    const { c, accent } = look(current)
    const { branch, utcOffset, now } = await read($, night)
    const stats = await read($, crypt)
    const { Box, Text } = $.ui.resolve(e)
    const palette = [c.purple, c.pink, c.cyan, c.green, c.orange]
    const dots = [accent, ...palette.filter(color => color !== accent)].slice(0, 5)
    const calls = Object.values(stats.tools).reduce((sum, n) => sum + n, 0)
    const time = now > 0 ? localTime(now, utcOffset) : null

    return (
      <Box flexDirection="row" gap={1}>
        <Text>
          {dots.map(color => (
            <Text color={color}>● </Text>
          ))}
        </Text>
        <Text color={c.comment}>{c.name}</Text>
        {branch && (
          <Text color={c.comment}>
            · <Text color={c.purple}>⎇ {branch}</Text>
          </Text>
        )}
        {calls > 0 && (
          <Text color={c.comment}>
            · <Text color={c.cyan}>{calls}</Text> {calls === 1 ? 'tool' : 'tools'}
            {stats.errors > 0 && (
              <Text>
                , <Text color={c.red}>{stats.errors}</Text> failed
              </Text>
            )}
          </Text>
        )}
        {time && (
          <Text color={c.comment} wrap="truncate-end">
            · {moonPhase(now)} <Text color={c.yellow}>{clockText(time)}</Text>
            {current.spooky && <Text italic> {hourName(time.hour)}</Text>}
          </Text>
        )}
      </Box>
    )
  })

  // The footer's mode labels as accent pills.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.modes.length === 0) return next(e)
    const { c, accent } = look(current)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        {e.props.modes.map(mode => (
          <Text backgroundColor={c.currentLine} color={accent}>
            {` ${mode} `}
          </Text>
        ))}
      </Box>
    )
  })

  // The hint under the prompt, in comment gray (desktop; the terminal keeps its live pills).
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.surface === 'terminal' || e.props.hint.trim() === '') return next(e)
    const { c } = look(current)
    const { Text } = $.ui.resolve(e)

    return <Text color={c.comment}>{e.props.hint}</Text>
  })

  // The notices under the logo, their command in pink.
  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled) return next(e)
    const { c } = look(current)
    const { Text } = $.ui.resolve(e)

    return (
      <Text color={c.comment}>
        {e.props.text}
        {e.props.command && <Text color={c.pink}> {e.props.command}</Text>}
      </Text>
    )
  })

  // /dracula's own answers, in an accent card.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const current = await read($, settings)
    if (!current.enabled || e.props.isErrored || e.props.command !== 'dracula') return next(e)
    const { c, accent } = look(current)
    const { Box, Link, Markdown, Text } = $.ui.resolve(e)

    return (
      <Box borderStyle="round" borderColor={accent} paddingX={1}>
        {draw(
          () => draculaMarkdown(e.props.text, { Box, Text, Link, c }, e.surface !== 'terminal'),
          () => (
            <Markdown text={e.props.text} />
          ),
        )}
      </Box>
    )
  })

  // The crypt: what this session has run and touched, as bars in the palette.
  on('ui.render', { component: 'Pane', requestId: CRYPT_PANE }, async ($, e) => {
    const current = await read($, settings)
    const { c, accent } = look(current)
    const stats = await read($, crypt)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns)
    const tools = Object.entries(stats.tools).sort((a, b) => b[1] - a[1])
    const files = [...stats.files].sort((a, b) => b.added + b.removed - (a.added + a.removed))
    const nameWidth = Math.min(14, Math.max(4, ...tools.map(([tool]) => toolName(tool).length)))
    const toolMax = Math.max(1, ...tools.map(([, n]) => n))
    const barRoom = Math.max(4, width - nameWidth - 8)
    const fileMax = Math.max(1, ...files.map(file => file.added + file.removed))
    const fileBar = Math.max(4, Math.min(24, Math.floor(width / 3)))
    const pathRoom = Math.max(8, width - fileBar - 16)
    const shortPath = (path: string) => (path.length > pathRoom ? `…${path.slice(-(pathRoom - 1))}` : path)

    return (
      <Box flexDirection="column" gap={1}>
        <Text color={accent} bold>
          ☾ The Crypt
        </Text>
        {tools.length === 0 && (
          <Text color={c.comment} italic>
            Nothing has stirred yet.
          </Text>
        )}
        {tools.length > 0 && (
          <Box flexDirection="column">
            <Text color={c.pink} bold>
              Tools
            </Text>
            {tools.map(([tool, n]) => (
              <Text>
                <Text color={toolColor(tool, c)}>{fit(toolName(tool), nameWidth)}</Text>{' '}
                <Text color={toolColor(tool, c)}>{'█'.repeat(Math.max(1, Math.round((n / toolMax) * barRoom)))}</Text>
                <Text color={c.comment}> {n}</Text>
              </Text>
            ))}
            {stats.errors > 0 && (
              <Text color={c.red}>
                {stats.errors} {stats.errors === 1 ? 'call' : 'calls'} failed
              </Text>
            )}
          </Box>
        )}
        {files.length > 0 && (
          <Box flexDirection="column">
            <Text color={c.pink} bold>
              Files touched
            </Text>
            {files.slice(0, 30).map(file => {
              const scale = fileBar / fileMax
              const plus = file.added > 0 ? Math.max(1, Math.round(file.added * scale)) : 0
              const minus = file.removed > 0 ? Math.max(1, Math.round(file.removed * scale)) : 0
              return (
                <Text>
                  <Text color={c.green}>{'▇'.repeat(plus)}</Text>
                  <Text color={c.red}>{'▇'.repeat(minus)}</Text>
                  {' '.repeat(Math.max(1, fileBar - plus - minus + 1))}
                  <Text color={c.cyan}>{shortPath(file.path)}</Text>{' '}
                  <Text color={c.green}>+{file.added}</Text> <Text color={c.red}>−{file.removed}</Text>
                </Text>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
