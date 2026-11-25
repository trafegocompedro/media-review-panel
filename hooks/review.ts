import type {
  Account,
  CallLog,
  Cell,
  CheckResult,
  Dataset,
  Lang,
  Period,
  Review,
  Step,
  StepStatus,
  SumSpec,
} from '../types'
import { checkSum, isInSource, numberIndex, toNumber } from './detect'
import { normalizeLevel, strings } from './i18n'

export const MAX_ROWS = 400
const MAX_DATASETS = 16
const MAX_COLUMNS = 12

export const newReview = (now: number, firstCall: number, isAuto: boolean, title?: string): Review => ({
  id: `r${now}`,
  title,
  status: 'running',
  isAuto,
  isDemo: false,
  startedAt: now,
  updatedAt: now,
  firstCall,
  accounts: [],
  steps: [],
  levelsSeen: [],
  periods: [],
  datasets: [],
  assumptions: [],
  warnings: [],
  reports: 0,
})

/** One key per account, whatever the spelling: act_123 and 123, 123-456-7890 and 1234567890. */
export const accountKey = (id: string): string => id.replace(/^act_/i, '').replace(/\D/g, '') || id.toLowerCase()

export const mergeAccount = (list: Account[], one: Account): Account[] => {
  const key = accountKey(one.id)
  const at = list.findIndex(a => accountKey(a.id) === key)

  if (at < 0) return [...list, one]

  const old = list[at] as Account
  const merged: Account = {
    platform: one.origin === 'reported' || old.platform === 'Ads' ? one.platform : old.platform,
    id: one.origin === 'reported' ? one.id : old.id,
    name: one.name ?? old.name,
    currency: one.currency ?? old.currency,
    timezone: one.timezone ?? old.timezone,
    origin: old.origin === 'reported' || one.origin === 'reported' ? 'reported' : 'auto',
    calls: [...new Set([...old.calls, ...one.calls])].slice(-30),
  }

  return list.map((a, i) => (i === at ? merged : a))
}

// What the model sends: snake_case, and anything may be missing or off.
type In = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const STATUSES: StepStatus[] = ['queued', 'fetching', 'analyzing', 'done', 'error']

const stepOf = (v: unknown, old?: Step): Step | undefined => {
  const o = (v ?? {}) as In
  const id = str(o.id) ?? str(o.label)

  if (!id) return undefined

  const status = STATUSES.includes(o.status as StepStatus) ? (o.status as StepStatus) : (old?.status ?? 'queued')

  return { id, label: str(o.label) ?? old?.label ?? id, status, note: str(o.note) ?? (o.note === '' ? undefined : old?.note) }
}

const periodOf = (v: unknown): Period | undefined => {
  const o = (v ?? {}) as In
  const start = str(o.start)
  const end = str(o.end)

  if (!start || !end) return undefined

  return {
    label: str(o.label),
    start,
    end,
    compareStart: str(o.compare_start),
    compareEnd: str(o.compare_end),
    timezone: str(o.timezone),
  }
}

const cellOf = (v: unknown): Cell =>
  typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' ? v : null

const MAX_SUMS = 200
const MAX_PARTS = 1000

const round = (n: number): string => String(Math.round(n * 100) / 100)

/** Checks a dataset's numbers against the raw text of the calls it cites. */
export const checkDataset = (ds: Omit<Dataset, 'check'>, sourceText: (n: number) => string | undefined): CheckResult => {
  const xCol = ds.x ?? ds.columns[0]
  const texts = ds.sourceCalls.map(sourceText)
  const known = texts.filter((t): t is string => t !== undefined)
  // Some cited answers are not in memory: a number not found may be in one of them.
  const isPartial = known.length > 0 && known.length < texts.length
  const index = known.length > 0 ? numberIndex(known.join('\n')) : []
  const sums = new Map((ds.sums ?? []).map(s => [`${s.row}:${ds.columns.indexOf(s.column)}`, s.parts]))
  const result: CheckResult = { found: 0, missing: 0, calculated: 0, unchecked: 0, summed: 0, missingSamples: [], missingCells: [] }

  if (ds.sourceCalls.length === 0) result.note = 'none-cited'
  else if (known.length === 0) result.note = 'not-in-memory'
  else if (isPartial) result.note = 'partly-in-memory'

  ds.rows.forEach((row, r) => {
    ds.columns.forEach((col, c) => {
      if (col === xCol) return

      const v = toNumber(row[c])

      if (v === undefined) return
      if (ds.calculated.includes(col)) {
        result.calculated += 1

        return
      }
      if (known.length === 0) {
        result.unchecked += 1

        return
      }
      if (isInSource(index, v)) {
        result.found += 1

        return
      }

      const parts = sums.get(`${r}:${c}`)
      const sum = parts ? checkSum(index, v, parts) : undefined

      if (sum?.ok) {
        result.found += 1
        result.summed = (result.summed ?? 0) + 1

        return
      }
      if (isPartial) {
        result.unchecked += 1

        return
      }

      const why = !parts || !sum
        ? ''
        : sum.absent > 0
          ? `: ${sum.absent} of ${parts.length} parts not in the sources`
          : `: the parts add up to ${round(sum.total)}`

      result.missing += 1
      if (result.missingCells.length < 200) result.missingCells.push(`${r}:${c}`)
      if (result.missingSamples.length < 6) result.missingSamples.push(`${col} = ${String(row[c])} (row ${r + 1})${why}`)
    })
  })

  return result
}

