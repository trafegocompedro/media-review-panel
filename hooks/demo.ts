// SAMPLE DATA for /media-review demo. Every account, name and number here is
// made up, and the panel labels the review as sample data wherever it shows.

import type { CallLog, Lang, LaunchPiece, Review } from '../types'
import { checkAnswer } from './answer'
import { numberIndex } from './detect'
import { rowLabels, rowSums } from './rows'
import { pieceOf } from './launch'
import { datasetOf } from './review'

// A sample final answer: most numbers are in the sample data, a total adds up its
// table, the costs per conversion are Claude's own, and one cost is wrong on purpose.
const ANSWER_EN = [
  'SAMPLE. In October, the Google Search campaigns:',
  '',
  '| Campaign | Cost | Conversions | Cost per conversion |',
  '|---|---|---|---|',
  '| SAMPLE \\| Search \\| Brand | R$ 3,120.40 | 141 | R$ 22.13 |',
  '| SAMPLE \\| Search \\| Generic | R$ 2,210.65 | 44 | R$ 50.24 |',
  '| Total | R$ 5,331.05 | 185 | R$ 28.82 |',
  '',
  'The PMax campaign cost R$ 4,410.75 and brought 118 conversions. The Meta remarketing campaign cost R$ 1,893.47 over 31 days.',
].join('\n')
const ANSWER_PT = [
  'EXEMPLO. Em outubro, as campanhas de Pesquisa do Google:',
  '',
  '| Campanha | Custo | Conversões | Custo por conversão |',
  '|---|---|---|---|',
  '| EXEMPLO \\| Pesquisa \\| Marca | R$ 3.120,40 | 141 | R$ 22,13 |',
  '| EXEMPLO \\| Pesquisa \\| Genérica | R$ 2.210,65 | 44 | R$ 50,24 |',
  '| Total | R$ 5.331,05 | 185 | R$ 28,82 |',
  '',
  'A PMax custou R$ 4.410,75 e trouxe 118 conversões. A campanha de remarketing da Meta custou R$ 1.893,47 em 31 dias.',
].join('\n')

const rand = (seed: number) => {
  let s = seed

  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296

    return s / 4294967296
  }
}

const day = (i: number) => `2026-10-${String(i + 1).padStart(2, '0')}`

export type Demo = { review: Review; calls: CallLog[]; sources: Map<number, string>; counter: number }

