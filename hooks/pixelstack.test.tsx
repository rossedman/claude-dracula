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
  expect((await ui.find({ type: 'Text', text: /Working/ }))?.text).toBe('Working')
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
  expect(status.text).toBe('Pixelstack is off, accent #8BE9FD.')
})

test('an accent saved by the old palette moves to Dracula purple', async ($, on) => {
  engine(on, { settings: { enabled: true, accent: '#79B33D' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const status = await $.command.run(run('status'))
  expect(status.text).toBe('Pixelstack is on, accent #BD93F9.')
})
