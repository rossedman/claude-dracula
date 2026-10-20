// Dumps the trees claude-dracula draws for a sample conversation, as JSON lines
// prefixed "DRACULA_DUMP ", so scripts/screenshots.py can render README images.
// Runs with the rest of the suite: claude plugin test . > test-output.txt
import { mock, test } from 'claude-code/testing'

const origin = { kind: 'composer' as const }

const SITES = [
  {
    id: 'user',
    component: 'UserMessage',
    props: { text: 'Write me a Go helper that retries with backoff and jitter.', origin, isExpanded: false },
  },
  {
    id: 'tool1',
    component: 'ToolUse',
    props: {
      tool_use_id: 't1',
      tool: 'Read',
      input: { file_path: 'internal/retry/retry.go' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  },
  {
    id: 'tool2',
    component: 'ToolUse',
    props: {
      tool_use_id: 't2',
      tool: 'Bash',
      input: { command: 'go test ./internal/retry/...' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  },
  {
    id: 'reply',
    component: 'AssistantMessage',
    props: {
      isFirstOfReply: true,
      text:
        "## Retry with backoff\n\nHere's a compact version. It doubles the delay each attempt, caps it at `10s`, and adds **full jitter** so retries from *many* clients don't line up.\n\n" +
        '```go\nfunc Retry(ctx context.Context, n int, fn func() error) error {\n\td := 100 * time.Millisecond\n\tfor i := 0; i < n; i++ {\n\t\tif err := fn(); err == nil {\n\t\t\treturn nil\n\t\t}\n\t\tsleep := time.Duration(rand.Int63n(int64(d)))\n\t\tselect {\n\t\tcase <-ctx.Done():\n\t\t\treturn ctx.Err()\n\t\tcase <-time.After(sleep):\n\t\t}\n\t\td = min(d*2, 10*time.Second)\n\t}\n\treturn errors.New("retries exhausted")\n}\n```',
    },
  },
  {
    id: 'result',
    component: 'ToolResult',
    props: {
      tool_use_id: 't2',
      tool: 'Bash',
      output: {
        stdout: '=== RUN   TestRetry\n--- PASS: TestRetry (0.21s)\nPASS\nok  \texample.com/retry/internal/retry\t0.412s\n',
        stderr: '',
        interrupted: false,
      },
      isErrored: false,
    },
  },
  {
    id: 'group',
    component: 'ToolGroup',
    props: {
      isActive: false,
      isExpanded: false,
      calls: [
        'Read',
        'Read',
        'Read',
        'Grep',
        'Glob',
        'mcp__plugin_buildkite-tools_buildkite__list_builds',
        'mcp__terminal__run_in_terminal',
      ].map(tool => ({
        tool,
        input: {},
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      })),
    },
  },
  {
    id: 'edit',
    component: 'ToolUse',
    props: {
      tool_use_id: 't3',
      tool: 'Edit',
      input: { file_path: 'internal/retry/retry.go' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  },
  {
    id: 'diff',
    component: 'ToolResult',
    props: {
      tool_use_id: 't3',
      tool: 'Edit',
      isErrored: false,
      output: {
        filePath: 'internal/retry/retry.go',
        structuredPatch: [
          {
            oldStart: 14,
            oldLines: 4,
            newStart: 14,
            newLines: 5,
            lines: [
              '\t\tsleep := time.Duration(rand.Int63n(int64(d)))',
              '-\t\tselect {',
              '+\t\t// Full jitter: anywhere from zero to the current cap.',
              '+\t\tselect {',
              '\t\tcase <-ctx.Done():',
              '\t\t\treturn ctx.Err()',
            ].map(line => (line.startsWith('-') || line.startsWith('+') ? line : ` ${line}`)),
          },
        ],
      },
    },
  },
  {
    id: 'mode',
    component: 'SessionMode',
    props: { modes: ['auto-accept edits'] },
  },
  {
    id: 'spinner',
    component: 'Spinner',
    props: { word: 'Running tests', message: null, suffix: '…', mode: 'tool-use' },
  },
  {
    id: 'turn',
    component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 14000 },
  },
  {
    id: 'band',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 } },
  },
] as const

// The crypt pane, drawn after the sample calls below have run.
const PANE = {
  id: 'pane',
  component: 'Pane',
  requestId: 'dracula-crypt',
  props: { title: 'Crypt', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 30 } },
}

// What the sample session ran, so the band and the crypt have something to count.
const CALLS = [
  { tool: 'Read', file_path: 'internal/retry/retry.go' },
  { tool: 'Read', file_path: 'internal/retry/retry_test.go' },
  { tool: 'Read', file_path: 'go.mod' },
  { tool: 'Grep', pattern: 'Retry(' },
  { tool: 'Glob', pattern: '**/*.go' },
  { tool: 'Edit', file_path: 'internal/retry/retry.go' },
  { tool: 'Edit', file_path: 'internal/retry/retry.go' },
  { tool: 'Write', file_path: 'internal/retry/retry_test.go' },
  { tool: 'Edit', file_path: 'README.md' },
  { tool: 'Bash', command: 'go vet ./...' },
  { tool: 'Bash', command: 'go test ./internal/retry/...' },
  { tool: 'Bash', command: 'go test -race ./...' },
]

const PATCHES: Record<string, string[]> = {
  'internal/retry/retry.go': ['-a', '+b', '+c', '+d', '+e', '+f', '+g'],
  'internal/retry/retry_test.go': ['+a', '+b', '+c', '+d', '+e', '+f', '+g', '+h', '+i', '+j', '+k', '+l', '+m', '+n'],
  'README.md': ['-a', '-b', '+c', '+d', '+e'],
}

// 2:13am at -0500 on 20 October 2026: the witching hour.
const NOW = Date.UTC(2026, 9, 20, 7, 13)

for (const accent of ['purple', 'pink', 'cyan', 'green', 'alucard']) {
  test(`dump (${accent})`, async ($, on) => {
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    on('process.run', (_, e) => ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'git' ? 'feat/retry-jitter\n' : '-0500\n',
        stderr: '',
      },
    }))
    on('tool.call', (_, e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = e as any
      if (call.tool === 'Bash') {
        return call.command === 'go test -race ./...'
          ? { result: { stdout: '', stderr: 'race detected', interrupted: false }, isError: true }
          : { result: { stdout: 'ok', stderr: '', interrupted: false } }
      }
      const lines = PATCHES[call.file_path]
      return lines
        ? { result: { filePath: call.file_path, structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }] } }
        : { result: { file: { filePath: call.file_path, numLines: 40, startLine: 1, totalLines: 40 } } }
    })
    on('command.register', () => ({ value: { command: 'dracula' } }))
    on('ui.toast', () => ({ value: undefined }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    // Stands in for the engine's own result drawing, which the mod wraps.
    on('ui.render', { component: 'ToolResult' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text color="#F8F8F2">ok    example.com/retry/internal/retry    0.412s</Text>
    })
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await $.command.run({
      command: 'dracula',
      args: accent === 'alucard' ? 'light' : `accent ${accent}`,
      origin,
      presentation: { isFullscreen: false, columns: 80 },
    })
    for (const call of CALLS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await $.tool.call(call as any).catch(() => undefined)
    }

    for (const surface of ['desktop', 'terminal'] as const) {
      for (const site of [...SITES, PANE]) {
        const requestId = 'requestId' in site ? site.requestId : undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ui = await $.ui.mount({ plugin: 'dracula', surface, component: site.component, requestId, props: site.props } as any)
        const tree = await ui.drawn()
        console.log('DRACULA_DUMP ' + JSON.stringify({ accent, surface, id: site.id, tree }))
        await ui.unmount()
      }
    }
  })
}
