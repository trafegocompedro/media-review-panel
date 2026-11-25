import { expect, mock, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'
import { C, lineChart, setThemeMode } from '../hooks/charts'

const series = { labels: ['2026-11-01', '2026-11-02', '2026-11-03'], values: [1, 3, 2], name: 'Clicks', tip: (i: number) => String(i), width: 400 }

test('auto: the panel follows the app theme and the chart carries both looks', () => {
  setThemeMode('auto')
  expect(C.text).toBe('text')
  expect(C.bg).toBeUndefined()

  const svg = lineChart(series)

  expect(svg).toContain('prefers-color-scheme:dark')
  expect(svg).toContain('#f6f8fa')
  expect(svg).toContain('#1f1f1f')
  expect(C.card).toBeUndefined()
})

test('light and dark force one palette', () => {
  setThemeMode('light')
  expect(C.bg).toBe('#ffffff')
  expect(lineChart(series)).not.toContain('#1f1f1f')

  setThemeMode('dark')
  expect(C.bg).toBe('#181818')
  expect(lineChart(series)).not.toContain('#f6f8fa')

  setThemeMode('auto')
})

// WCAG contrast of two #rrggbb colors.
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))

  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)

  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05)
}

test('chips: their own background and text, readable in light and dark', () => {
  for (const m of ['light', 'dark', 'auto'] as const) {
    setThemeMode(m)
    for (const text of [C.chipText, C.chipInfo]) {
      expect(text).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrast(text, C.chip)).toBeGreaterThanOrEqual(4.5)
    }
  }
  setThemeMode('auto')
})

const PANE = {
  plugin: 'media-review-panel',
  component: 'Pane',
  requestId: 'media-review',
  props: { title: 'Media Review', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 400 }, view: {} },
} as const
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
const isHex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)

for (const args of ['demo', 'demo subida'] as const) {
  for (const view of ['simples', 'completo'] as const) {
    test(`auto theme, ${args}, ${view}: no theme-colored text on a fixed background`, async ($, on) => {
      mock.clock(on, { now: Date.parse('2026-11-25T12:00:00Z') })
      mock.store(on)
      on('command.register', () => ({ value: { command: 'media-review' } }))
      on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
      on('ui.open', () => ({ value: { isPlaced: true } }))
      on('session.start', (_, e) => ({ cwd: e.cwd }))
      await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
      await $.command.run({ command: 'media-review', args: 'pt', ...RUN })
      await $.command.run({ command: 'media-review', args, ...RUN })
      await $.command.run({ command: 'media-review', args: view, ...RUN })

      const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
      const texts: FoundElement[] = await ui.findAll({ type: 'Text' })
      const boxes: FoundElement[] = await ui.findAll({ type: 'Box' })

      // In a dark app a theme key turns light: on a fixed light fill it can't be read.
      const bad = texts
        .filter(x => x.text.trim() !== '' && isHex(x.props.backgroundColor) && !isHex(x.props.color))
        .map(x => `${x.text} (${String(x.props.color)} on ${String(x.props.backgroundColor)})`)
      // A box with a fixed fill would hold theme-colored text too.
      // (An empty one, like a progress bar, holds no text to read.)
      const filled = boxes.filter(x => x.text.trim() !== '' && isHex(x.props.backgroundColor)).map(x => x.text.slice(0, 40))

      expect(bad).toEqual([])
      expect(filled).toEqual([])
      // The accounts name their platform in an outline, in the theme's own color.
      if (view === 'simples') expect(texts.some(x => x.text.trim() === 'Meta' && x.props.color === C.infoText && x.props.backgroundColor === undefined)).toBe(true)
      await ui.unmount()
    })
  }
}
