// The Simple view's reading of a table: what a person would work out by hand.
// A table over days becomes the period's totals, one chart per day and a line
// per campaign; a long list becomes its top items and one line for the rest.
// Pure functions over the dataset Claude sent, so the tests can check each sum.

import type { Cell, Dataset } from '../types'
import { toNumber } from './detect'

/** What a column measures. Only the additive ones are summed; a rate never is. */
export type Role = 'cost' | 'clicks' | 'impressions' | 'conversions' | 'revenue' | 'rate' | 'other'

/** A total of the period, or a rate worked out from two totals. */
export type Metric = 'cost' | 'clicks' | 'impressions' | 'conversions' | 'revenue' | 'cpa' | 'cpc' | 'roas'

export type Total = { metric: Metric; value: number }

export type Group = { label: string; totals: Total[] }

export type Day = { date: string; value: number; marks: number }

export type SeriesDigest = {
  kind: 'series'
  from: string
  to: string
  totals: Total[]
  /** The column charted day by day, and what it measures. */
  chartColumn: string
  chartMetric: Metric
  days: Day[]
  /** The column the groups come from (campaign), and one line per value. */
  groupColumn?: string
  groups: Group[]
  /** The column behind each summed metric, to name it as Claude did. */
  names: Partial<Record<Metric, string>>
}

export type RankRow = { label: string; group?: string; value: number; cost?: number }

export type RankingDigest = {
  kind: 'ranking'
  metric: Metric
  groupColumn?: string
  top: RankRow[]
  rest?: { count: number; value: number; cost?: number; each?: number }
  names: Partial<Record<Metric, string>>
}

export type Digest = SeriesDigest | RankingDigest

const ISO = /^\d{4}-\d{2}-\d{2}$/
const RATE =
  /cpa|cpc|cpm|ctr|roas|frequ|cost_?per|custo_?por|(^|_)(por|per)_|taxa|rate|m[eé]di[ao]|average|avg|%|share|parcela|percent/

export const roleOf = (col: string): Role => {
  const c = col.trim().toLowerCase().replace(/\s+/g, '_')

  if (RATE.test(c)) return 'rate'
  if (/revenue|receita|conversion_?value|valor_?(d[aeo]_)?conv|faturamento/.test(c)) return 'revenue'
  if (/spend|cost|custo|investimento|investido|gasto|amount/.test(c)) return 'cost'
  if (/impress/.test(c)) return 'impressions'
  if (/click|clique/.test(c)) return 'clicks'
  if (/convers|leads?$|^leads?|inscri|resultado|purchase|compra|venda|cadastro|registration/.test(c)) return 'conversions'

  return 'other'
}

const ADDITIVE: Role[] = ['cost', 'clicks', 'impressions', 'conversions', 'revenue']

type Kind = 'date' | 'number' | 'text'

const kindOf = (rows: Cell[][], i: number): Kind => {
  const vals = rows.map(r => r[i]).filter((v): v is string | number => v !== null && v !== undefined && v !== '')

  if (vals.length === 0) return 'text'
  if (vals.every(v => typeof v === 'string' && ISO.test(v.trim()))) return 'date'
  if (vals.every(v => toNumber(v) !== undefined)) return 'number'

  return 'text'
}

/** The first column of each additive role: the one Claude listed first wins. */
const additiveColumns = (ds: Pick<Dataset, 'columns'>, kinds: Kind[]): Map<Role, number> => {
  const out = new Map<Role, number>()

  ds.columns.forEach((col, i) => {
    const role = roleOf(col)

    if (kinds[i] === 'number' && ADDITIVE.includes(role) && !out.has(role)) out.set(role, i)
  })

  return out
}

const namesOf = (ds: Pick<Dataset, 'columns'>, cols: Map<Role, number>): Partial<Record<Metric, string>> =>
  Object.fromEntries([...cols].map(([role, i]) => [role, ds.columns[i] ?? role]))

const sumOf = (rows: Cell[][], i: number | undefined): number | undefined =>
  i === undefined ? undefined : rows.reduce((a, r) => a + (toNumber(r[i]) ?? 0), 0)

// The cards, in the order a person reads them: what it cost, what it brought, what each one cost.
const ORDER: Metric[] = ['cost', 'clicks', 'conversions', 'cpa', 'revenue', 'roas', 'impressions', 'cpc']

/** Totals of some rows, with each rate worked out from the totals, never as an average of rates. */
export const totalsOf = (rows: Cell[][], cols: Map<Role, number>, max = 4): Total[] => {
  const s = (r: Role) => sumOf(rows, cols.get(r))
  const cost = s('cost')
  const clicks = s('clicks')
  const conv = s('conversions')
  const revenue = s('revenue')
  const all: Partial<Record<Metric, number>> = {
    cost,
    clicks,
    impressions: s('impressions'),
    conversions: conv,
    revenue,
    cpa: cost !== undefined && conv !== undefined && conv > 0 ? cost / conv : undefined,
    roas: cost !== undefined && revenue !== undefined && cost > 0 ? revenue / cost : undefined,
    cpc: cost !== undefined && clicks !== undefined && clicks > 0 ? cost / clicks : undefined,
  }
  // Cost per click only when nothing better says what each result cost.
  const picks = ORDER.filter(m => all[m] !== undefined && !(m === 'cpc' && all.cpa !== undefined))

  return picks.slice(0, max).map(metric => ({ metric, value: all[metric] as number }))
}