/** The sample review, in the panel's language: every name says SAMPLE (EXEMPLO), so it is never mistaken for a real account. */
export const buildDemo = (now: number, lang: Lang = 'en'): Demo => {
  const pt = lang === 'pt'
  const L = (en: string, ptText: string) => (pt ? ptText : en)
  const r = rand(7)
  const daily = [...Array(31).keys()].map(i => {
    const spend = Math.round((380 + r() * 220 + (i % 7 === 5 ? 90 : 0)) * 100) / 100
    const conv = Math.round(spend / (28 + r() * 14))

    return { date: day(i), spend, conv }
  })
  // One day the platform returned nothing: the chart leaves it blank.
  const gapDay = 17
  const campaigns = [
    { name: L('SAMPLE | Search | Brand', 'EXEMPLO | Pesquisa | Marca'), spend: 3120.4, conv: 141 },
    { name: L('SAMPLE | PMax | Catalog', 'EXEMPLO | PMax | Catálogo'), spend: 4410.75, conv: 118 },
    { name: L('SAMPLE | Meta | Prospecting', 'EXEMPLO | Meta | Novos clientes'), spend: 3890.2, conv: 96 },
    { name: L('SAMPLE | Meta | Remarketing', 'EXEMPLO | Meta | Remarketing'), spend: 1540.0, conv: 71 },
    { name: L('SAMPLE | Search | Generic', 'EXEMPLO | Pesquisa | Genérica'), spend: 2210.65, conv: 44 },
  ]
  const keywords = [
    [L('sample running shoes', 'exemplo tênis de corrida'), 1840, 96, 412.3, 18],
    [L('sample trail sneakers', 'exemplo tênis para trilha'), 1210, 51, 260.15, 9],
    [L('sample shoe store near me', 'exemplo loja de tênis perto de mim'), 980, 62, 198.4, 11],
    [L('sample kids sneakers', 'exemplo tênis infantil'), 655, 22, 140.0, 3],
  ] as const

  const sources = new Map<number, string>()
  sources.set(1, JSON.stringify({ data: [{ id: 'act_000000000001', name: L('SAMPLE Demo Store (Meta)', 'EXEMPLO Loja Demo (Meta)'), currency: 'BRL', timezone_name: 'America/Sao_Paulo' }] }))
  sources.set(
    2,
    JSON.stringify({
      data: daily.map((d, i) => (i === gapDay ? { date_start: d.date } : { date_start: d.date, spend: String(d.spend), conversions: String(d.conv) })),
    }),
  )
  sources.set(3, JSON.stringify({ results: campaigns.map(c => ({ campaign: { name: c.name }, metrics: { cost_micros: String(Math.round(c.spend * 1e6)), conversions: c.conv } })) }))
  sources.set(4, JSON.stringify({ results: [] }))
  sources.set(
    5,
    // The source for keywords; the demo table reports one value that is not in it.
    JSON.stringify({ results: keywords.map(k => ({ keyword: k[0], clicks: k[1], conversions: k[4], cost: k[3], impressions: k[2] * 40 })), nextPageToken: 'SAMPLE' }),
  )

  const at = (s: number) => now - (6 - s) * 41000
  const calls: CallLog[] = [
    {
      n: 1, id: 'demo-1', tool: 'mcp__meta__ads_get_ad_accounts', label: 'ads_get_ad_accounts', platform: 'Meta Ads', kind: 'read',
      params: [['fields', 'id,name,currency,timezone_name']], accounts: [], dates: [], fields: ['id', 'name', 'currency', 'timezone_name'],
      status: 'ok', rows: 1, rowsApprox: false, flags: [], currency: 'BRL', timezone: 'America/Sao_Paulo', startedAt: at(1), ms: 640, chars: 120,
      input: '{ "fields": "id,name,currency,timezone_name" }',
    },
    {
      n: 2, id: 'demo-2', tool: 'mcp__meta__ads_get_ad_entities', label: 'ads_get_ad_entities', platform: 'Meta Ads', kind: 'read',
      params: [['ad_account_id', 'act_000000000001'], ['level', 'account'], ['time_range', '{"since":"2026-10-01","until":"2026-10-31"}'], ['time_increment', '1']],
      accounts: ['act_000000000001'], level: 'account', dates: ['2026-10-01 → 2026-10-31'], fields: ['spend', 'conversions'],
      status: 'ok', rows: 31, rowsApprox: false, flags: [], startedAt: at(2), ms: 1830, chars: 2700,
      input: '{ "ad_account_id": "act_000000000001", "level": "account", "time_range": { "since": "2026-10-01", "until": "2026-10-31" }, "time_increment": 1, "fields": ["spend", "conversions"] }',
    },
    {
      n: 3, id: 'demo-3', tool: 'Bash', label: 'Bash: gaql.py', platform: 'Google Ads', kind: 'read',
      params: [['command', 'python3 gaql.py campaigns  # SELECT campaign.name, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN ...']],
      accounts: ['000-000-0001'], level: 'campaign', dates: ['2026-10-01 → 2026-10-31'], fields: ['campaign.name', 'metrics.cost_micros', 'metrics.conversions'],
      status: 'ok', rows: 5, rowsApprox: false, flags: [], startedAt: at(3), ms: 2410, chars: 820,
      input: '{ "command": "python3 gaql.py campaigns" }',
    },
    {
      n: 4, id: 'demo-4', tool: 'Bash', label: 'Bash: gaql.py', platform: 'Google Ads', kind: 'read',
      params: [['command', 'python3 gaql.py search_terms_last_week']],
      accounts: ['000-000-0001'], level: 'searchterm', dates: ['2026-10-25 → 2026-10-31'], fields: ['search_term_view.search_term', 'metrics.clicks'],
      status: 'empty', rows: 0, rowsApprox: false, flags: [], startedAt: at(4), ms: 1220, chars: 15,
      input: '{ "command": "python3 gaql.py search_terms_last_week" }',
    },
    {
      n: 5, id: 'demo-5', tool: 'Bash', label: 'Bash: gaql.py', platform: 'Google Ads', kind: 'read',
      params: [['command', 'python3 gaql.py keywords']],
      accounts: ['000-000-0001'], level: 'keyword', dates: ['2026-08-01 → 2026-10-31'], fields: ['ad_group_criterion.keyword.text', 'metrics.clicks', 'metrics.conversions', 'metrics.cost_micros'],
      status: 'ok', rows: 4, rowsApprox: false, flags: ['paging'], startedAt: at(5), ms: 1990, chars: 610,
      input: '{ "command": "python3 gaql.py keywords" }',
    },
  ]

  const src = (n: number) => sources.get(n)
  const datasets = [
    datasetOf(
      {
        id: 'daily',
        title: L('Meta: spend and conversions by day', 'Meta: investimento e conversões por dia'),
        chart: 'line',
        columns: ['date', 'spend', 'conversions'],
        x: 'date',
        series: ['spend', 'conversions'],
        unit: 'currency',
        currency: 'BRL',
        rows: daily.map((d, i) => (i === gapDay ? [d.date, null, null] : [d.date, d.spend, d.conv])),
        source_calls: [2],
        note: L('One day came back with no metrics; it is left blank, not filled in.', 'Um dia voltou sem números: ficou em branco, sem preencher.'),
      },
      src,
    ),
    datasetOf(
      {
        id: 'by-campaign',
        title: L('Spend and CPA by campaign', 'Investimento e custo por conversão, por campanha'),
        chart: 'bar',
        columns: ['campaign', 'spend', 'conversions', 'cpa'],
        x: 'campaign',
        series: ['spend', 'cpa'],
        unit: 'currency',
        currency: 'BRL',
        rows: campaigns.map(c => [c.name, c.spend, c.conv, Math.round((c.spend / c.conv) * 100) / 100]),
        source_calls: [3],
        calculated_columns: ['cpa'],
      },
      src,
    ),
    datasetOf(
      {
        id: 'keywords',
        title: L('Top keywords', 'Principais palavras-chave'),
        chart: 'table',
        columns: ['keyword', 'clicks', 'conversions', 'cost'],
        x: 'keyword',
        unit: 'currency',
        currency: 'BRL',
        // 412.3 is reported as 421.3 on purpose, to show a value the check cannot find.
        rows: keywords.map((k, i) => [k[0], k[1], k[4], i === 0 ? 421.3 : k[3]]),
        source_calls: [5],
      },
      src,
    ),
  ].filter(d => d !== undefined)

  const review: Review = {
    id: `demo${now}`,
    title: L('SAMPLE: October review, Demo Store', 'EXEMPLO: revisão de outubro, Loja Demo'),
    status: 'running',
    isAuto: false,
    isDemo: true,
    startedAt: at(0),
    updatedAt: now,
    firstCall: 1,
    accounts: [
      { platform: 'Meta Ads', id: 'act_000000000001', name: L('SAMPLE Demo Store (Meta)', 'EXEMPLO Loja Demo (Meta)'), currency: 'BRL', timezone: 'America/Sao_Paulo', origin: 'reported', calls: [1, 2] },
      { platform: 'Google Ads', id: '000-000-0001', name: L('SAMPLE Demo Store (Google)', 'EXEMPLO Loja Demo (Google)'), currency: 'BRL', timezone: 'America/Sao_Paulo', origin: 'reported', calls: [3, 4, 5] },
      { platform: 'Google Ads', id: '000-000-0002', origin: 'auto', calls: [3] },
    ],
    steps: [
      { id: 'accounts', label: L('Identify accounts and settings', 'Encontrar as contas e as configurações'), status: 'done' },
      { id: 'meta-daily', label: L('Meta: daily performance', 'Meta: resultado de cada dia'), status: 'done' },
      { id: 'google-campaigns', label: L('Google: campaigns', 'Google: campanhas'), status: 'done' },
      { id: 'google-keywords', label: L('Google: keywords and search terms', 'Google: palavras-chave e termos pesquisados'), status: 'analyzing', note: L('search terms came back empty', 'os termos pesquisados voltaram vazios') },
      { id: 'findings', label: L('Write findings', 'Escrever as conclusões'), status: 'queued' },
    ],
    level: 'keyword',
    levelOrigin: 'reported',
    levelsSeen: ['account', 'campaign', 'searchterm', 'keyword'],
    periods: [{ label: L('October 2026', 'Outubro de 2026'), start: '2026-10-01', end: '2026-10-31', compareStart: '2026-09-01', compareEnd: '2026-09-30', timezone: 'America/Sao_Paulo' }],
    attribution: L('Meta: 7-day click, 1-day view · Google: data-driven', 'Meta: até 7 dias depois do clique ou 1 dia depois de ver o anúncio · Google: crédito dividido entre os cliques do caminho'),
    currency: 'BRL',
    datasets,
    assumptions: pt
      ? ['Conversões = a ação de conversão principal de cada conta (exemplo).', 'Meta e Google aparecem lado a lado, nunca somados (exemplo).']
      : ['Conversions = the primary conversion action of each account (sample).', 'Meta and Google are shown side by side, never summed (sample).'],
    warnings: [L('SAMPLE: Google conversions can still change for up to 30 days after the click.', 'EXEMPLO: as conversões do Google ainda podem mudar por até 30 dias depois do clique.')],
    reports: 4,
  }

  review.answer = checkAnswer(
    pt ? ANSWER_PT : ANSWER_EN,
    numberIndex([...sources.values()].join('\n')),
    [],
    now,
    lang,
    [...sources.values()].flatMap(rowSums).sort((a, b) => a - b),
    new Map([...sources.values()].flatMap(v => [...rowLabels(v)])),
  )

  return { review, calls, sources, counter: 5 }
}

