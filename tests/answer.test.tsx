import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { checkAnswer, parseWritten, tokensOf } from '../hooks/answer'
import { isCommon, isInSource, numberIndex } from '../hooks/detect'
import { checkDataset } from '../hooks/review'

// A made-up Google Ads answer: five campaigns over thirty days, as GAQL prints it.
let seed = 7
const rnd = () => {
  seed = (seed * 16807) % 2147483647

  return seed / 2147483647
}
const ROWS: unknown[] = []

for (let c = 0; c < 5; c += 1) {
  for (let d = 1; d <= 30; d += 1) {
    const clicks = Math.floor(rnd() * 80)

    ROWS.push({
      campaign: { id: String(20000000000 + c * 1234567), name: `Shop | Search ${c}` },
      segments: { date: `2026-10-${String(d).padStart(2, '0')}` },
      metrics: {
        clicks: String(clicks),
        impressions: String(clicks * 20 + Math.floor(rnd() * 300)),
        costMicros: String(Math.floor(clicks * (0.8 + rnd()) * 1e6)),
        conversions: (rnd() < 0.3 ? Math.floor(rnd() * 3) : 0).toFixed(1),
      },
    })
  }
}
const GAQL = JSON.stringify({ results: ROWS })

test('common: a small count is found in almost any answer, so finding it proves nothing', () => {
  const index = numberIndex(GAQL)
  const share = (values: number[], fn: (v: number) => boolean) => values.filter(fn).length / values.length
  const small = Array.from({ length: 100 }, (_, i) => i + 1)
  const cents = Array.from({ length: 200 }, (_, i) => Math.round((10 + i * 4.97) * 100) / 100)

  // Before 0.6.0 a count was "checked" because it was found: most counts are.
  expect(share(small, v => isInSource(index, v))).toBeGreaterThan(0.8)
  // Now nearly every count is too common to prove anything...
  expect(share(small, v => isCommon(index, v))).toBeGreaterThan(0.9)
  // ...and a cost with cents almost never is.
  expect(share(cents, v => isCommon(index, v))).toBeLessThan(0.05)
})

test('common: in a table, a count among its neighbours is set apart, a cost with cents is found', () => {
  const source = '{"rows":[{"spend":"1234.56","clicks":"12","impressions":"15230"},{"spend":"987.65","clicks":"11"},{"clicks":"13"},{"clicks":"10"},{"clicks":"14"}]}'
  const c = checkDataset(
    { id: 'c', title: 'Campaigns', chart: 'table', columns: ['Campaign', 'Spend', 'Clicks', 'Impressions'], rows: [['Shop', 1234.56, 12, 15230]], sourceCalls: [1], calculated: [], totalRows: 1 },
    () => source,
  )

  expect(c.found).toBe(2)
  expect(c.common).toBe(1)
  expect(c.commonCells).toEqual(['0:2'])
  expect(c.missing).toBe(0)
})

test('common: a total of common parts is common; parts that add up to something else are an alarm', () => {
  const source = '{"rows":[{"conv":"3"},{"conv":"2"},{"conv":"5"},{"conv":"4"},{"conv":"6"},{"conv":"7"},{"conv":"1"},{"conv":"8"}]}'
  const ds = (total: number) =>
    checkDataset(
      { id: 's', title: 'Sum', chart: 'table', columns: ['Name', 'Conv'], rows: [['All', total]], sourceCalls: [1], calculated: [], totalRows: 1, sums: [{ row: 0, column: 'Conv', parts: [3, 2, 5] }] },
      () => source,
    )

  // 3 + 2 + 5 = 10: the addition is right, but its parts prove nothing.
  expect(ds(10).common).toBe(1)
  expect(ds(10).found).toBe(0)
  // 3 + 2 + 5 is not 8, even if 8 shows up in the source.
  expect(ds(8).missing).toBe(1)
  expect(ds(8).missingSamples[0]).toMatch(/parts add up to 10/)
})

test('answer: numbers are read as people write them, in either language', () => {
  expect(parseWritten('1.234,56', 'pt')).toEqual({ value: 1234.56, decimals: 2 })
  expect(parseWritten('1,234.56', 'en')).toEqual({ value: 1234.56, decimals: 2 })
  expect(parseWritten('1.234', 'pt')).toEqual({ value: 1234, decimals: 0 })
  expect(parseWritten('1.234', 'en')).toEqual({ value: 1.234, decimals: 3 })
  expect(parseWritten('3,5', 'pt')).toEqual({ value: 3.5, decimals: 1 })

  const tokens = tokensOf('Investimento de R$ 12,3 mil e CPA de R$ 45,20; CTR 3,2%; ROAS 4,1x.', 'pt')

  expect(tokens.map(t => t.value)).toEqual([12300, 45.2, 3.2, 4.1])
  expect(tokens[0]?.tol).toBe(50)
  expect(tokens.map(t => t.isDerived)).toEqual([false, true, true, true])
})

test('answer: dates, account IDs, code, versions, times and list numbers are not claims', () => {
  const text = [
    '1. Período de 01/10 a 31/10/2026, conta 123-456-7890 e act_123456789, 25 de outubro, nov/26.',
    '2. Às 14h30 (10:45), versão 0.6.0, chamada #12, 2º lugar, campanha 20000000001.',
    '```',
    'cost = 99999.99',
    '```',
    'Custo `R$ 5.555,55` e o link https://example.com/x/1234.56',
  ].join('\n')

  expect(tokensOf(text, 'pt')).toEqual([])
})

