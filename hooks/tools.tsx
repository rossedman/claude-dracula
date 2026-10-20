// Tool rows in Dracula colors: results drawn per tool (diffs, shell output, reads,
// search hits) and a folded run of calls drawn as one row of tool chips.
import type { Kit } from './markdown'
import { highlight, languageOf, untab } from './markdown'
import type { Palette } from './tokens'

/** The color a tool is known by, in chips, the crypt pane and the call row. */
export function toolColor(tool: string, c: Palette): string {
  if (tool === 'Read' || tool === 'NotebookRead') return c.cyan
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return c.green
  if (tool === 'Bash' || tool === 'PowerShell') return c.orange
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LS') return c.pink
  if (tool.startsWith('Web')) return c.purple
  if (tool === 'Agent' || tool === 'Task') return c.yellow
  if (tool.startsWith('mcp__')) return c.purple
  return c.comment
}

/**
 * A tool's name as a person reads it: an MCP tool's `mcp__server__tool` becomes
 * `server · tool`, with a plugin's `plugin_<plugin>_` prefix dropped and an id-like
 * server name (a connector's UUID) left out; built-in names pass through.
 */
export function toolName(tool: string): string {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (!m) return tool
  const server = (m[1] ?? '').replace(/^plugin_[^_]+_/, '')
  const name = m[2] ?? ''
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(server) || !server ? name : `${server} · ${name}`
}

type Hunk = { oldStart: number; newStart: number; lines: string[] }

const MAX_DIFF_LINES = 30
const MAX_OUTPUT_LINES = 10

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function hunksOf(output: Record<string, unknown>): Hunk[] {
  const patch = output.structuredPatch
  if (!Array.isArray(patch)) return []
  return patch.flatMap(raw => {
    const hunk = record(raw)
    if (!hunk || !Array.isArray(hunk.lines)) return []
    return [
      {
        oldStart: typeof hunk.oldStart === 'number' ? hunk.oldStart : 1,
        newStart: typeof hunk.newStart === 'number' ? hunk.newStart : 1,
        lines: hunk.lines.filter((line): line is string => typeof line === 'string'),
      },
    ]
  })
}

/** Lines added and removed across an Edit or Write result's hunks (or a new file's lines). */
export function changeCounts(output: unknown): { added: number; removed: number } | null {
  const out = record(output)
  if (!out) return null
  const hunks = hunksOf(out)
  if (hunks.length === 0) {
    if (out.type === 'create' && typeof out.content === 'string') {
      return { added: out.content.replace(/\n$/, '').split('\n').length, removed: 0 }
    }
    return typeof out.filePath === 'string' ? { added: 0, removed: 0 } : null
  }
  let added = 0
  let removed = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  }
  return { added, removed }
}

function counts(kit: Kit, added: number, removed: number, note?: string): JSX.Element {
  const { Text, c } = kit
  return (
    <Text>
      <Text color={c.green}>+{added}</Text> <Text color={c.red}>−{removed}</Text>
      {note && <Text color={c.comment}> {note}</Text>}
    </Text>
  )
}

function more(kit: Kit, hidden: number, what: string): JSX.Element {
  const { Text, c } = kit
  return (
    <Text color={c.comment} italic>
      … {hidden} more {what} · ctrl+o
    </Text>
  )
}