/**
 * The sample launch, for /media-review demo launch: a campaign, an ad set, a
 * creative and an ad built and paused, then a go-live that waits for your OK.
 * Every name says SAMPLE (EXEMPLO), and the account is all zeros.
 */
export const buildLaunchDemo = (now: number, lang: Lang = 'en'): Demo => {
  const pt = lang === 'pt'
  const L = (en: string, ptText: string) => (pt ? ptText : en)
  const acct = '000000000001'
  const ctx = { lang, currency: 'BRL', accounts: [acct] }
  const at = (s: number) => now - (6 - s) * 35000
  const steps: { tool: string; input: Record<string, unknown>; id?: string; result?: string; state: LaunchPiece['state'] }[] = [
    {
      tool: 'mcp__meta__ads_create_campaign',
      input: { ad_account_id: acct, campaign_name: L('SAMPLE | Leads | Demo Store', 'EXEMPLO | Cadastros | Loja Demo'), objective: 'OUTCOME_LEADS', buying_type: 'AUCTION', campaign_daily_budget: 5000, campaign_stop_time: '2026-12-15T23:59:00-0300' },
      id: '120000000000001',
      result: 'PAUSED',
      state: 'ok',
    },
    {
      tool: 'mcp__meta__ads_create_ad_set',
      input: {
        ad_account_id: acct,
        campaign_id: '120000000000001',
        ad_set_name: L('SAMPLE | Recife | 25-45', 'EXEMPLO | Recife | 25-45'),
        optimization_goal: 'LEAD_GENERATION',
        billing_event: 'IMPRESSIONS',
        targeting: JSON.stringify({ geo_locations: { countries: ['BR'], cities: [{ key: '0', name: 'Recife', radius: 15, distance_unit: 'kilometer' }] }, age_range: [25, 45] }),
      },
      id: '120000000000002',
      result: 'PAUSED',
      state: 'ok',
    },
    {
      tool: 'mcp__meta__ads_create_creative',
      input: {
        ad_account_id: acct,
        page_id: '0',
        name: L('SAMPLE | Sign-up | image', 'EXEMPLO | Cadastro | imagem'),
        link_url: 'https://example.com/cadastro',
        image_hash: 'sample',
        call_to_action_type: 'SIGN_UP',
        message: L('SAMPLE. Sign up and get 10% off your first order.', 'EXEMPLO. Faça o cadastro e ganhe 10% na primeira compra.'),
      },
      id: '120000000000003',
      state: 'ok',
    },
    {
      tool: 'mcp__meta__ads_create_ad',
      input: { ad_account_id: acct, ad_set_id: '120000000000002', ad_name: L('SAMPLE | Sign-up | image', 'EXEMPLO | Cadastro | imagem'), creative: '{"creative_id":"120000000000003"}' },
      id: '120000000000004',
      result: 'PAUSED',
      state: 'ok',
    },
    {
      tool: 'mcp__meta__ads_activate_entity',
      input: { ad_account_id: acct, entity_id: '120000000000001', entity_type: 'campaign' },
      state: 'waiting',
    },
  ]
  const launch: LaunchPiece[] = steps.map((s, i) => ({
    ...pieceOf(s.tool, s.input, ctx),
    n: i + 1,
    at: at(i + 1),
    platform: 'Meta Ads',
    state: s.state,
    id: s.id,
    result: s.result,
  }))
  const calls: CallLog[] = steps.map((s, i) => ({
    n: i + 1,
    id: `demo-launch-${i + 1}`,
    tool: s.tool,
    label: s.tool.split('__').pop() ?? s.tool,
    platform: 'Meta Ads',
    kind: 'write',
    params: Object.entries(s.input).slice(0, 6).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)] as [string, string]),
    accounts: [`act_${acct}`],
    dates: [],
    fields: [],
    status: s.state === 'waiting' ? 'running' : 'ok',
    rows: s.state === 'waiting' ? undefined : 1,
    flags: [],
    startedAt: at(i + 1),
    ms: s.state === 'waiting' ? undefined : 900,
    input: JSON.stringify(s.input, null, 2).slice(0, 4000),
  }))
  const review: Review = {
    id: `demo-launch${now}`,
    title: L('SAMPLE: launching the sign-up campaign, Demo Store', 'EXEMPLO: subida da campanha de cadastros, Loja Demo'),
    status: 'running',
    isAuto: false,
    isDemo: true,
    startedAt: at(0),
    updatedAt: now,
    firstCall: 1,
    accounts: [{ platform: 'Meta Ads', id: `act_${acct}`, name: L('SAMPLE Demo Store (Meta)', 'EXEMPLO Loja Demo (Meta)'), currency: 'BRL', timezone: 'America/Sao_Paulo', origin: 'reported', calls: [1, 2, 3, 4, 5] }],
    steps: [],
    levelsSeen: [],
    periods: [],
    datasets: [],
    assumptions: [],
    warnings: [],
    reports: 0,
    currency: 'BRL',
    launch,
  }

  return { review, calls, sources: new Map(), counter: steps.length }
}
