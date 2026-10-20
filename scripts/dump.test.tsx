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
        "Here's a compact version. It doubles the delay each attempt, caps it, and adds **full jitter** so retries from many clients don't line up.\n\n" +
        '```go\nfunc Retry(ctx context.Context, n int, fn func() error) error {\n\td := 100 * time.Millisecond\n\tfor i := 0; i < n; i++ {\n\t\tif err := fn(); err == nil {\n\t\t\treturn nil\n\t\t}\n\t\tsleep := time.Duration(rand.Int63n(int64(d)))\n\t\tselect {\n\t\tcase <-ctx.Done():\n\t\t\treturn ctx.Err()\n\t\tcase <-time.After(sleep):\n\t\t}\n\t\td = min(d*2, 10*time.Second)\n\t}\n\treturn errors.New("retries exhausted")\n}\n```',
    },
  },
  {
    id: 'result',
    component: 'ToolResult',
    props: { tool_use_id: 't2', tool: 'Bash', output: { stdout: 'ok' }, isErrored: false },
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

for (const accent of ['purple', 'pink', 'cyan', 'green']) {
  test(`dump (${accent})`, async ($, on) => {
    mock.store(on, {})
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
      args: `accent ${accent}`,
      origin,
      presentation: { isFullscreen: false, columns: 80 },
    })

    for (const surface of ['desktop', 'terminal'] as const) {
      for (const site of SITES) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ui = await $.ui.mount({ plugin: 'dracula', surface, component: site.component, props: site.props } as any)
        const tree = await ui.drawn()
        console.log('DRACULA_DUMP ' + JSON.stringify({ accent, surface, id: site.id, tree }))
        await ui.unmount()
      }
    }
  })
}
