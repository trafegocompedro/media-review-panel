import { expect, test } from 'claude-code/testing'
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