/** An Edit or Write result as a Dracula diff: counts, then numbered hunks. */
function diff(output: Record<string, unknown>, kit: Kit, mono: boolean): JSX.Element | null {
  const { Box, Text, c } = kit
  const path = typeof output.filePath === 'string' ? output.filePath : ''
  const lang = languageOf(path)
  const hunks = hunksOf(output)
  const total = changeCounts(output)
  if (!total) return null

  type Row = { old: string; new: string; mark: string; text: string }
  const rows: Row[] = []
  if (hunks.length === 0 && output.type === 'create' && typeof output.content === 'string') {
    output.content
      .replace(/\n$/, '')
      .split('\n')
      .forEach((text, i) => rows.push({ old: '', new: String(i + 1), mark: '+', text: untab(text) }))
  }
  for (const hunk of hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    if (rows.length > 0) rows.push({ old: '', new: '', mark: '⋮', text: '' })
    for (const line of hunk.lines) {
      const mark = line[0] ?? ' '
      const text = untab(line.slice(1))
      if (mark === '+') rows.push({ old: '', new: String(newLine++), mark, text })
      else if (mark === '-') rows.push({ old: String(oldLine++), new: '', mark, text })
      else if (mark !== '\\') rows.push({ old: String(oldLine++), new: String(newLine++), mark: ' ', text })
    }
  }

  const shown = rows.slice(0, MAX_DIFF_LINES)
  const width = Math.max(1, ...shown.map(row => Math.max(row.old.length, row.new.length)))
  const state = { block: false }
  const note = output.type === 'create' ? 'new file' : undefined

  return (
    <Box flexDirection="column">
      {counts(kit, total.added, total.removed, note)}
      {shown.length > 0 && (
        <Box flexDirection="column" backgroundColor={c.background}>
          {shown.map(row => {
            const gutter = <Text color={c.comment}>{` ${row.old.padStart(width)} ${row.new.padStart(width)} `}</Text>
            if (row.mark === '⋮') {
              return (
                <Text mono={mono} color={c.comment}>
                  {' '.repeat(width * 2 + 3)}⋮
                </Text>
              )
            }
            if (row.mark === '+' || row.mark === '-') {
              const color = row.mark === '+' ? c.green : c.red
              return (
                <Box backgroundColor={row.mark === '+' ? c.added : c.removed}>
                  <Text mono={mono}>
                    {gutter}
                    <Text color={color} bold>
                      {row.mark}
                    </Text>
                    <Text color={color}> {row.text || ' '}</Text>
                  </Text>
                </Box>
              )
            }
            const runs = highlight(row.text, lang, state, c)
            return (
              <Text mono={mono} color={c.foreground}>
                {gutter}{'  '}
                {runs.map(run => (
                  <Text color={run.color} italic={run.italic}>
                    {run.text}
                  </Text>
                ))}
              </Text>
            )
          })}
        </Box>
      )}
      {rows.length > shown.length && more(kit, rows.length - shown.length, 'lines')}
    </Box>
  )
}

/** A Bash result as a small terminal card: stdout, stderr in red, the run's ending. */
function shell(output: Record<string, unknown>, kit: Kit, mono: boolean): JSX.Element | null {
  const { Box, Text, c } = kit
  if (typeof output.stdout !== 'string' || output.isImage === true) return null
  const stdout = untab(output.stdout.replace(/\s+$/, ''))
  const stderr = typeof output.stderr === 'string' ? untab(output.stderr.replace(/\s+$/, '')) : ''
  const lines = [
    ...(stdout ? stdout.split('\n').map(text => ({ text, color: c.foreground })) : []),
    ...(stderr ? stderr.split('\n').map(text => ({ text, color: c.red })) : []),
  ]
  const shown = lines.slice(0, MAX_OUTPUT_LINES)
  const background = typeof output.backgroundTaskId === 'string'

  return (
    <Box flexDirection="column">
      {shown.length > 0 ? (
        <Box flexDirection="column" backgroundColor={c.background} paddingX={1}>
          {shown.map(line => (
            <Text mono={mono} color={line.color}>
              {line.text || ' '}
            </Text>
          ))}
        </Box>
      ) : (
        !background && (
          <Text color={c.comment} italic>
            (no output)
          </Text>
        )
      )}
      {lines.length > shown.length && more(kit, lines.length - shown.length, 'lines')}
      {background && <Text color={c.purple}>☾ running in the background</Text>}
      {output.interrupted === true && <Text color={c.orange}>interrupted</Text>}
      {typeof output.timedOutAfterMs === 'number' && (
        <Text color={c.orange}>timed out after {Math.round(output.timedOutAfterMs / 1000)}s</Text>
      )}
    </Box>
  )
}

