import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { digestOf, roleOf } from '../hooks/digest'
import type { RankingDigest, SeriesDigest } from '../hooks/digest'

// Made-up accounts: two campaigns over four days, and a list of search terms.
const DAILY_COLUMNS = ['Data', 'Campanha', 'Impressões', 'Cliques', 'Custo', 'Custo por clique', 'Conversões']
const DAILY = [
  ['2026-10-05', 'Shop | Search', 100, 10, 50.0, 5.0, 0],
  ['2026-10-05', 'Shop | Search [test]', 40, 4, 30.0, 7.5, 1],
  ['2026-10-06', 'Shop | Search', 120, 12, 60.0, 5.0, 1],
  ['2026-10-06', 'Shop | Search [test]', 50, 5, 35.0, 7.0, 2],
  ['2026-10-07', 'Shop | Search', 90, 8, 40.0, 5.0, 0],
  ['2026-10-08', 'Shop | Search', 80, 6, 30.0, 5.0, 0],
]
const TERM_COLUMNS = ['Termo pesquisado', 'Palavra-chave', 'Cliques', 'Custo']
const TERMS = [
  ['running shoes', 'shoes', 12, 60.1],
  ['running shoes', 'running shoes for men', 4, 21.92],
  ['trail shoes price', 'shoes price', 2, 9.1],
  ['shoe store near me', 'shoe store', 1, 5.29],
  ['best running shoes for flat feet', 'running shoes for men', 1, 5.24],
  ['cheap shoes', 'shoes price', 1, 5.17],
  ['shoes online', 'shoes', 1, 3.02],
  ['marathon shoes', 'running shoes for men', 1, 5.66],
  ['shoes for walking', 'shoes', 1, 5.43],
]

test('digest: what each column measures, and rates are never summed', () => {
  expect(roleOf('Custo')).toBe('cost')
  expect(roleOf('Investimento')).toBe('cost')
  expect(roleOf('Custo por clique')).toBe('rate')
  expect(roleOf('CTR')).toBe('rate')
  expect(roleOf('Cliques no link')).toBe('clicks')
  expect(roleOf('Conversões')).toBe('conversions')
  expect(roleOf('Leads')).toBe('conversions')
  expect(roleOf('Valor de conversão')).toBe('revenue')
  expect(roleOf('Alcance')).toBe('other')
})

test('digest: a table over days gives the totals, one value per day and a line per campaign', () => {
  const dg = digestOf({ columns: DAILY_COLUMNS, rows: DAILY, chart: 'table' }) as SeriesDigest

  expect(dg.kind).toBe('series')
  expect([dg.from, dg.to]).toEqual(['2026-10-05', '2026-10-08'])
  // Cost per conversion from the totals (245 / 4), not an average of the rows.
  expect(dg.totals).toEqual([
    { metric: 'cost', value: 245 },
    { metric: 'clicks', value: 45 },
    { metric: 'conversions', value: 4 },
    { metric: 'cpa', value: 61.25 },
  ])
  expect(dg.days).toEqual([
    { date: '2026-10-05', value: 80, marks: 1 },
    { date: '2026-10-06', value: 95, marks: 3 },
    { date: '2026-10-07', value: 40, marks: 0 },
    { date: '2026-10-08', value: 30, marks: 0 },
  ])
  expect(dg.groupColumn).toBe('Campanha')
  expect(dg.groups.map(g => g.label)).toEqual(['Shop | Search', 'Shop | Search [test]'])
  expect(dg.groups[1]?.totals.find(x => x.metric === 'conversions')?.value).toBe(3)
})

test('digest: a long list gives its top five and one line for the rest', () => {
  const dg = digestOf({ columns: TERM_COLUMNS, rows: TERMS, chart: 'table', x: 'Termo pesquisado' }) as RankingDigest

  expect(dg.kind).toBe('ranking')
  expect(dg.metric).toBe('clicks')
  expect(dg.groupColumn).toBe('Palavra-chave')
  expect(dg.top.map(r => [r.label, r.value])).toEqual([
    ['running shoes', 12],
    ['running shoes', 4],
    ['trail shoes price', 2],
    ['marathon shoes', 1],
    ['shoes for walking', 1],
  ])
  // The same term twice stays apart by the keyword that brought it.
  expect(dg.top[1]?.group).toBe('running shoes for men')
  expect(dg.rest?.count).toBe(4)
  expect(dg.rest?.each).toBe(1)
  expect(Math.round((dg.rest?.cost ?? 0) * 100) / 100).toBe(18.72)
})

