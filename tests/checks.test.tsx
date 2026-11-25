import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { checkSum, classify, classifyOutput, datesIn, extract, numberIndex, savedPath } from '../hooks/detect'
import { plainAlerts } from '../hooks/plain'
import { checkDataset, isCovered, spansOf } from '../hooks/review'
import type { CallLog, Dataset, Review } from '../types'

// Sample answers, as a connector and a script print them. Every name is made up.
const ENTITIES = JSON.stringify({
  ad_entities: JSON.stringify([
    { name: 'Store | prospecting', amount_spent: { value: '120.45', unit: 'BRL' }, impressions: '15200', link_click: '70' },
    { name: 'Store | remarketing', amount_spent: { value: '210.30', unit: 'BRL' }, impressions: '38110', link_click: '112' },
    { name: 'Store | brand', amount_spent: { value: '40.17', unit: 'BRL' }, impressions: '5000', link_click: '15' },
  ]),
})
// A script that printed each campaign's cost rounded to whole reais.
const PRINTED = '  12001  shop | search\n  30440  store | pmax\n  17200  store | search\n'

const dataset = (rows: (string | number | null)[][], extra: Partial<Dataset> = {}): Omit<Dataset, 'check'> => ({
  id: 'totals',
  title: 'Totals',
  chart: 'table',
  columns: ['Platform', 'Spend', 'Impressions'],
  rows,
  sourceCalls: [1],
  calculated: [],
  totalRows: rows.length,
  ...extra,
})

test('sums: a total checks out when its parts are in the source and add up', () => {
  const ds = dataset([['Meta', 370.92, 58310]], {
    sums: [
      { row: 0, column: 'Spend', parts: [120.45, 210.3, 40.17] },
      { row: 0, column: 'Impressions', parts: [15200, 38110, 5000] },
    ],
  })
  const c = checkDataset(ds, () => ENTITIES)

  expect(c.found).toBe(2)
  expect(c.summed).toBe(2)
  expect(c.missing).toBe(0)
})

test('sums: without its parts a total is not found, and the wording says it may be a sum', () => {
  const c = checkDataset(dataset([['Meta', 370.92, 58310]]), () => ENTITIES)

  expect(c.missing).toBe(2)

  const review = { datasets: [{ ...dataset([['Meta', 370.92, 58310]]), check: c }], periods: [], warnings: [] } as unknown as Review
  const alert = plainAlerts(review, [], 'pt')[0]

  expect(alert?.title).toBe('2 números não aparecem na fonte')
  expect(alert?.body).toMatch(/total somado pelo Claude ou um número errado/)
  expect(alert?.todo).toMatch(/partes de cada total/)
})

test('sums: a wrong total, or a part that is not in the source, stays not found and says why', () => {
  const wrong = checkDataset(dataset([['Meta', 375.0, null]], { sums: [{ row: 0, column: 'Spend', parts: [120.45, 210.3, 40.17] }] }), () => ENTITIES)

  expect(wrong.missing).toBe(1)
  expect(wrong.missingSamples[0]).toMatch(/parts add up to 370.92/)

  const made = checkDataset(dataset([['Meta', 380.92, null]], { sums: [{ row: 0, column: 'Spend', parts: [120.45, 210.3, 50.17] }] }), () => ENTITIES)

  expect(made.missing).toBe(1)
  expect(made.missingSamples[0]).toMatch(/1 of 3 parts not in the sources/)
})

test('sums: parts printed rounded may be off by their rounding; exact counts may not', () => {
  const index = numberIndex(PRINTED)

  // 30439.62 + 17200.31 printed as 30440 and 17200.
  expect(checkSum(index, 47639.93, [30440, 17200]).ok).toBe(true)
  expect(checkSum(index, 47649.93, [30440, 17200]).ok).toBe(false)
  // Whole counts must add up exactly.
  expect(checkSum(numberIndex('15200 38110 5000'), 58311, [15200, 38110, 5000]).ok).toBe(false)
  expect(checkSum(numberIndex('15200 38110 5000'), 58310, [15200, 38110, 5000]).ok).toBe(true)
})

