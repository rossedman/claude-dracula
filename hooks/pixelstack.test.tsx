import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const run = (args: string) => ({
  command: 'pixelstack',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

/** The engine beneath the plugin: registers commands, toasts, stores, and draws "engine" where asked. */
function engine(on: On, stored: Record<string, unknown> = {}) {
  mock.store(on, stored)
  on('command.register', () => ({ value: { command: 'pixelstack' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const reply = (surface: (typeof SURFACES)[number]) =>
  ({
    plugin: 'pixelstack',
    component: 'AssistantMessage',
    surface,
    props: { text: 'Hello from **Claude**', isFirstOfReply: true },
  }) as const

test('the reply is drawn in its card, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(reply(surface))
    expect(await ui.find({ type: 'Markdown' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('the prompt becomes a bubble, other user rows stay the engine’s', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const prompt = await $.ui.mount({
    plugin: 'pixelstack',
    component: 'UserMessage',
    surface: 'desktop',
    props: { text: 'build me a mod', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect((await prompt.find({ type: 'Text', text: /build me a mod/ }))?.text).toBe('build me a mod')
  await prompt.unmount()

  const expanded = await $.ui.mount({
    plugin: 'pixelstack',
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
    plugin: 'pixelstack',
    component: 'Spinner',
    surface: 'terminal',
    props: { word: 'Working', message: null, suffix: '…', mode: 'tool-use' },
  })
  const lines = await ui.findAll({ type: 'Text', text: /^━+$/ })
  expect(lines.map(line => line.text).slice(-2)).toEqual(['━━━━━━', '━━'])
  const label = await ui.find({ type: 'Text', text: /…$/ })
  expect(label?.text).not.toContain('Working')
  await ui.unmount()
})

test('/pixelstack off hands every site back to the engine', async ($, on) => {
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
  expect(status.text).toBe('Pixelstack is off, accent #8BE9FD, spooky on, sound off.')
})

test('an accent saved by the old palette moves to Dracula purple', async ($, on) => {
  engine(on, { settings: { enabled: true, accent: '#79B33D' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const status = await $.command.run(run('status'))
  expect(status.text).toBe('Pixelstack is on, accent #BD93F9, spooky on, sound off.')
})

test('spooky mode swaps the avatar and words, and turns off', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const replyUi = await $.ui.mount(reply('desktop'))
  expect((await replyUi.find({ type: 'Svg' }))?.props.source).toContain('circle')
  await replyUi.unmount()

  const turn = {
    plugin: 'pixelstack',
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

test('a tool result keeps the engine drawing beside its gutter mark', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'pixelstack',
    component: 'ToolResult',
    surface: 'terminal',
    props: { tool_use_id: 't1', tool: 'Bash', output: { stdout: 'ok' }, isErrored: false },
  })
  expect(await ui.find({ type: 'Text', text: /^╰$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await ui.unmount()
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