const MIN_DAYS = 3
const MIN_LIST = 8
const MAX_GROUPS = 8
const TOP = 5

/** How the Simple view should read a table, or undefined to show it as it is. */
export const digestOf = (ds: Pick<Dataset, 'columns' | 'rows' | 'x' | 'chart'>): Digest | undefined => {
  if (ds.chart !== 'table' || ds.rows.length === 0) return undefined

  const kinds = ds.columns.map((_, i) => kindOf(ds.rows, i))
  const cols = additiveColumns(ds, kinds)

  if (cols.size === 0) return undefined

  const dateAt = kinds.indexOf('date')
  const texts = kinds.map((k, i) => (k === 'text' ? i : -1)).filter(i => i >= 0)

  if (dateAt >= 0) {
    const dates = [...new Set(ds.rows.map(r => String(r[dateAt] ?? '').trim()).filter(d => ISO.test(d)))].sort()

    if (dates.length < MIN_DAYS) return undefined

    const chartRole: Role = cols.has('cost') ? 'cost' : (([...cols.keys()][0] ?? 'cost') as Role)
    const chartAt = cols.get(chartRole) as number
    const markAt = cols.get('conversions')
    const days = dates.map(date => {
      const rows = ds.rows.filter(r => String(r[dateAt] ?? '').trim() === date)

      return { date, value: sumOf(rows, chartAt) ?? 0, marks: markAt === undefined ? 0 : (sumOf(rows, markAt) ?? 0) }
    })
    const groupAt = texts.find(i => {
      const n = new Set(ds.rows.map(r => String(r[i] ?? ''))).size

      return n >= 2 && n <= MAX_GROUPS
    })
    const groups =
      groupAt === undefined
        ? []
        : [...new Set(ds.rows.map(r => String(r[groupAt] ?? '')))]
            .map(label => ({ label, totals: totalsOf(ds.rows.filter(r => String(r[groupAt] ?? '') === label), cols, 8) }))
            .sort((a, b) => (b.totals.find(t => t.metric === 'cost')?.value ?? 0) - (a.totals.find(t => t.metric === 'cost')?.value ?? 0))

    return {
      kind: 'series',
      from: dates[0] ?? '',
      to: dates[dates.length - 1] ?? '',
      totals: totalsOf(ds.rows, cols),
      chartColumn: ds.columns[chartAt] ?? '',
      chartMetric: chartRole as Metric,
      days,
      groupColumn: groupAt === undefined ? undefined : ds.columns[groupAt],
      groups,
      names: namesOf(ds, cols),
    }
  }

  if (ds.rows.length < MIN_LIST || texts.length === 0) return undefined

  const labelAt = ds.x !== undefined && texts.includes(ds.columns.indexOf(ds.x)) ? ds.columns.indexOf(ds.x) : (texts[0] as number)
  const groupAt = texts.find(i => i !== labelAt)
  const metricRole = (['clicks', 'conversions', 'cost', 'impressions', 'revenue'] as Role[]).find(r => cols.has(r)) as Role
  const metricAt = cols.get(metricRole) as number
  const costAt = metricRole === 'cost' ? undefined : cols.get('cost')
  const rows: RankRow[] = ds.rows
    .map(r => ({
      label: String(r[labelAt] ?? ''),
      group: groupAt === undefined ? undefined : String(r[groupAt] ?? ''),
      value: toNumber(r[metricAt]) ?? 0,
      cost: costAt === undefined ? undefined : (toNumber(r[costAt]) ?? 0),
    }))
    .sort((a, b) => b.value - a.value || (b.cost ?? 0) - (a.cost ?? 0))
  const rest = rows.slice(TOP)
  const firstRest = rest[0]?.value

  return {
    kind: 'ranking',
    metric: metricRole as Metric,
    groupColumn: groupAt === undefined ? undefined : ds.columns[groupAt],
    top: rows.slice(0, TOP),
    rest:
      rest.length === 0
        ? undefined
        : {
            count: rest.length,
            value: rest.reduce((a, r) => a + r.value, 0),
            cost: costAt === undefined ? undefined : rest.reduce((a, r) => a + (r.cost ?? 0), 0),
            each: rest.every(r => r.value === firstRest) ? firstRest : undefined,
          },
    names: namesOf(ds, cols),
  }
}

/** Money or a count, as the cards show it. */
export const unitOf = (m: Metric): 'currency' | 'count' | 'ratio' =>
  m === 'cost' || m === 'revenue' || m === 'cpa' || m === 'cpc' ? 'currency' : m === 'roas' ? 'ratio' : 'count'