test('sums: a cited answer not in memory leaves what was not found unchecked, not wrong', () => {
  const ds = dataset([['Meta', 999.99, null]], { sourceCalls: [1, 2] })
  const c = checkDataset(ds, n => (n === 1 ? ENTITIES : undefined))

  expect(c.missing).toBe(0)
  expect(c.unchecked).toBe(1)
  expect(c.note).toBe('partly-in-memory')
})

test('dates: a date in a folder or file name is not a period', () => {
  expect(datesIn('cd "/clients/acme/comparison-2026-11-25/data" && python3 run.py')).toEqual([])
  expect(datesIn('python3 run.py > out_2026-11-25.json')).toEqual([])
  expect(datesIn('python3 run.py --since 2026-10-01 --until 2026-10-31')).toEqual(['2026-10-01 → 2026-10-31'])
  expect(datesIn('python3 run.py --day 2026-10-07')).toEqual(['2026-10-07'])
})

test('dates: two periods named in one command stay two', () => {
  const cmd = 'cd /work/report-2026-11-25 && python3 - <<\'EOF\'\nW = {"a": ("2025-09-16", "2025-11-22"), "b": ("2026-09-16", "2026-11-22")}\nEOF'

  expect(extract('Bash', { command: cmd }).dates).toEqual(['2025-09-16 → 2025-11-22', '2026-09-16 → 2026-11-22'])
})

test('dates: every query of a script keeps its own dates', () => {
  const cmd =
    "python3 g.py <<'EOF'\nQ1 = \"SELECT campaign.name, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '2025-06-01' AND '2026-06-30'\"\n" +
    "Q2 = \"SELECT campaign.name FROM campaign WHERE segments.date BETWEEN '2026-09-16' AND '2026-11-22'\"\nEOF"

  expect(extract('Bash', { command: cmd }).dates).toEqual(['2025-06-01 → 2026-06-30', '2026-09-16 → 2026-11-22'])
})

test('dates: the comparison period counts, a wider pull is named as such, one alert per query', () => {
  const review = {
    periods: [{ start: '2026-09-16', end: '2026-11-24', compareStart: '2025-09-16', compareEnd: '2025-11-24' }],
    datasets: [],
    warnings: [],
  } as unknown as Review
  const call = (n: number, dates: string[]) => ({ n, dates, flags: [], kind: 'read', status: 'ok' }) as unknown as CallLog
  const alerts = plainAlerts(
    review,
    [
      call(1, ['2025-09-16 → 2025-11-22']),
      call(2, ['2025-06-01 → 2026-06-30', '2026-09-01 → 2026-11-24']),
      call(3, ['2024-01-01 → 2024-01-31']),
    ],
    'pt',
  )

  expect(alerts.length).toBe(2)
  expect(alerts[0]?.title).toBe('Uma consulta buscou mais dias que o período')
  expect(alerts[0]?.body).toBe(
    'A consulta #2 buscou 1º de junho de 2025 a 30 de junho de 2026; 1º de setembro a 24 de novembro de 2026, mais dias do que o período (16 de setembro a 24 de novembro de 2026 e 16 de setembro a 24 de novembro de 2025).',
  )
  expect(alerts[1]?.body).toBe(
    'A consulta #3 buscou janeiro de 2024, fora de 16 de setembro a 24 de novembro de 2026 e de 16 de setembro a 24 de novembro de 2025.',
  )
})

test('dates: two periods side by side cover the days between them', () => {
  const spans = spansOf([{ start: '2026-10-01', end: '2026-10-31', compareStart: '2026-09-01', compareEnd: '2026-09-30' }])

  expect(isCovered('2026-09-01', '2026-10-31', spans)).toBe(true)
  expect(isCovered('2026-08-31', '2026-10-31', spans)).toBe(false)
  expect(isCovered('2026-10-05', '2026-11-01', spans)).toBe(false)
})

