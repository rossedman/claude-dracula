import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const run = (args: string) => ({
  command: 'dracula',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

/** The engine beneath the plugin: registers commands, toasts, stores, and draws "engine" where asked. */
function engine(on: On, stored: Record<string, unknown> = {}) {
  mock.store(on, stored)
  on('command.register', () => ({ value: { command: 'dracula' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const reply = (surface: (typeof SURFACES)[number]) =>
  ({
    plugin: 'dracula',
    component: 'AssistantMessage',
    surface,
    props: { text: 'Hello from **Claude**', isFirstOfReply: true },
  }) as const

test('the reply is drawn in its card, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(reply(surface))
    expect(await ui.find({ type: 'Text', text: 'Claude' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('the prompt becomes a bubble, other user rows stay the engine’s', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const prompt = await $.ui.mount({
    plugin: 'dracula',
    component: 'UserMessage',
    surface: 'desktop',
    props: { text: 'build me a mod', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect((await prompt.find({ type: 'Text', text: /build me a mod/ }))?.text).toBe('build me a mod')
  await prompt.unmount()

  const expanded = await $.ui.mount({
    plugin: 'dracula',
    component: 'UserMessage',
    surface: 'desktop',
    props: { text: 'build me a mod', origin: { kind: 'composer' }, isExpanded: true },
  })
  expect(await expanded.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await expanded.unmount()
})

test('the spinner fills its blocks by mode', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'dracula',
    component: 'Spinner',
    surface: 'terminal',
    props: { word: 'Working', message: null, suffix: '…', mode: 'tool-use' },
  })
  const lines = await ui.findAll({ type: 'Text', text: /^━+$/ })
  expect(lines.map(line => line.text).slice(-2)).toEqual(['━━━━━━━━', '━━━'])
  expect(await ui.find({ type: 'Text', text: '🦇' })).toBeTruthy()
  const label = await ui.find({ type: 'Text', text: /…$/ })
  expect(label?.text).not.toContain('Working')
  await ui.unmount()
})

test('/dracula off hands every site back to the engine', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const off = await $.command.run(run('off'))
  expect(off.text).toContain('off')

  const ui = await $.ui.mount(reply('desktop'))
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await ui.unmount()
})

test('an accent is taken by name or hex, and a bad one is refused', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run(run('accent pink'))).text).toContain('#FF79C6')
  expect((await $.command.run(run('accent #12ab34'))).text).toContain('#12AB34')
  expect((await $.command.run(run('accent plaid'))).text).toContain('Unknown accent')
})

test('saved settings come back at the next session', async ($, on) => {
  engine(on, { settings: { enabled: false, accent: '#8BE9FD' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const status = await $.command.run(run('status'))
  expect(status.text).toBe(
    'Dracula is off, theme dracula, accent #8BE9FD, spooky on, sound off, persona off.',
  )
})

test('an accent saved by the old palette moves to Dracula purple', async ($, on) => {
  engine(on, { settings: { enabled: true, accent: '#79B33D' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const status = await $.command.run(run('status'))
  expect(status.text).toBe(
    'Dracula is on, theme dracula, accent #BD93F9, spooky on, sound off, persona off.',
  )
})

test('spooky mode swaps the avatar and words, and turns off', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const replyUi = await $.ui.mount(reply('desktop'))
  expect((await replyUi.find({ type: 'Svg' }))?.props.source).toContain('circle')
  await replyUi.unmount()

  const turn = {
    plugin: 'dracula',
    component: 'TurnDuration',
    surface: 'terminal',
    props: { word: 'Baked', durationMs: 14000 },
  } as const
  const spookyTurn = await $.ui.mount(turn)
  expect((await spookyTurn.find({ type: 'Text', text: / for 14s$/ }))?.text).toMatch(/^◆ \w+ for 14s$/)
  await spookyTurn.unmount()

  await $.command.run(run('spooky off'))

  const plainReply = await $.ui.mount(reply('desktop'))
  expect((await plainReply.find({ type: 'Svg' }))?.props.source).not.toContain('circle')
  await plainReply.unmount()

  const plainTurn = await $.ui.mount(turn)
  expect((await plainTurn.find({ type: 'Text', text: /14s/ }))?.text).toBe('◆ 14s')
  await plainTurn.unmount()
})

test('a tool result hangs from its gutter mark, the engine drawing tools the mod does not', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const result = (tool: string, output: unknown) =>
    $.ui.mount({
      plugin: 'dracula',
      component: 'ToolResult',
      surface: 'terminal',
      props: { tool_use_id: 't1', tool, output, isErrored: false },
    })

  const shell = await result('Bash', { stdout: 'ok\n', stderr: '', interrupted: false })
  expect(await shell.find({ type: 'Text', text: /^╰$/ })).toBeTruthy()
  expect(await shell.find({ type: 'Text', text: /^ok$/ })).toBeTruthy()
  expect(await shell.find({ type: 'Text', text: /engine/ })).toBeFalsy()
  await shell.unmount()

  const other = await result('WebFetch', { result: 'page' })
  expect(await other.find({ type: 'Text', text: /^╰$/ })).toBeTruthy()
  expect(await other.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await other.unmount()
})

test('an edit is drawn as a Dracula diff', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'dracula',
    component: 'ToolResult',
    surface: 'terminal',
    props: {
      tool_use_id: 't1',
      tool: 'Edit',
      isErrored: false,
      output: {
        filePath: 'main.go',
        structuredPatch: [{ oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: [' func main() {', '-\told()', '+\tnew()'] }],
      },
    },
  })
  const color = async (text: RegExp) =>
    ((await ui.find({ type: 'Text', text })) as { props?: { color?: string } } | undefined)?.props?.color
  expect(await color(/^\+1$/)).toBe('#50FA7B')
  expect(await color(/^−1$/)).toBe('#FF5555')
  expect(await color(/^ {5}new\(\)$/)).toBe('#50FA7B')
  expect(await color(/^ {5}old\(\)$/)).toBe('#FF5555')
  expect(await color(/^func$/)).toBe('#FF79C6')
  await ui.unmount()
})

test('a folded run of calls is one row of tool chips', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const call = (tool: string) => ({ tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false })
  const ui = await $.ui.mount({
    plugin: 'dracula',
    component: 'ToolGroup',
    surface: 'terminal',
    props: { calls: [call('Read'), call('Read'), call('Grep')], isActive: false, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: /^ Read ×2 $/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^ Grep $/ })).toBeTruthy()
  await ui.unmount()
})

test('MCP tool chips read server · tool, stay on one line and wrap between chips', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const call = (tool: string) => ({ tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false })
  const ui = await $.ui.mount({
    plugin: 'dracula',
    component: 'ToolGroup',
    surface: 'desktop',
    props: {
      calls: [
        call('mcp__plugin_buildkite-tools_buildkite__list_builds'),
        call('mcp__terminal__run_in_terminal'),
        call('mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch'),
      ],
      isActive: false,
      isExpanded: false,
    },
  })
  expect(await ui.find({ type: 'Text', text: /^ buildkite · list_builds $/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^ terminal · run_in_terminal $/ })).toBeTruthy()
  const chip = (await ui.find({ type: 'Text', text: /^ batch $/ })) as { props?: { wrap?: string } } | undefined
  expect(chip?.props?.wrap).toBe('truncate-end')
  expect(await ui.find({ type: 'Box', props: { flexWrap: 'wrap' } })).toBeTruthy()
  await ui.unmount()
})

test('/dracula light draws in Alucard, /dracula dark brings Dracula back', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const heading = async () => {
    const ui = await $.ui.mount({
      plugin: 'dracula',
      component: 'AssistantMessage',
      surface: 'desktop',
      props: { text: '# Title', isFirstOfReply: true },
    })
    const found = (await ui.find({ type: 'Text', text: /^Title$/ })) as { props?: { color?: string } } | undefined
    await ui.unmount()
    return found?.props?.color
  }
  expect((await $.command.run(run('light'))).text).toContain('theme alucard')
  expect(await heading()).toBe('#644AC9')
  await $.command.run(run('dark'))
  expect(await heading()).toBe('#BD93F9')
})

test('the persona adds one section to the system prompt, only when on', async ($, on) => {
  engine(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const compose = () =>
    $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  expect((await compose()).sections.map(section => section.id)).toEqual(['intro'])
  await $.command.run(run('persona on'))
  expect((await compose()).sections.map(section => section.id)).toEqual(['intro', 'dracula:persona'])
})

test('the crypt counts calls and the lines each edit changed, and an error tolls', async ($, on) => {
  engine(on)
  const played: string[] = []
  on('audio.play', (_, e) => {
    played.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('tool.call', (_, e) =>
    e.tool === 'Bash'
      ? { result: { stdout: '', stderr: 'boom', interrupted: false }, isError: true }
      : {
          result: {
            filePath: 'src/app.ts',
            structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
          },
        },
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('sound on'))
  const preview = played.length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await $.tool.call({ tool: 'Edit', file_path: 'src/app.ts', old_string: 'a', new_string: 'b\nc' } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await $.tool.call({ tool: 'Bash', command: 'false' } as any)
  const pane = await $.ui.mount({
    plugin: 'dracula',
    component: 'Pane',
    surface: 'terminal',
    requestId: 'dracula-crypt',
    props: { title: 'Crypt', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  expect(await pane.find({ type: 'Text', text: /^src\/app\.ts$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^\+2$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /1 call failed/ })).toBeTruthy()
  await pane.unmount()
  expect(played.slice(preview).join()).toContain('sounds/toll.wav')
})

test('the organ plays at the end of an answered turn only when sound is on', async ($, on) => {
  engine(on)
  const played: string[] = []
  on('audio.play', (_, e) => {
    played.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const turn = { reason: 'answer', answer: 'hi', durationMs: 10, isAborted: false, turnId: 't' } as const
  await $.turn.complete(turn)
  expect(played.length).toBe(0)

  await $.command.run(run('sound on'))
  const preview = played.length
  await $.turn.complete(turn)
  await $.turn.complete({ ...turn, agentId: 'sub' })
  expect(played.length - preview).toBe(1)
  expect(played.at(-1)).toContain('sounds/organ.wav')
})

test('the reply’s markdown is drawn in Dracula colors', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const text = [
    '## Heading',
    '',
    'Plain, **bold**, *italic*, `code` and [a link](https://draculatheme.com).',
    '',
    '- one',
    '',
    '```go',
    'func main() { fmt.Println("hi", 42, true) } // note',
    '```',
    '',
    '| Column | Value |',
    '| --- | --- |',
    '| alpha | 1 |',
  ].join('\n')
  const ui = await $.ui.mount({
    plugin: 'dracula',
    component: 'AssistantMessage',
    surface: 'desktop',
    props: { text, isFirstOfReply: true },
  })
  const color = async (match: string | RegExp) => {
    const text = typeof match === 'string' ? new RegExp(`^${match.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) : match
    const found = (await ui.find({ type: 'Text', text })) as { props?: { color?: string } } | undefined
    return found?.props?.color
  }
  expect(await color('Heading')).toBe('#BD93F9')
  expect(await color('bold')).toBe('#FFB86C')
  expect(await color('italic')).toBe('#F1FA8C')
  expect(await color('code')).toBe('#50FA7B')
  expect(await color('a link')).toBe('#8BE9FD')
  expect(await color('func')).toBe('#FF79C6')
  expect(await color('Println')).toBe('#50FA7B')
  expect(await color('"hi"')).toBe('#F1FA8C')
  expect(await color('// note')).toBe('#6272A4')
  expect(await color(/^┌─+┬─+┐$/)).toBe('#6272A4')
  expect(await ui.find({ type: 'Markdown' })).toBeFalsy()
  await ui.unmount()
})
