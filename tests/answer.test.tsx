import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { checkAnswer, parseWritten, tokensOf } from '../hooks/answer'
import { isCommon, isInSource, numberIndex } from '../hooks/detect'
import { rowLabels, rowSums } from '../hooks/rows'
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
  // 27, 12 and 39 conversions, 2 campaigns. "30 dias" is a measure, not a result: left out.
  expect(c.common).toBe(4)
  // The one number nothing backs.
  expect(c.missing).toEqual([{ text: 'R$ 3.420', context: '…teve 40.110 impressões e custou R$ 3.420 no período, 2 campanhas em 30 dias.' }])
  expect(c.total).toBe(18)
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

test('answer: a total Claude added up from the rows it read is checked, not flagged', () => {
  // Thirty days of two campaigns, as the API lists them; nowhere a total.
  const rows = []

  for (let d = 1; d <= 30; d++) {
    for (const [name, cost] of [['Shop', 12.34 + d], ['Store', 20.05 + d / 10]] as const) {
      rows.push({ campaign: { name }, segments: { date: `2026-10-${String(d).padStart(2, '0')}` }, metrics: { costMicros: String(Math.round(cost * 1e6)) } })
    }
  }

  const source = JSON.stringify({ results: rows })
  const shop = rows.filter(r => r.campaign.name === 'Shop').reduce((a, r) => a + Number(r.metrics.costMicros) / 1e6, 0)
  const all = rows.reduce((a, r) => a + Number(r.metrics.costMicros) / 1e6, 0)
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
  const answer = `Em outubro a conta gastou ${money(all)}. A Shop sozinha gastou ${money(shop)}. Uma conta que não existe: ${money(all + 77.7)}.`
  const c = checkAnswer(answer, numberIndex(source), [], 0, 'pt', rowSums(source))

  expect(c.summed).toBe(2)
  expect(c.missing.map(m => m.text)).toEqual([money(all + 77.7)])
})

test("answer: Claude's own arithmetic is a calculation, and codes and measures are not claims", () => {
  const source = '{"data":[{"spend":"1234.50","impressions":"98000"}]}'
  const answer = [
    'A Loja Norte fecha em R$ 1.234,50. Resta R$ 765,40 do plano e o novo ritmo é de R$ 42,10 por dia.',
    'Cadastros a cada 100 cliques: 5,11 antes, 0,35 depois. Frequência 1,11.',
    'Formulário idPs 40123 e 40456, versão 87 do Tag Manager, erro 403, testado com 375 px.',
    'Intake 2027.1 contra 2026.1.',
  ].join('\n')
  const c = checkAnswer(answer, numberIndex(source), [], 0, 'pt')

  expect(c.found).toBe(1)
  expect(c.missing).toEqual([])
  // R$ 765,40, R$ 42,10, "a cada 100", 5,11, 0,35, 1,11 are Claude's own.
  expect(c.calculated).toBe(6)
  // The IDs, the version, the error, the pixels and the intakes are not counted at all.
  expect(c.total).toBe(7)
})

test('answer: what Claude said before, or read outside the ad data, is not a new claim', () => {
  const c = checkAnswer('A lista do CRM tem 1.006 inscritos.', numberIndex('{"data":[{"spend":"10.00"}]}'), numberIndex('Resposta anterior: 1.006 inscritos na lista.'), 0, 'pt')

  expect(c.elsewhere).toBe(1)
  expect(c.missing).toEqual([])
})

test('answer: in a table, a cost of another campaign written in this one\'s row is flagged', () => {
  const source = JSON.stringify({
    results: [
      { campaign: { name: 'Pesquisa | Marca' }, metrics: { costMicros: '1234560000', clicks: '512' } },
      { campaign: { name: 'PMax | Catálogo' }, metrics: { costMicros: '987650000', clicks: '301' } },
    ],
  })
  const table = (marca: string) =>
    ['| Campanha | Custo | Cliques |', '|---|---|---|', `| Pesquisa \\| Marca | ${marca} | 512 |`, '| PMax \\| Catálogo | R$ 987,65 | 301 |'].join('\n')
  const right = checkAnswer(table('R$ 1.234,56'), numberIndex(source), [], 0, 'pt', rowSums(source), rowLabels(source))
  const swapped = checkAnswer(table('R$ 987,65'), numberIndex(source), [], 0, 'pt', rowSums(source), rowLabels(source))

  expect(right.missing).toEqual([])
  expect(swapped.missing).toEqual([{ text: 'R$ 987,65', context: 'Pesquisa | Marca · Custo', isWrongRow: true }])
})

test('answer: comparisons, ranges and costs per are read as Claude wrote them', () => {
  const source = '{"data":[{"spend":"9999.99"}]}'
  const answer = [
    'A verba subiu 41%, de R$ 312 para R$ 440 por dia, e os pedidos caíram de 118 para 96.',
    'As três fecham entre R$ 612,40 e R$ 612,60.',
    'Ela trouxe 81,0 conversões a R$ 6,52, contra R$ 6,18 na outra região.',
    'O Google recusa com 403.',
  ].join('\n')
  const c = checkAnswer(answer, numberIndex(source), [], 0, 'pt')

  expect(c.missing).toEqual([])
})

test('answer: the row check only applies to columns that copy a metric', () => {
  const source = JSON.stringify({ data: [{ campaign_name: 'Loja Norte | Leads', spend: '512.30' }, { campaign_name: 'Loja Sul | Leads', spend: '8.00' }] })
  // "Agora" is Claude's new budget, not a metric of the data: no row check there.
  const answer = ['| Campanha | Antes | Agora |', '|---|---|---|', '| Loja Norte | R$ 7,00 | R$ 8,00 |'].join('\n')
  const c = checkAnswer(answer, numberIndex(source), [], 0, 'pt', rowSums(source), rowLabels(source))

  expect(c.missing.filter(m => m.isWrongRow)).toEqual([])
})