test("reading Claude's own transcript again is not a media call", () => {
  const cmd = "cd ~/.claude/projects/-Users-me-work/ && python3 - <<'EOF'\nfor l in open('abc.jsonl'): print(l)\nEOF"

  expect(classifyOutput(cmd, "SELECT campaign.name FROM campaign WHERE metrics.cost_micros > 0")).toBeUndefined()
  expect(classify('Read', { file_path: '/Users/me/.claude/projects/-Users-me-work/abc.jsonl' }, true)).toBeUndefined()
  // A data file of the work itself still counts while a review runs.
  expect(classify('Read', { file_path: '/Users/me/work/data/campaigns.json' }, true)).toBeDefined()
})

test('own scripts: showing or finding the script is not running it', () => {
  const mine = ['collect.py']

  expect(classify('Bash', { command: 'cat "/work/tools/collect.py" | head -80' }, false, mine)).toBeUndefined()
  expect(classify('Bash', { command: 'find /work/tools -name "collect.py" | head -3' }, false, mine)).toBeUndefined()
  expect(classify('Bash', { command: "cat > collect.py <<'EOF'\nprint(1)\nEOF" }, false, mine)).toBeUndefined()
  expect(classify('Bash', { command: 'cd /work && python3 -I tools/collect.py out.jsonl' }, false, mine)).toBeDefined()
  expect(classify('Bash', { command: '"/work/my tools/collect.py" 2026-10-01' }, false, mine)).toBeDefined()
})

test('saved results: the path is read off both kinds of notice', () => {
  expect(savedPath('Error: result (80,667 characters) exceeds maximum allowed tokens. Output has been saved to /tmp/r/meta-1.txt.\nFormat: JSON')).toBe(
    '/tmp/r/meta-1.txt',
  )
  expect(savedPath('<persisted-output>\nOutput too large (49.3KB). Full output saved to: /tmp/r/bash-2.txt\n\nPreview')).toBe('/tmp/r/bash-2.txt')
  expect(savedPath('{"data":[]}')).toBeUndefined()
})

const STUB = 'Error: result (80,667 characters) exceeds maximum allowed tokens. Output has been saved to /tmp/r/meta-1.txt.\nFormat: JSON'

const engine = (on: On, fileText?: string) => {
  mock.clock(on, { now: Date.parse('2026-11-23T12:00:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'media-review' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: STUB, text: STUB }))
  on('fs.read', (_, e) => (fileText !== undefined && e.path === '/tmp/r/meta-1.txt' ? { value: fileText } : { deny: 'no such file' }))
}

const REPORT = {
  action: 'start',
  title: 'Review',
  periods: [{ start: '2026-10-01', end: '2026-10-31' }],
  datasets: [
    {
      id: 'spend',
      title: 'Spend',
      chart: 'table',
      columns: ['Campaign', 'Spend'],
      rows: [['Store | remarketing', 210.3]],
      source_calls: [1],
    },
  ],
}

test('saved results: the panel reads the saved file and checks its numbers', async ($, on) => {
  engine(on, ENTITIES)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__meta__ads_get_ad_entities', ad_account_id: 'act_123456789', level: 'campaign' })

  const report = await $.tool.call({ tool: 'mcp__media-review-panel__report', ...REPORT })

  expect(String(report.result)).toMatch(/1 found, 0 not found/)
})

test('saved results: a file the panel cannot open leaves the numbers unchecked, with an alert', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__meta__ads_get_ad_entities', ad_account_id: 'act_123456789', level: 'campaign' })

  const report = await $.tool.call({ tool: 'mcp__media-review-panel__report', ...REPORT })

  expect(String(report.result)).toMatch(/0 found, 0 not found, 0 calculated, 1 unchecked/)

  const ui = await $.ui.mount({
    plugin: 'media-review-panel',
    component: 'Pane',
    requestId: 'media-review',
    surface: 'desktop',
    props: { title: 'Media Review', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 200 }, view: {} },
  })

  expect(await ui.find({ type: 'Text', text: /went to a file the panel could not open/ })).toBeDefined()
  await ui.unmount()
})
