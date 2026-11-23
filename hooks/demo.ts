// SAMPLE DATA for /media-review demo. Every account, name and number here is
// made up, and the panel labels the review as sample data wherever it shows.

import type { CallLog, Review } from '../types'
import { datasetOf } from './review'

const rand = (seed: number) => {
  let s = seed

  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296

    return s / 4294967296
  }
}

const day = (i: number) => `2026-10-${String(i + 1).padStart(2, '0')}`

export type Demo = { review: Review; calls: CallLog[]; sources: Map<number, string>; counter: number }

export const buildDemo = (now: number): Demo => {
  const r = rand(7)
  const daily = [...Array(31).keys()].map(i => {
    const spend = Math.round((380 + r() * 220 + (i % 7 === 5 ? 90 : 0)) * 100) / 100
    const conv = Math.round(spend / (28 + r() * 14))

    return { date: day(i), spend, conv }
  })
  // One day the platform returned nothing: the chart leaves it blank.
  const gapDay = 17
  const campaigns = [
    { name: 'SAMPLE | Search | Brand', spend: 3120.4, conv: 141 },
    { name: 'SAMPLE | PMax | Catalog', spend: 4410.75, conv: 118 },
    { name: 'SAMPLE | Meta | Prospecting', spend: 3890.2, conv: 96 },
    { name: 'SAMPLE | Meta | Remarketing', spend: 1540.0, conv: 71 },
    { name: 'SAMPLE | Search | Generic', spend: 2210.65, conv: 44 },
  ]
  const keywords = [
    ['sample running shoes', 1840, 96, 412.3, 18],
    ['sample trail sneakers', 1210, 51, 260.15, 9],
    ['sample shoe store near me', 980, 62, 198.4, 11],
    ['sample kids sneakers', 655, 22, 140.0, 3],
  ] as const

  const sources = new Map<number, string>()
  sources.set(1, JSON.stringify({ data: [{ id: 'act_000000000001', name: 'SAMPLE Demo Store (Meta)', currency: 'BRL', timezone_name: 'America/Sao_Paulo' }] }))
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
      accounts: ['000-000-0001'], level: 'keyword', dates: ['2026-09-01 → 2026-10-31'], fields: ['ad_group_criterion.keyword.text', 'metrics.clicks', 'metrics.conversions', 'metrics.cost_micros'],
      status: 'ok', rows: 4, rowsApprox: false, flags: ['paging'], startedAt: at(5), ms: 1990, chars: 610,
      input: '{ "command": "python3 gaql.py keywords" }',
    },
  ]

  const src = (n: number) => sources.get(n)
  const datasets = [
    datasetOf(
      {
        id: 'daily',
        title: 'Meta: spend and conversions by day',
        chart: 'line',
        columns: ['date', 'spend', 'conversions'],
        x: 'date',
        series: ['spend', 'conversions'],
        unit: 'currency',
        currency: 'BRL',
        rows: daily.map((d, i) => (i === gapDay ? [d.date, null, null] : [d.date, d.spend, d.conv])),
        source_calls: [2],
        note: 'One day came back with no metrics; it is left blank, not filled in.',
      },
      src,
    ),
    datasetOf(
      {
        id: 'by-campaign',
        title: 'Spend and CPA by campaign',
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
        title: 'Top keywords',
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
    title: 'SAMPLE: October review, Demo Store',
    status: 'running',
    isAuto: false,
    isDemo: true,
    startedAt: at(0),
    updatedAt: now,
    firstCall: 1,
    accounts: [
      { platform: 'Meta Ads', id: 'act_000000000001', name: 'SAMPLE Demo Store (Meta)', currency: 'BRL', timezone: 'America/Sao_Paulo', origin: 'reported', calls: [1, 2] },
      { platform: 'Google Ads', id: '000-000-0001', name: 'SAMPLE Demo Store (Google)', currency: 'BRL', timezone: 'America/Sao_Paulo', origin: 'reported', calls: [3, 4, 5] },
      { platform: 'Google Ads', id: '000-000-0002', origin: 'auto', calls: [3] },
    ],
    steps: [
      { id: 'accounts', label: 'Identify accounts and settings', status: 'done' },
      { id: 'meta-daily', label: 'Meta: daily performance', status: 'done' },
      { id: 'google-campaigns', label: 'Google: campaigns', status: 'done' },
      { id: 'google-keywords', label: 'Google: keywords and search terms', status: 'analyzing', note: 'search terms came back empty' },
      { id: 'findings', label: 'Write findings', status: 'queued' },
    ],
    level: 'keyword',
    levelOrigin: 'reported',
    levelsSeen: ['account', 'campaign', 'searchterm', 'keyword'],
    periods: [{ label: 'October 2026', start: '2026-10-01', end: '2026-10-31', compareStart: '2026-09-01', compareEnd: '2026-09-30', timezone: 'America/Sao_Paulo' }],
    attribution: 'Meta: 7-day click, 1-day view · Google: data-driven',
    currency: 'BRL',
    datasets,
    assumptions: ['Conversions = the primary conversion action of each account (sample).', 'Meta and Google are shown side by side, never summed (sample).'],
    warnings: ['SAMPLE: Google conversions can still change for up to 30 days after the click.'],
    reports: 4,
  }

  return { review, calls, sources, counter: 5 }
}