/** A Read result as one line: how much of the file was read. */
function readLine(output: Record<string, unknown>, kit: Kit): JSX.Element | null {
  const { Text, c } = kit
  const file = record(output.file)
  if (!file) return null
  if (output.type === 'text' && typeof file.numLines === 'number') {
    const total = typeof file.totalLines === 'number' ? file.totalLines : file.numLines
    const start = typeof file.startLine === 'number' ? file.startLine : 1
    const partial = file.numLines < total
    return (
      <Text color={c.comment}>
        read <Text color={c.purple}>{file.numLines}</Text> {file.numLines === 1 ? 'line' : 'lines'}
        {partial && (
          <Text>
            {' '}
            ({start}–{start + file.numLines - 1} of <Text color={c.purple}>{total}</Text>)
          </Text>
        )}
      </Text>
    )
  }
  if (output.type === 'image') {
    const size = record(file.dimensions)
    const w = size?.originalWidth ?? size?.width
    const h = size?.originalHeight ?? size?.height
    return (
      <Text color={c.comment}>
        read an image
        {typeof w === 'number' && typeof h === 'number' && (
          <Text>
            {' '}
            <Text color={c.purple}>
              {w}×{h}
            </Text>
          </Text>
        )}
      </Text>
    )
  }
  if (output.type === 'file_unchanged') return <Text color={c.comment}>unchanged since the last read</Text>
  return null
}

/** A search result (Grep, Glob): the files it found, in cyan, and how many. */
function search(output: Record<string, unknown>, kit: Kit, mono: boolean): JSX.Element | null {
  const { Box, Text, c } = kit
  const files = Array.isArray(output.filenames)
    ? output.filenames.filter((name): name is string => typeof name === 'string')
    : null
  const content = typeof output.content === 'string' ? output.content.replace(/\s+$/, '') : null
  if (!files && content === null) return null
  const lines = content ? content.split('\n') : (files ?? [])
  const found = typeof output.numFiles === 'number' ? output.numFiles : (files?.length ?? lines.length)
  const shown = lines.slice(0, MAX_OUTPUT_LINES)

  return (
    <Box flexDirection="column">
      <Text color={c.comment}>
        found <Text color={c.purple}>{found}</Text> {found === 1 ? 'file' : 'files'}
        {typeof output.numMatches === 'number' && (
          <Text>
            , <Text color={c.purple}>{output.numMatches}</Text> matches
          </Text>
        )}
      </Text>
      {shown.map(line => {
        const hit = /^([^:\s][^:]*):(\d+):(.*)$/.exec(line)
        if (!hit) {
          return (
            <Text mono={mono} color={c.cyan}>
              {line}
            </Text>
          )
        }
        return (
          <Text mono={mono}>
            <Text color={c.cyan}>{hit[1]}</Text>
            <Text color={c.comment}>:</Text>
            <Text color={c.purple}>{hit[2]}</Text>
            <Text color={c.comment}>:</Text>
            <Text color={c.foreground}>{hit[3]}</Text>
          </Text>
        )
      })}
      {lines.length > shown.length && more(kit, lines.length - shown.length, 'lines')}
    </Box>
  )
}

/** The mod's own drawing of a tool's result, or null to keep the engine's. */
export function drawResult(tool: string, output: unknown, kit: Kit, mono: boolean): JSX.Element | null {
  const out = record(output)
  if (!out) return null
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') return diff(out, kit, mono)
  if (tool === 'Bash') return shell(out, kit, mono)
  if (tool === 'Read') return readLine(out, kit)
  if (tool === 'Grep' || tool === 'Glob') return search(out, kit, mono)
  return null
}

type GroupCall = { tool: string; isRunning: boolean; isErrored: boolean }

/** A folded run of calls as one row: a status dot, then a chip per tool with its count. */
export function drawGroup(calls: readonly GroupCall[], isActive: boolean, kit: Kit): JSX.Element {
  const { Box, Text, c } = kit
  const tally = new Map<string, number>()
  for (const call of calls) tally.set(call.tool, (tally.get(call.tool) ?? 0) + 1)
  const errors = calls.filter(call => call.isErrored).length
  const running = isActive && calls.some(call => call.isRunning)

  return (
    // Chips keep to one line each; a row with more than fits wraps between them.
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={1}>
      <Text color={running ? c.orange : errors > 0 ? c.red : c.green}>●</Text>
      {[...tally].map(([tool, count]) => (
        <Box flexShrink={0}>
          <Text backgroundColor={c.currentLine} color={toolColor(tool, c)} wrap="truncate-end">
            {` ${toolName(tool)}`}
            <Text color={c.foreground}>{count > 1 ? ` ×${count} ` : ' '}</Text>
          </Text>
        </Box>
      ))}
      {errors > 0 && <Text color={c.red}>{errors === 1 ? '1 error' : `${errors} errors`}</Text>}
    </Box>
  )
}