test('answer: each number lands in one bucket, and only the unbacked ones are listed', () => {
  const source = JSON.stringify({
    results: [
      { campaign: { name: 'Shop | Search' }, metrics: { costMicros: '1234560000', clicks: '512', impressions: '15230', conversions: '27.0', ctr: 0.0336 } },
      { campaign: { name: 'Store | PMax' }, metrics: { costMicros: '987650000', clicks: '301', impressions: '40110', conversions: '12.0' } },
    ],
  })
  const plan = 'Plano de outubro: verba de R$ 4.000,00 no Google.'
  const answer = [
    'Resumo de 01/10 a 31/10/2026:',
    '',
    '| Campanha | Custo | Cliques | Conversões | CPA |',
    '|---|---|---|---|---|',
    '| Shop \\| Search | R$ 1.234,56 | 512 | 27 | R$ 45,72 |',
    '| Store \\| PMax | R$ 987,65 | 301 | 12 | R$ 82,30 |',
    '| **Total** | **R$ 2.222,21** | 813 | 39 | R$ 56,98 |',
    '',
    'O CTR da Shop ficou em 3,36%. A verba do plano é R$ 4.000 e ainda restam R$ 1.777,79.',
    'A PMax teve 40.110 impressões e custou R$ 3.420 no período, 2 campanhas em 30 dias.',
  ].join('\n')
  const c = checkAnswer(answer, numberIndex(source), numberIndex(plan), 0, 'pt')

  // R$ 1.234,56, 512, R$ 987,65, 301, 3,36%, 40.110, and the two totals of the table.
  expect(c.found).toBe(8)
  expect(c.summed).toBe(2)
  // The plan's budget, read from another file.
  expect(c.elsewhere).toBe(1)
  // Three CPAs and what is left of the budget.
  expect(c.calculated).toBe(4)
  // 27, 12 and 39 conversions, 2 campaigns, 30 days.
  expect(c.common).toBe(5)
  // The one number nothing backs.
  expect(c.missing).toEqual([{ text: 'R$ 3.420', context: '…teve 40.110 impressões e custou R$ 3.420 no período, 2 campanhas em 30 dias.' }])
  expect(c.total).toBe(19)
})

const PANE = {
  plugin: 'media-review-panel',
  component: 'Pane',
  requestId: 'media-review',
  props: { title: 'Media Review', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 300 }, view: {} },
} as const

const META = JSON.stringify({
  data: [
    { campaign_name: 'Brand', spend: '1234.56', impressions: '15230', conversions: '40' },
    { campaign_name: 'Prospecting', spend: '980.10', impressions: '9120', conversions: '22' },
  ],
})

const engine = (on: On, toasts: string[]) => {
  mock.clock(on, { now: Date.parse('2026-11-25T12:00:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'media-review' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) => {
    const text = String(e.tool) === 'Read' ? 'Plano: verba de R$ 3.000,00 em outubro.' : META

    return { result: text, text }
  })
}

const turnEnd = (answer: string, extra: Record<string, unknown> = {}) => ({
  answer,
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...extra,
})

const ANSWER = 'A Brand investiu R$ 1.234,56 e teve 15.230 impressões. A Prospecting custou R$ 980,10. A verba é R$ 3.000. No total, R$ 2.500,00 em outubro.'

for (const surface of ['desktop', 'terminal'] as const) {
  test(`answer on ${surface}: a number nothing backs is shown, with what to do, in both views`, async ($, on) => {
    const toasts: string[] = []
    engine(on, toasts)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    await $.prompt.submit({ text: 'Analisa a conta da loja, por favor', wait: false, origin: { kind: 'composer' } })
    await $.tool.call({ tool: 'Read', file_path: '/notes/plano.md' })
    await $.tool.call({ tool: 'mcp__meta__ads_get_ad_entities', ad_account_id: 'act_123456789', level: 'campaign' })
    await $.turn.complete(turnEnd(ANSWER))

    expect(toasts).toEqual(['Revisão de Mídia: 1 número da resposta não está nos dados da conta'])

    const ui = await $.ui.mount({ ...PANE, surface })
    const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

    expect(await has(/^Na última resposta do Claude$/)).toBe(true)
    expect(await has(/^1 número da resposta do Claude não está nos dados da conta$/)).toBe(true)
    expect(await has(/R\$ 2\.500,00 \(…em outubro\.|R\$ 2\.500,00 \(/)).toBe(true)
    expect(await has(/^✓ 3 encontrados nos dados da conta$/)).toBe(true)
    expect(await has(/^1 em outro arquivo que o Claude leu ou na sua mensagem$/)).toBe(true)
    expect(await has(/^! 1 não está nos dados da conta que o painel viu$/)).toBe(true)
    await ui.unmount()

    await $.command.run({ command: 'media-review', args: 'completo', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

    const full = await $.ui.mount({ ...PANE, surface })

    expect(await full.find({ type: 'Text', text: /Última resposta: 1 número não está nos dados da conta que o painel viu: R\$ 2\.500,00/ })).toBeDefined()
    await full.unmount()
  })
}

test('answer: a turn that read no media data, or a subagent, is not checked', async ($, on) => {
  const toasts: string[] = []
  engine(on, toasts)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__meta__ads_get_ad_entities', ad_account_id: 'act_123456789', level: 'campaign' })

  // A subagent's report is not the answer the person reads.
  await $.turn.complete(turnEnd('Custou R$ 7.777,77.', { agentId: 'a1' }))
  expect(toasts).toEqual([])

  // The main answer of the turn that read the data is.
  await $.turn.complete(turnEnd('A Brand investiu R$ 1.234,56.'))
  expect(toasts).toEqual([])

  // A later turn that read nothing is left alone, whatever it says.
  await $.turn.complete(turnEnd('Custou R$ 7.777,77.'))
  expect(toasts).toEqual([])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // No message from the person here, so the panel speaks English.
  expect(await ui.find({ type: 'Text', text: /^✓ 1 found in the account data$/ })).toBeDefined()
  await ui.unmount()
})