test('digest: a short table, or one with nothing to add up, stays a table', () => {
  expect(digestOf({ columns: ['Plataforma', 'Intake A', 'Intake B'], rows: [['Google', 10, 20], ['Meta', 5, 8]], chart: 'table' })).toBeUndefined()
  expect(digestOf({ columns: TERM_COLUMNS, rows: TERMS.slice(0, 4), chart: 'table' })).toBeUndefined()
  expect(digestOf({ columns: ['Data', 'CTR'], rows: [['2026-10-05', 1.2], ['2026-10-06', 1.4], ['2026-10-07', 1.1]], chart: 'table' })).toBeUndefined()
  expect(digestOf({ columns: DAILY_COLUMNS, rows: DAILY, chart: 'line' })).toBeUndefined()
})

const PANE = {
  plugin: 'media-review-panel',
  component: 'Pane',
  requestId: 'media-review',
  props: { title: 'Media Review', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 300 }, view: {} },
} as const

const engine = (on: On) => {
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'media-review' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: JSON.stringify({ rows: [...DAILY, ...TERMS] }), text: JSON.stringify({ rows: [...DAILY, ...TERMS] }) }))
}

const REPORT = {
  action: 'start',
  language: 'pt-BR',
  title: 'Revisão de outubro',
  currency: 'BRL',
  periods: [{ start: '2026-10-05', end: '2026-10-08' }],
  datasets: [
    { id: 'daily', title: 'Cliques, custo e conversões por dia', chart: 'table', columns: DAILY_COLUMNS, rows: DAILY, source_calls: [1], calculated_columns: ['Custo por clique'] },
    { id: 'terms', title: 'Termos com clique', chart: 'table', columns: TERM_COLUMNS, rows: TERMS, x: 'Termo pesquisado', source_calls: [1] },
  ],
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`Simple view on ${surface}: a long table reads as totals, days, campaigns and a top list`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    await $.tool.call({ tool: 'mcp__meta__ads_get_ad_entities', ad_account_id: 'act_123456789', level: 'campaign' })
    await $.tool.call({ tool: 'mcp__media-review-panel__report', ...REPORT })

    const ui = await $.ui.mount({ ...PANE, surface })
    const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

    // The period in words, and its totals in big numbers.
    expect(await has(/^5 a 8 de outubro de 2026$/)).toBe(true)
    expect(await has(/^R\$ 245,00$/)).toBe(true)
    expect(await has(/^por conversão$/)).toBe(true)
    expect(await has(/^R\$ 61,25$/)).toBe(true)
    // One chart per day, then a line per campaign with its own cost per conversion.
    expect(await has(/^Custo por dia$/)).toBe(true)
    expect(await has(/^Por campanha$/)).toBe(true)
    expect(await has(/^R\$ 65,00 · 9 cliques · 3 conversões · R\$ 21,67 por conversão$/)).toBe(true)
    expect(await has(/^R\$ 180,00 · 36 cliques · 1 conversão · R\$ 180,00 por conversão$/)).toBe(true)
    // The list: full terms, the keyword that brought each, and the rest in one line.
    expect(await has(/palavra-chave: running shoes for men/)).toBe(true)
    expect(await has(/^\+ 4 outros com 1 clique cada · R\$ 18,72$/)).toBe(true)
    // The numbers are still checked, and the table is one press away.
    expect(await has(/24 de 24 números conferidos/)).toBe(true)
    expect(await ui.find({ type: 'Button', key: 'tbl-daily', text: /Ver a tabela completa \(6 linhas\)/ })).toBeDefined()
    expect(await has(/2026-10-05/)).toBe(false)
    await ui.press({ key: 'tbl-daily' })
    expect(await ui.find({ type: 'Button', key: 'tbl-daily', text: /Ocultar a tabela/ })).toBeDefined()
    expect(await has(/2026-10-05/)).toBe(true)
    await ui.unmount()
  })
}