/** The sums a report gives: a row by index or by its label, a known column, the parts as numbers. */
const sumsOf = (v: unknown, columns: string[], rows: Cell[][], xCol: string | undefined): SumSpec[] => {
  const xi = Math.max(0, columns.indexOf(xCol ?? columns[0] ?? ''))
  const out: SumSpec[] = []

  for (const s of arr(v).slice(0, MAX_SUMS)) {
    const o = (s ?? {}) as In
    const column = str(o.column)
    const row =
      typeof o.row === 'number' && Number.isInteger(o.row) && o.row >= 0 && o.row < rows.length
        ? o.row
        : typeof o.row === 'string'
          ? rows.findIndex(r => String(r[xi] ?? '') === o.row)
          : -1
    const parts = arr(o.parts)
      .slice(0, MAX_PARTS)
      .map(toNumber)
      .filter((p): p is number => p !== undefined)

    if (column && columns.includes(column) && row >= 0 && parts.length > 0) out.push({ row, column, parts })
  }

  return out
}

export const datasetOf = (v: unknown, sourceText: (n: number) => string | undefined): Dataset | undefined => {
  const o = (v ?? {}) as In
  const id = str(o.id) ?? str(o.title)
  const columns = arr(o.columns).map(c => String(c)).slice(0, MAX_COLUMNS)

  if (!id || columns.length === 0) return undefined

  const allRows = arr(o.rows).filter(Array.isArray) as unknown[][]
  const rows = allRows.slice(0, MAX_ROWS).map(row => columns.map((_, i) => cellOf(row[i])))
  const chart = o.chart === 'line' || o.chart === 'bar' || o.chart === 'table' ? o.chart : 'table'
  const base = {
    id,
    title: str(o.title) ?? id,
    chart,
    columns,
    rows,
    x: str(o.x),
    series: arr(o.series).map(s => String(s)).filter(s => columns.includes(s)),
    unit: str(o.unit),
    currency: str(o.currency),
    sourceCalls: arr(o.source_calls)
      .map(n => Number(n))
      .filter(n => Number.isInteger(n) && n > 0),
    calculated: arr(o.calculated_columns).map(s => String(s)),
    sums: sumsOf(o.sums, columns, rows, str(o.x)),
    note: str(o.note),
    totalRows: allRows.length,
  } satisfies Omit<Dataset, 'check'>

  return { ...base, check: checkDataset(base, sourceText) }
}

export type Applied = { review: Review; notes: string[]; stepMoves: StepStatus[] }

