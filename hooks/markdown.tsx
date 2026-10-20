// Draws Claude's markdown in Dracula colors. The engine's own `Markdown` element takes
// no colors, so the reply card parses the common markdown itself and draws it in Text
// runs: headings purple, bold orange, italic yellow, code green, links cyan, list
// markers cyan, quotes yellow, and fenced code through a small Dracula highlighter.
import type { BoxProps, ElementConstructor, LinkProps, TextProps } from 'claude-code'

import { colors } from './tokens'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Link: ElementConstructor<LinkProps>
}

type Node = JSX.Element | string

const INLINE =
  /`([^`\n]+)`|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<![\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_`])/g

/** Inline markdown as Text runs: code, bold, italic, strikethrough, links. */
function inline(src: string, kit: Kit): Node[] {
  const { Text, Link } = kit
  const out: Node[] = []
  let last = 0
  for (const m of src.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(src.slice(last, at))
    last = at + m[0].length
    const [, code, bold1, bold2, strike, italic1, italic2, label, href, bare] = m
    if (code !== undefined) {
      out.push(<Text color={colors.green}>{code}</Text>)
    } else if (bold1 !== undefined || bold2 !== undefined) {
      out.push(
        <Text color={colors.orange} bold>
          {inline(bold1 ?? bold2 ?? '', kit)}
        </Text>,
      )
    } else if (strike !== undefined) {
      out.push(
        <Text color={colors.comment} strikethrough>
          {inline(strike, kit)}
        </Text>,
      )
    } else if (italic1 !== undefined || italic2 !== undefined) {
      out.push(
        <Text color={colors.yellow} italic>
          {inline(italic1 ?? italic2 ?? '', kit)}
        </Text>,
      )
    } else if (label !== undefined && href !== undefined) {
      out.push(
        <Link href={href}>
          <Text color={colors.cyan} underline>
            {inline(label, kit)}
          </Text>
        </Link>,
      )
    } else if (bare !== undefined) {
      out.push(
        <Link href={bare}>
          <Text color={colors.cyan} underline>
            {bare}
          </Text>
        </Link>,
      )
    }
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}

/** What a run of inline markdown takes on screen, for laying out table columns. */
function visible(src: string): string {
  return src
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1')
    .replace(/(?<![\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])/g, '$1')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1')
}

const KEYWORDS = new Set(
  (
    'abstract and as async await break case catch chan class const continue crate def default defer del ' +
    'delete do done dyn elif else enum esac except export extends extern fallthrough fi final finally fn for ' +
    'from func function go goto if impl implements import in instanceof interface is lambda let local loop ' +
    'map match mod module mut namespace new not or override package pass private protected pub public raise ' +
    'range readonly ref return select self sealed static struct super switch template then this throw throws ' +
    'trait try type typeof unsafe use using val var virtual void when where while with yield'
  ).split(' '),
)
const CONSTANTS = new Set('true false null nil None True False undefined NaN Infinity iota'.split(' '))
const HASH_COMMENTS = new Set(
  'py python sh bash zsh shell fish rb ruby yaml yml toml r perl pl make makefile dockerfile ini conf elixir ex nim'.split(' '),
)
const DASH_COMMENTS = new Set('sql lua haskell hs elm'.split(' '))

type Run = { text: string; color?: string; italic?: boolean }

/** One line of code as Dracula-colored runs; `state.block` carries an open block comment. */
function highlight(line: string, lang: string, state: { block: boolean }): Run[] {
  const runs: Run[] = []
  const push = (text: string, color?: string, italic?: boolean) => {
    const prev = runs[runs.length - 1]
    if (prev && prev.color === color && prev.italic === italic) prev.text += text
    else runs.push({ text, color, italic })
  }
  let rest = line
  if (state.block) {
    const end = rest.indexOf('*/')
    if (end < 0) return [{ text: rest, color: colors.comment, italic: true }]
    push(rest.slice(0, end + 2), colors.comment, true)
    rest = rest.slice(end + 2)
    state.block = false
  }
  const lineComment = HASH_COMMENTS.has(lang) ? '#' : DASH_COMMENTS.has(lang) ? '--' : '//'
  while (rest.length > 0) {
    if (rest.startsWith(lineComment) || (lang === '' && rest.startsWith('#') && runs.every(r => !r.text.trim()))) {
      push(rest, colors.comment, true)
      break
    }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2)
      if (end < 0) {
        push(rest, colors.comment, true)
        state.block = true
        break
      }
      push(rest.slice(0, end + 2), colors.comment, true)
      rest = rest.slice(end + 2)
      continue
    }
    const m =
      /^("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/.exec(rest) ??
      /^(0x[\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/.exec(rest) ??
      /^([A-Za-z_$@][\w$]*)/.exec(rest) ??
      /^(\s+|[=+\-*/%<>!&|^~?:]+|.)/.exec(rest)
    const token = m?.[1] ?? rest[0] ?? ''
    rest = rest.slice(token.length)
    const first = token[0] ?? ''
    if (first === '"' || first === "'" || first === '`') push(token, colors.yellow)
    else if (/^\d/.test(token)) push(token, colors.purple)
    else if (/^[A-Za-z_$@]/.test(token)) {
      if (CONSTANTS.has(token)) push(token, colors.purple)
      else if (KEYWORDS.has(token)) push(token, colors.pink)
      else if (/^\s*\(/.test(rest)) push(token, colors.green)
      else if (/^[A-Z]/.test(token) && /[a-z]/.test(token)) push(token, colors.cyan, true)
      else push(token)
    } else if (/^[=+\-*/%<>!&|^~?:]+$/.test(token)) push(token, colors.pink)
    else push(token)
  }
  return runs
}

function codeBlock(source: string, lang: string, kit: Kit, mono: boolean): JSX.Element {
  const { Box, Text } = kit
  const lines = source.replace(/\n$/, '').split('\n')
  const diff = lang === 'diff' || lang === 'patch'
  const state = { block: false }
  const drawn = lines.map(line => {
    if (diff) {
      const color = line.startsWith('+')
        ? colors.green
        : line.startsWith('-')
          ? colors.red
          : line.startsWith('@@')
            ? colors.cyan
            : colors.foreground
      return (
        <Text mono={mono} color={color}>
          {line || ' '}
        </Text>
      )
    }
    const runs = highlight(line, lang, state)
    return (
      <Text mono={mono} color={colors.foreground}>
        {runs.length === 0
          ? ' '
          : runs.map(run => (
              <Text color={run.color} italic={run.italic}>
                {run.text}
              </Text>
            ))}
      </Text>
    )
  })
  return (
    <Box flexDirection="column" backgroundColor={colors.background} paddingX={1}>
      {drawn}
    </Box>
  )
}

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function cells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
}

function table(rows: string[][], kit: Kit, mono: boolean): JSX.Element {
  const { Box, Text } = kit
  const count = Math.max(...rows.map(row => row.length))
  const widths = Array.from({ length: count }, (_, i) =>
    Math.max(1, ...rows.map(row => visible(row[i] ?? '').length)),
  )
  const rule = (left: string, mid: string, right: string) => (
    <Text mono={mono} color={colors.comment}>
      {left + widths.map(width => '─'.repeat(width + 2)).join(mid) + right}
    </Text>
  )
  const line = (row: string[], header: boolean) => (
    <Text mono={mono}>
      {widths.flatMap((width, i) => {
        const cell = row[i] ?? ''
        const pad = ' '.repeat(width - visible(cell).length + 1)
        return [
          <Text color={colors.comment}>{i === 0 ? '│ ' : ' │ '}</Text>,
          header ? (
            <Text color={colors.purple} bold>
              {inline(cell, kit)}
            </Text>
          ) : (
            <Text>{inline(cell, kit)}</Text>
          ),
          pad.slice(1),
        ]
      })}
      <Text color={colors.comment}> │</Text>
    </Text>
  )
  const [head = [], ...body] = rows
  return (
    <Box flexDirection="column">
      {rule('┌', '┬', '┐')}
      {line(head, true)}
      {rule('├', '┼', '┤')}
      {body.map(row => line(row, false))}
      {rule('└', '┴', '┘')}
    </Box>
  )
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

/** Claude's markdown, drawn in Dracula colors. */
export function draculaMarkdown(text: string, kit: Kit, mono: boolean): JSX.Element {
  const { Box, Text } = kit
  const lines = text.split('\n')
  const blocks: JSX.Element[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1] ?? '```'
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(marker)) body.push(lines[i++] ?? '')
      i++
      blocks.push(codeBlock(body.join('\n'), (fence[2] ?? '').toLowerCase(), kit, mono))
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = heading[1]?.length ?? 1
      blocks.push(
        <Text color={colors.purple} bold size={level === 1 ? 'title' : level === 2 ? 'heading' : 'body'}>
          {inline(heading[2] ?? '', kit)}
        </Text>,
      )
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push(<Text color={colors.comment}>{'─'.repeat(40)}</Text>)
      i++
      continue
    }

    if (line.includes('|') && SEPARATOR.test(lines[i + 1] ?? '')) {
      const rows = [cells(line)]
      i += 2
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
        rows.push(cells(lines[i++] ?? ''))
      }
      blocks.push(table(rows, kit, mono))
      continue
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) quoted.push(QUOTE.exec(lines[i++] ?? '')?.[1] ?? '')
      blocks.push(
        <Box flexDirection="row">
          <Text color={colors.comment}>▌ </Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text color={colors.yellow} italic>
              {inline(quoted.join('\n'), kit)}
            </Text>
          </Box>
        </Box>,
      )
      continue
    }

    if (ITEM.test(line)) {
      const items: { depth: number; marker: string; text: string }[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const item = ITEM.exec(current)
        if (item) {
          const marker = item[2] ?? '-'
          items.push({
            depth: Math.floor((item[1] ?? '').replace(/\t/g, '  ').length / 2),
            marker: /\d/.test(marker) ? marker : '•',
            text: item[3] ?? '',
          })
          i++
        } else if (current.trim() !== '' && /^\s+/.test(current) && items.length > 0) {
          const prev = items[items.length - 1]
          if (prev) prev.text += `\n${current.trim()}`
          i++
        } else break
      }
      blocks.push(
        <Box flexDirection="column">
          {items.map(item => {
            const task = /^\[([ xX])\]\s+/.exec(item.text)
            return (
              <Box flexDirection="row" paddingLeft={item.depth * 2}>
                <Text color={colors.cyan}>{`${item.marker} `}</Text>
                <Box flexGrow={1} flexShrink={1}>
                  <Text>
                    {task && (
                      <Text color={task[1] === ' ' ? colors.comment : colors.green}>
                        {task[1] === ' ' ? '☐ ' : '☑ '}
                      </Text>
                    )}
                    {inline(task ? item.text.slice(task[0].length) : item.text, kit)}
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Box>,
      )
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length) {
      const current = lines[i] ?? ''
      if (
        current.trim() === '' ||
        FENCE.test(current) ||
        HEADING.test(current) ||
        QUOTE.test(current) ||
        ITEM.test(current) ||
        (current.includes('|') && SEPARATOR.test(lines[i + 1] ?? ''))
      ) {
        break
      }
      paragraph.push(current)
      i++
    }
    blocks.push(<Text>{inline(paragraph.join('\n'), kit)}</Text>)
  }

  return (
    <Box flexDirection="column" gap={1}>
      {blocks}
    </Box>
  )
}
