import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { guessLang } from '../hooks/i18n'
import { isInSource, numberIndex, readResult } from '../hooks/detect'
import { MOODS, robot, robotText } from '../hooks/mascot'
import type { Mood } from '../types'

const PANE = {
  plugin: 'media-review-panel',
  component: 'Pane',
  requestId: 'media-review',
  props: {
    title: 'Media Review',
    isFocused: false,
    bodyColumns: 64,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 200 },
    view: {},
  },
} as const

const SURFACES = ['desktop', 'terminal'] as const

// Hooks that stand for the engine beneath the mod.
const engine = (on: On, toolText: (tool: string) => string = () => '{"data":[]}') => {
  mock.clock(on, { now: Date.parse('2026-11-23T12:00:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'media-review' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => ({ result: toolText(String(e.tool)), text: toolText(String(e.tool)) }))
}

const META_ROWS = JSON.stringify({
  data: [
    { campaign_name: 'Brand', spend: '1234.56', conversions: '40' },
    { campaign_name: 'Prospecting', spend: '980.10', conversions: '22' },
  ],
})

test('the demo shows sample data, the credit and both links, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'media-review', args: 'demo', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: /SAMPLE DATA/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Made by Tráfego Com Pedro/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /LinkedIn/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /Instagram/ })).toBeDefined()
    // The demo's keyword table reports one value that is not in its source.
    expect(await ui.find({ type: 'Text', text: /1 not found/ })).toBeDefined()
    // The empty call and the extra pages are flagged.
    expect(await ui.find({ type: 'Text', text: /returned no rows/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /more pages/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a Meta read is logged with its account, level, dates and rows', async ($, on) => {
  engine(on, () => META_ROWS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await $.tool.call({
    tool: 'mcp__meta__ads_get_ad_entities',
    ad_account_id: 'act_123456789',
    level: 'campaign',
    time_range: { since: '2026-10-01', until: '2026-10-31' },
    fields: ['spend', 'conversions'],
  })

  expect(ran.context?.join(' ') ?? '').toMatch(/call #1/)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: /act_123456789/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Reading now: Campaign/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2026-10-01 → 2026-10-31/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /ads_get_ad_entities/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /2 rows/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a report fills the panel and checks numbers against the raw response', async ($, on) => {
  engine(on, () => META_ROWS)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__meta__ads_get_ad_entities', ad_account_id: 'act_123456789', level: 'campaign' })

  const report = await $.tool.call({
    tool: 'mcp__media-review-panel__report',
    action: 'start',
    language: 'pt-BR',
    title: 'Revisão de outubro',
    accounts: [{ platform: 'Meta Ads', id: 'act_123456789', name: 'Loja Teste' }],
    periods: [{ start: '2026-10-01', end: '2026-10-31' }],
    steps: [{ id: 'campaigns', label: 'Campanhas', status: 'analyzing' }],
    datasets: [
      {
        id: 'spend',
        title: 'Investimento por campanha',
        chart: 'bar',
        columns: ['campaign', 'spend', 'cpa'],
        x: 'campaign',
        rows: [
          ['Brand', 1234.56, 30.86],
          ['Prospecting', 999.99, 44.55],
        ],
        source_calls: [1],
        calculated_columns: ['cpa'],
      },
    ],
  })

  expect(String(report.result)).toMatch(/1 found, 1 not found, 2 calculated/)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    // The language follows the report, and the account keeps its name.
    expect(await ui.find({ type: 'Text', text: /REVISÃO DE MÍDIA/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Loja Teste/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 não encontrados/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a write call is flagged in red, and the mascot can be muted', async ($, on) => {
  engine(on, () => '{"success":true}')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__meta__ads_update_entity', entity_id: '1', status: 'PAUSED' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /WRITE CALL/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.press({ key: 'mute' })
  expect(await ui.find({ type: 'Button', key: 'unmute' })).toBeDefined()
  await ui.unmount()
})

test('other tools are left alone', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  expect(ran.context).toBeUndefined()
})

const GOOGLE_PRINT = JSON.stringify([
  { campaign: { resourceName: 'customers/1234567890/campaigns/1', name: 'Brand' }, metrics: { costMicros: '1230000', clicks: '45' } },
])

test('a script is recognized by what it printed, with its account', async ($, on) => {
  engine(on, () => GOOGLE_PRINT)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'python3 relatorio.py --mes 10' })

  expect(ran.context?.join(' ') ?? '').toMatch(/call #1/)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Button', text: /Bash: relatorio\.py/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1234567890/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Google Ads/ })).toBeDefined()
  await ui.unmount()
})

test('showing or editing a script is not a data read', async ($, on) => {
  engine(on, () => "SELECT campaign.name, metrics.cost_micros FROM campaign")
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const shown = await $.tool.call({ tool: 'Bash', command: 'cat relatorio.py' })
  const searched = await $.tool.call({ tool: 'Bash', command: 'cd pasta && grep -n "segments.date" gaql.py' })
  const edited = await $.tool.call({ tool: 'Bash', command: "sed -i '' 's/cost_micros/cost/' gaql.py" })

  expect(shown.context).toBeUndefined()
  expect(searched.context).toBeUndefined()
  expect(edited.context).toBeUndefined()
})

test('running a script named for a platform counts even with plain output', async ($, on) => {
  engine(on, () => 'saved 12 rows to data/campaigns.json')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'cd pasta && python3 scripts/gaql.py campaigns' })

  expect(ran.context?.join(' ') ?? '').toMatch(/call #1/)
})

test('scripts named in the local setting are recognized even with plain output', { options: { extraScripts: 'minha_coleta.py, outra.py' } }, async ($, on) => {
  engine(on, () => 'Investido ontem: 123,45')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'cd pasta && python3 scripts/minha_coleta.py' })
  const other = await $.tool.call({ tool: 'Bash', command: 'python3 nao_listado.py' })

  expect(ran.context?.join(' ') ?? '').toMatch(/call #1/)
  expect(other.context).toBeUndefined()
})

test('UX: alerts lead, status is never color alone, charts have a table, long logs fold', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'media-review', args: 'demo', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // The demo has an empty call, extra pages, a date outside the period and a value not found.
  expect(await ui.find({ type: 'Text', text: /⚠ \d+ ALERTS/ })).toBeDefined()
  // Levels carry a mark, not only a color.
  expect(await ui.find({ type: 'Text', text: /● Keyword/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓ Campaign/ })).toBeDefined()
  // The keyword table marks the value it could not find and the legend says why.
  expect(await ui.find({ type: 'Text', text: /421\.30!/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /! not found in the cited responses/ })).toBeDefined()
  // A chart opens as a table.
  await ui.press({ key: 'tbl-daily' })
  expect(await ui.find({ type: 'Button', key: 'tbl-daily', text: /Hide table/ })).toBeDefined()
  // A call row shows it can open.
  expect(await ui.find({ type: 'Button', text: /▸ ✓ #\d/ })).toBeDefined()
  await ui.unmount()
})

test('UX: an empty panel offers the next step', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /No review yet/ })).toBeDefined()
  await ui.press({ key: 'load-demo' })
  expect(await ui.find({ type: 'Text', text: /SAMPLE DATA/ })).toBeDefined()
  await ui.unmount()
})

test('UX: the mascot stops moving when the system asks for reduced motion', () => {
  expect(robot('look')).toMatch(/prefers-reduced-motion:reduce/)
  expect(robot('done')).not.toMatch(/<animate/)
})

test('Bip: each of the 14 moods is its own pixel-art pose', () => {
  expect(MOODS.length).toBe(14)
  const drawings = new Set<string>()
  for (const m of MOODS) {
    const svg = robot(m)
    expect(svg).toMatch(/shape-rendering="crispEdges"/)
    expect(svg).toMatch(new RegExp(`class="bip st-${m}"`))
    expect(robotText(m)).not.toBe('')
    drawings.add(svg)
  }
  expect(drawings.size).toBe(14)
})

test('Bip: a mood saved by an older version falls back to the wave', () => {
  expect(robot('work' as Mood)).toMatch(/st-hello/)
  expect(robotText('happy' as Mood)).toBe(robotText('hello'))
})

test('helpers: language, row counts and the number check', () => {
  expect(guessLang('Faz uma análise da conta da loja, por favor')).toBe('pt')
  expect(guessLang('Please review the campaigns in this account')).toBe('en')
  expect(readResult(META_ROWS).rows).toBe(2)
  expect(readResult('{"data":[],"paging":{"next":"https://x"}}').flags).toContain('paging')
  expect(readResult('{"results":[]}').rows).toBe(0)

  const index = numberIndex('{"cost_micros":"1234560000","ctr":0.0345,"spend":"98.7"}')
  expect(isInSource(index, 1234.56)).toBe(true)
  expect(isInSource(index, 3.45)).toBe(true)
  expect(isInSource(index, 98.7)).toBe(true)
  expect(isInSource(index, 55.5)).toBe(false)
})