/** Folds one report from the model into the review. */
export const applyReport = (
  review: Review,
  input: In,
  now: number,
  sourceText: (n: number) => string | undefined,
): Applied => {
  const notes: string[] = []
  const stepMoves: StepStatus[] = []
  const r: Review = { ...review, updatedAt: now, reports: review.reports + 1 }

  const title = str(input.title)

  if (title) r.title = title

  for (const a of arr(input.accounts)) {
    const o = (a ?? {}) as In
    const id = str(o.id) ?? (typeof o.id === 'number' ? String(o.id) : undefined)

    if (!id) continue
    r.accounts = mergeAccount(r.accounts, {
      platform: str(o.platform) ?? 'Ads',
      id,
      name: str(o.name),
      currency: str(o.currency),
      timezone: str(o.timezone),
      origin: 'reported',
      calls: [],
    })
  }

  for (const s of arr(input.steps)) {
    const id = str((s as In)?.id) ?? str((s as In)?.label)
    const old = r.steps.find(x => x.id === id)
    const step = stepOf(s, old)

    if (!step) continue
    if (step.status !== old?.status) stepMoves.push(step.status)
    r.steps = old ? r.steps.map(x => (x.id === step.id ? step : x)) : [...r.steps, step]
  }

  const level = str(input.level)

  if (level) {
    r.level = normalizeLevel(level)
    r.levelOrigin = 'reported'
    if (!r.levelsSeen.includes(r.level)) r.levelsSeen = [...r.levelsSeen, r.level]
  }

  const periods = arr(input.periods).map(periodOf).filter((p): p is Period => p !== undefined)

  if (periods.length > 0) r.periods = periods

  const attribution = str(input.attribution)

  if (attribution) r.attribution = attribution

  const currency = str(input.currency)

  if (currency) r.currency = currency

  for (const d of arr(input.datasets)) {
    const ds = datasetOf(d, sourceText)

    if (!ds) {
      notes.push('A dataset was skipped: it needs an id (or title) and columns.')
      continue
    }

    const others = r.datasets.filter(x => x.id !== ds.id)
    const at = r.datasets.findIndex(x => x.id === ds.id)
    r.datasets = at < 0 ? [...others, ds].slice(-MAX_DATASETS) : r.datasets.map(x => (x.id === ds.id ? ds : x))

    const c = ds.check
    const head = `Dataset "${ds.title}": ${c.found} found, ${c.missing} not found, ${c.calculated} calculated, ${c.unchecked} unchecked.`
    const sent = arr((d as In)?.sums).length

    notes.push(c.summed ? `${head} ${c.summed} of the found were confirmed by adding up their parts.` : head)
    if (sent > (ds.sums?.length ?? 0)) notes.push(`  ${sent - (ds.sums?.length ?? 0)} of the sums were skipped: each needs a row (index from 0 or the x value), a column of the dataset and parts as numbers.`)
    if (c.note === 'none-cited') notes.push('  It cites no source_calls, so nothing could be checked. Cite the call numbers the panel gave.')
    if (c.note === 'not-in-memory') notes.push('  The cited calls are no longer in memory (the panel reloaded), so nothing could be checked.')
    if (c.note === 'partly-in-memory') notes.push('  Some cited calls are not in memory, so a number not found there was left unchecked.')
    if (c.missing > 0) {
      notes.push(`  Not found in the cited responses: ${c.missingSamples.join('; ')}. Recheck these before you rely on them.`)
      notes.push('  A total you added up (campaigns, days) is written in no response: send it in sums with the parts you copied from the cited responses.')
    }
    if (ds.totalRows > MAX_ROWS) notes.push(`  Only the first ${MAX_ROWS} of ${ds.totalRows} rows are kept.`)
  }

  const addUnique = (list: string[], more: unknown): string[] => {
    const add = arr(more).map(str).filter((s): s is string => s !== undefined)

    return [...list, ...add.filter(s => !list.includes(s))].slice(-30)
  }

  r.assumptions = addUnique(r.assumptions, input.assumptions)
  r.warnings = addUnique(r.warnings, input.warnings)

  const status = input.status

  if (input.action === 'finish' || status === 'done') {
    r.status = 'done'
    r.finishedAt = now
  } else if (status === 'error') {
    r.status = 'error'
  } else {
    r.status = 'running'
  }

  return { review: r, notes, stepMoves }
}

const DATE_PAIR = /(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/

/** The periods of a review, the comparisons included, as [start, end] pairs. */
export const spansOf = (periods: Period[]): [string, string][] =>
  periods.flatMap((p): [string, string][] =>
    p.compareStart !== undefined && p.compareEnd !== undefined
      ? [
          [p.start, p.end],
          [p.compareStart, p.compareEnd],
        ]
      : [[p.start, p.end]],
  )

const nextDay = (iso: string): string | undefined => {
  const t = Date.parse(`${iso}T00:00:00Z`)

  return Number.isFinite(t) ? new Date(t + 86400000).toISOString().slice(0, 10) : undefined
}

/** Whether every day from a to b is in one of the spans (two periods side by side cover their union). */
export const isCovered = (a: string, b: string, spans: [string, string][]): boolean => {
  let at: string | undefined = a

  for (const [s, e] of [...spans].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (at === undefined) return false
    if (s <= at && e >= at) at = nextDay(e)
    if (at !== undefined && at > b) return true
  }

  return false
}

/** The warnings the panel finds by itself in the calls and datasets of a review. */
export const autoWarnings = (review: Review, calls: CallLog[], lang: Lang): string[] => {
  const t = strings(lang)
  const out: string[] = []

  for (const call of calls) {
    if (call.kind === 'write') out.push(t.w_write(call.n, call.label))
    if (call.status === 'error') out.push(t.w_error(call.n))
    if (call.status === 'empty') out.push(t.w_empty(call.n))
    if (call.flags.includes('paging')) out.push(t.w_paging(call.n))
    if (call.flags.includes('truncated')) out.push(t.w_truncated(call.n))
    if (call.flags.includes('saved-unread')) out.push(t.w_saved(call.n))
    if (call.flags.includes('sampled')) out.push(t.w_sampled(call.n))

    if (review.periods.length > 0) {
      for (const d of call.dates) {
        const m = DATE_PAIR.exec(d)

        if (!m) continue

        const [, a = '', b = ''] = m

        if (!isCovered(a, b, spansOf(review.periods))) out.push(t.w_dates(call.n, d))
      }
    }
  }

  for (const ds of review.datasets) {
    if (ds.check.missing > 0) out.push(t.w_missing(ds.title, ds.check.missing))
    if (ds.check.note === 'none-cited') out.push(t.w_unchecked(ds.title))
  }

  return out
}

export const daysBetween = (a: string, b: string): number | undefined => {
  const x = Date.parse(`${a}T00:00:00Z`)
  const y = Date.parse(`${b}T00:00:00Z`)

  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined

  return Math.round((y - x) / 86400000) + 1
}
