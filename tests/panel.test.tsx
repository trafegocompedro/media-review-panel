import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { guessLang } from '../hooks/i18n'
import { isInSource, numberIndex, readResult } from '../hooks/detect'
import { MOODS, robot, robotText } from '../hooks/mascot'
import { buildDemo } from '../hooks/demo'
import { friendlyCurrency, friendlyTimezone, glossary, naturalRange, nowLine, plainAlerts, plainColumn } from '../hooks/plain'
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

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
// The technical view, which these tests read line by line.
const full = ($: Engine) => $.command.run({ command: 'media-review', args: 'full', ...RUN })

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
  await $.command.run({ command: 'media-review', args: 'demo', ...RUN })
  await full($)

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
  await full($)

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
  await full($)

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
  await full($)

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
  await full($)

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
  await $.command.run({ command: 'media-review', args: 'demo', ...RUN })
  await full($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // The demo has an empty call, extra pages, a date outside the period and a value not found.
  expect(await ui.find({ type: 'Text', text: /⚠ \d+ ALERTS/ })).toBeDefined()
  // Levels carry a mark, not only a color.
  expect(await ui.find({ type: 'Text', text: /● Keyword/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓ Campaign/ })).toBeDefined()
  // The keyword table marks the value it could not find and the legend says why.
  expect(await ui.find({ type: 'Text', text: /421\.30!/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /! not in the account data$/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /Checks that the numbers match the account data/ })).toBeDefined()
  await ui.press({ key: 'load-demo' })
  expect(await ui.find({ type: 'Text', text: /SAMPLE numbers/ })).toBeDefined()
  await ui.unmount()
})

test('UX: the mascot stops moving when the system asks for reduced motion', () => {
  expect(robot('look')).toMatch(/prefers-reduced-motion:reduce/)
  expect(robot('done')).not.toMatch(/<animate/)
})

test('Bip: each of the 16 moods is its own pixel-art pose', () => {
  expect(MOODS.length).toBe(16)
  const drawings = new Set<string>()
  for (const m of MOODS) {
    const svg = robot(m)
    expect(svg).toMatch(/shape-rendering="crispEdges"/)
    expect(svg).toMatch(new RegExp(`class="bip st-${m}"`))
    expect(robotText(m)).not.toBe('')
    drawings.add(svg)
  }
  expect(drawings.size).toBe(16)
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

test('Simple view: the demo reads in plain words, with what to do and the details folded', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'media-review', args: 'demo', ...RUN })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    // What is happening, and where in the review.
    expect(await ui.find({ type: 'Text', text: /Analyzing: Google: keywords and search terms/ })).toBeDefined()
    // Alerts in plain words, each with a next step.
    expect(await ui.find({ type: 'Text', text: /Needs your attention/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 number is not in the account data/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /What to do:/ })).toBeDefined()
    // The three tiles and the plain period.
    expect(await ui.find({ type: 'Text', text: /October 2026/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\d+ of \d+/ })).toBeDefined()
    // Metrics get names a beginner reads, and one line of meaning.
    expect(await ui.find({ type: 'Text', text: /Cost per conversion/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /what each conversion cost, on average/ })).toBeDefined()
    // The call log stays folded until asked for.
    expect(await ui.find({ type: 'Button', text: /ads_get_ad_entities/ })).toBeUndefined()
    await ui.press({ key: 'tech' })
    expect(await ui.find({ type: 'Button', text: /ads_get_ad_entities/ })).toBeDefined()
    // Fold it again, so the next surface starts the same way.
    await ui.press({ key: 'tech' })
    await ui.unmount()
  }
})

test('Simple view: the demo and the words follow Portuguese', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'media-review', args: 'pt', ...RUN })
  await $.command.run({ command: 'media-review', args: 'demo', ...RUN })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /Precisa da sua atenção/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /O que fazer:/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Outubro de 2026/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /EXEMPLO Loja Demo \(Meta\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /real \(R\$\), horário de Brasília/ })).toBeDefined()
  await ui.unmount()
})

test('Simple and Full: the switch flips the view and is remembered', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'media-review', args: 'demo', ...RUN })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /DEBUG & VALIDATION/ })).toBeUndefined()
  await ui.press({ key: 'mode-full' })
  expect(await ui.find({ type: 'Text', text: /DEBUG & VALIDATION/ })).toBeDefined()
  await ui.unmount()

  // Opening the pane again keeps the choice.
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await again.find({ type: 'Text', text: /DEBUG & VALIDATION/ })).toBeDefined()
  await again.press({ key: 'mode-simple' })
  expect(await again.find({ type: 'Text', text: /Needs your attention/ })).toBeDefined()
  await again.unmount()
})

test('plain words: dates, settings, metric names and the meaning of each metric', () => {
  expect(naturalRange('2026-10-01', '2026-10-31', 'pt')).toBe('outubro de 2026')
  expect(naturalRange('2026-10-01', '2026-10-15', 'pt')).toBe('1º a 15 de outubro de 2026')
  expect(naturalRange('2026-09-01', '2026-10-31', 'pt')).toBe('1º de setembro a 31 de outubro de 2026')
  expect(naturalRange('2025-12-15', '2026-01-15', 'en')).toBe('December 15, 2025 – January 15, 2026')
  expect(naturalRange('ontem', 'hoje', 'pt')).toBe('ontem → hoje')
  expect(friendlyTimezone('America/Sao_Paulo', 'pt')).toBe('horário de Brasília')
  expect(friendlyCurrency('BRL', 'pt')).toBe('real (R$)')
  expect(plainColumn('cpa', 'pt')).toBe('Custo por conversão')
  expect(plainColumn('metrics.cost_micros', 'pt')).toBe('Custo')
  expect(plainColumn('conversion_value', 'en')).toBe('Revenue')
  expect(plainColumn('whatever', 'pt')).toBe('whatever')

  const seen = new Set<string>()
  expect(glossary(['date', 'spend', 'conversions'], 'pt', seen).length).toBe(1)
  // A term already explained is not explained again.
  expect(glossary(['campaign', 'conversions', 'cpa'], 'pt', seen).length).toBe(1)
})

test('plain alerts: the most serious first, each with a next step', () => {
  const demo = buildDemo(Date.parse('2026-11-23T12:00:00Z'), 'pt')
  const alerts = plainAlerts(demo.review, demo.calls, 'pt')

  // What reaches a client leads: the number of the answer that nothing backs.
  expect(alerts[0]?.title).toBe('1 número da resposta do Claude não está nos dados da conta')
  expect(alerts[0]?.body).toMatch(/^R\$ 1\.890,00 \(…de remarketing da Meta custou R\$ 1\.890,00 em 31 dias\.\)/)
  expect(alerts[1]?.title).toMatch(/não está nos dados da conta/)
  expect(alerts[1]?.body).toMatch(/exemplo tênis de corrida/)
  // The list that came back in part is a warning, so it comes before the empty query.
  expect(alerts[2]?.title).toMatch(/pela metade/)
  expect(alerts[2]?.todo).toMatch(/todas as páginas/)
  expect(alerts.some(a => /voltou vazia/.test(a.title))).toBe(true)
  expect(alerts.some(a => /mais dias que o período/.test(a.title) && /agosto/.test(a.body ?? ''))).toBe(true)
  expect(nowLine(demo.review, 'pt')).toBe('Analisando: Google: palavras-chave e termos pesquisados')
  expect(nowLine(null, 'pt')).toMatch(/Esperando/)
})
