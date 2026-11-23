import type { CallKind } from '../types'
import { normalizeLevel } from './i18n'

export const OWN_TOOL = 'mcp__media-review-panel__report'

export type Detected = { platform: string; kind: CallKind; label: string }

const MCP_MEDIA =
  /(adspirer|supermetrics|google[-_]?ads|googleads|meta[-_]?ads|facebook[-_]?ads|fb[-_]?ads|tiktok|linkedin[-_]?ads|bing[-_]?ads|microsoft[-_]?ads|amazon[-_]?ads|windsor|funnel[-_]?io|pipeboard|adveronix)/i
// The official Meta Ads connector names every tool ads_*.
const META_TOOL = /^ads_/
const WRITE =
  /(^|_)(create|update|delete|duplicate|activate|pause|boost|upload|finalize|connect|disconnect|mutate|remove|add|set|apply|enable|disable|archive|send|launch|publish|edit|change|replace)(_|$)/i
const LOOKUP = /(help|guidance|field_context|schema|docs?|list_tools|search_tools|get_tool_schema|benchmark|library_search)/i
// A command that calls an ad platform's API, or runs a script named for one.
const API_HOST = /(graph\.facebook\.com|googleads\.googleapis\.com|business-api\.tiktok\.com|api\.linkedin\.com\/rest\/ad|adAnalytics)/i
const MEDIA_SCRIPT =
  /[\w./-]*(gaql|gads|google[-_]?ads|googleads|meta[-_]?ads|facebook[-_]?ads|fb[-_]?ads|tiktok[-_]?ads|linkedin[-_]?ads)[\w-]*\.(py|js|mjs|ts|sh|rb)\b/i
const DATA_FILE = /\.(json|jsonl|csv|tsv)$/i
// Something that runs code. A command with none of these only shows or edits
// files: a GAQL string in a script's source is not a query that ran.
const RUNNER =
  /^\s*(sudo\s+)?(\w+=\S*\s+)*(python3?|node|npx|bun|deno|bash|sh|zsh|ruby|curl|wget|http|uv\s+run|poetry\s+run|pipenv\s+run|\.{0,2}\/[\w./-]+)(\s|$)/

/** True when no part of the command runs code (cd, cat, grep, sed, git...). */
const isViewOnly = (command: string): boolean => !command.split(/&&|\|\||;|\||\n/).some(seg => RUNNER.test(seg))
// What a Google Ads or Meta Ads answer looks like, whatever script printed it.
const ADS_OUTPUT =
  /(cost_micros|costMicros|\bmetrics\.(impressions|clicks|cost|conversions|ctr)\b|"?\bcampaign\.(name|id|status)\b|\bad_group\.(name|id)\b|\bsegments\.date\b|customers\/\d{10}\b|\bact_\d{6,}\b|"(adset|campaign|ad)_name"\s*:)/i

/** Script names from the local setting: "a.py, b.py" → ["a.py", "b.py"]. */
export const parseScripts = (raw: unknown): string[] =>
  typeof raw === 'string'
    ? raw
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s !== '')
    : []

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const runsScript = (command: string, scripts: string[]): string | undefined =>
  scripts.find(name => new RegExp(`(^|[\\s/'"=])${escape(name)}($|[\\s'";|&)])`).test(command))

export const platformOf = (s: string): string => {
  if (/google|gaql|gads|searchstream|cost_?micros|segments\.|customers\/\d{10}/i.test(s)) return 'Google Ads'
  if (/meta|facebook|instagram|graph\.facebook|act_\d/i.test(s)) return 'Meta Ads'
  if (/tiktok/i.test(s)) return 'TikTok Ads'
  if (/linkedin/i.test(s)) return 'LinkedIn Ads'
  if (/bing|microsoft/i.test(s)) return 'Microsoft Ads'
  if (/amazon/i.test(s)) return 'Amazon Ads'

  return 'Ads'
}

/** Says whether a tool call reads paid media data, and how to label it. */
export const classify = (
  tool: string,
  input: Record<string, unknown>,
  isReviewActive: boolean,
  scripts: string[] = [],
): Detected | undefined => {
  if (tool === OWN_TOOL) return undefined

  if (tool.startsWith('mcp__')) {
    const [, server = '', ...rest] = tool.split('__')
    const name = rest.join('__')

    if (server === 'media-review-panel') return undefined

    const isMeta = META_TOOL.test(name)

    if (!isMeta && !MCP_MEDIA.test(server) && !MCP_MEDIA.test(name)) return undefined

    const hint = typeof input.platform === 'string' ? input.platform : ''
    const platform = isMeta && !MCP_MEDIA.test(server) ? 'Meta Ads' : platformOf(`${hint} ${server} ${name}`)
    const kind: CallKind = WRITE.test(name) ? 'write' : LOOKUP.test(name) ? 'lookup' : 'read'

    return { platform, kind, label: name }
  }

  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : ''
    const own = runsScript(command, scripts)

    if (own === undefined && (isViewOnly(command) || !(API_HOST.test(command) || MEDIA_SCRIPT.test(command)))) return undefined

    return bashDetected(command, own)
  }

  if (tool === 'Read' && isReviewActive) {
    const path = typeof input.file_path === 'string' ? input.file_path : ''

    if (!DATA_FILE.test(path)) return undefined

    return { platform: '—', kind: 'file', label: `Read: ${path.split('/').slice(-2).join('/')}` }
  }

  return undefined
}

const bashDetected = (command: string, script?: string): Detected => {
  const kind: CallKind = /mutate|:mutate\b/i.test(command) ? 'write' : 'read'
  const name = script ?? /([\w./-]+\.(?:py|js|ts|sh|rb))/.exec(command)?.[1]

  return { platform: platformOf(command), kind, label: name ? `Bash: ${name.split('/').pop()}` : 'Bash: query' }
}

/**
 * For a terminal command the input did not give away: whether what it printed
 * is ad platform data. Read after the command ran, so any script counts.
 */
export const classifyOutput = (command: string, text: string): Detected | undefined => {
  if (isViewOnly(command) || !ADS_OUTPUT.test(text.slice(0, 200_000))) return undefined

  const found = bashDetected(command)

  return { ...found, platform: found.platform === 'Ads' ? platformOf(text.slice(0, 20_000)) : found.platform }
}

export type Extracted = {
  params: [string, string][]
  accounts: string[]
  level?: string
  dates: string[]
  fields: string[]
}

const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'])
const ACCOUNT_KEY = /^(ad_)?account(_id|_ids|s)?$|^customer(_id|_ids|id)?$|^advertiser(_id|_ids)?$|^act(_id)?$|^login_customer_id$/i
const LEVEL_KEY = /^(level|entity_type|object_type|entity_level|report_level|entity)$/i
const FIELD_KEY = /^(fields|metrics|columns|dimensions)$/i
const DATE_KEY = /(date|since|until|start|end|time_range|timerange|period|preset)/i
const ISO_DATE = /\b(20\d{2}-\d{2}-\d{2})\b/g

const short = (v: unknown, max = 90): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v) ?? ''

  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

const uniq = (xs: string[]): string[] => [...new Set(xs.filter(x => x !== ''))]

export const accountsIn = (text: string): string[] => [
  ...(text.match(/\bact_\d{6,}\b/g) ?? []),
  ...(text.match(/\b\d{3}-\d{3}-\d{4}\b/g) ?? []),
  ...[...text.matchAll(/customer[_-]?id["'=: ]+["']?(\d{10})\b/gi)].map(m => m[1] ?? ''),
  ...[...text.matchAll(/customers\/(\d{10})\b/g)].map(m => m[1] ?? ''),
]

const gaql = (text: string): { level?: string; fields: string[]; dates: string[] } => {
  const select = /select\s+([\s\S]+?)\s+from\s+([a-z_]+)/i.exec(text)
  const fields = select?.[1]?.split(',').map(f => f.trim()).filter(f => /^[a-z_.]+$/i.test(f)) ?? []
  const from = select?.[2]
  const dates: string[] = []
  const between = /segments\.date\s+between\s+'?(\d{4}-\d{2}-\d{2})'?\s+and\s+'?(\d{4}-\d{2}-\d{2})'?/i.exec(text)

  if (between) dates.push(`${between[1]} → ${between[2]}`)

  const during = /during\s+([a-z_0-9]+)/i.exec(text)

  if (during?.[1]) dates.push(during[1].toUpperCase())

  return { level: from ? normalizeLevel(from) : undefined, fields, dates }
}

/** Reads the accounts, level, dates and fields a tool call's input names. */
export const extract = (tool: string, input: Record<string, unknown>): Extracted => {
  const params: [string, string][] = []
  const accounts: string[] = []
  const dates: string[] = []
  const fields: string[] = []
  let level: string | undefined

  if (tool === 'Bash' || tool === 'Read') {
    const text = String(input.command ?? input.file_path ?? '')
    const q = gaql(text)
    params.push([tool === 'Bash' ? 'command' : 'file', short(text, 160)])
    accounts.push(...accountsIn(text))
    dates.push(...q.dates)

    const isoDates = text.match(ISO_DATE) ?? []

    if (q.dates.length === 0 && isoDates.length > 0) {
      const sorted = [...isoDates].sort()
      dates.push(sorted.length > 1 ? `${sorted[0]} → ${sorted[sorted.length - 1]}` : sorted[0] ?? '')
    }

    return { params, accounts: uniq(accounts), level: q.level, dates: uniq(dates), fields: q.fields }
  }

  const walk = (value: unknown, key: string, depth: number): void => {
    if (depth > 4 || value === null || value === undefined) return

    if (ACCOUNT_KEY.test(key)) {
      const list = Array.isArray(value) ? value : [value]

      for (const one of list) {
        if (typeof one === 'string' || typeof one === 'number') accounts.push(String(one))
      }
    }

    if (LEVEL_KEY.test(key) && typeof value === 'string') level = normalizeLevel(value)

    if (FIELD_KEY.test(key)) {
      if (Array.isArray(value)) fields.push(...value.filter((f): f is string => typeof f === 'string'))
      else if (typeof value === 'string') fields.push(...value.split(',').map(f => f.trim()))
    }

    if (key === 'query' && typeof value === 'string' && /select\s/i.test(value)) {
      const q = gaql(value)
      level = level ?? q.level
      fields.push(...q.fields)
      dates.push(...q.dates)
    }

    if (DATE_KEY.test(key)) {
      if (typeof value === 'string' && value !== '') dates.push(value)
      else if (typeof value === 'object' && !Array.isArray(value)) {
        const o = value as Record<string, unknown>
        const since = o.since ?? o.start ?? o.start_date ?? o.from
        const until = o.until ?? o.end ?? o.end_date ?? o.to

        if (typeof since === 'string' && typeof until === 'string') dates.push(`${since} → ${until}`)
        else dates.push(short(value, 60))
      }

      return
    }

    if (Array.isArray(value)) {
      for (const one of value.slice(0, 50)) walk(one, key, depth + 1)
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k, depth + 1)
    }
  }

  for (const [k, v] of Object.entries(input)) {
    if (RESERVED.has(k)) continue
    if (params.length < 14) params.push([k, short(v)])
    walk(v, k, 0)
  }

  // Pair since/until given as two top-level keys.
  const since = input.since ?? input.start_date ?? input.date_from ?? input.startDate
  const until = input.until ?? input.end_date ?? input.date_to ?? input.endDate

  if (typeof since === 'string' && typeof until === 'string') {
    const pair = `${since} → ${until}`
    const rest = dates.filter(d => d !== since && d !== until)
    dates.length = 0
    dates.push(pair, ...rest)
  }

  const raw = JSON.stringify(input)
  accounts.push(...accountsIn(raw))

  return { params, accounts: uniq(accounts), level, dates: uniq(dates), fields: uniq(fields) }
}

export type ResultFacts = {
  rows?: number
  rowsApprox: boolean
  flags: string[]
  currency?: string
  timezone?: string
}

const PAGING = (o: Record<string, unknown>): boolean => {
  const paging = o.paging as Record<string, unknown> | undefined

  if (paging && typeof paging === 'object' && typeof paging.next === 'string' && paging.next !== '') return true

  for (const k of ['next_page_token', 'nextPageToken', 'next_cursor', 'nextCursor']) {
    const v = o[k]

    if (typeof v === 'string' && v !== '') return true
  }

  return o.has_more === true || o.hasMore === true
}

/** Reads a tool's text answer for its row count and the facts worth flagging. */
export const readResult = (text: string): ResultFacts => {
  const flags: string[] = []
  const t = text.trim()

  if (/\bsampl(ed|ing)\b/i.test(t)) flags.push('sampled')
  if (/\[truncated\]|\btruncated\b|output too large|was cut/i.test(t)) flags.push('truncated')

  if (t === '' || t === '[]' || t === '{}' || t === 'null') return { rows: 0, rowsApprox: false, flags }

  const start = t.search(/[[{]/)
  let parsed: unknown

  if (start >= 0 && start < 200) {
    try {
      parsed = JSON.parse(t.slice(start))
    } catch {
      parsed = undefined
    }
  }

  if (parsed !== undefined) {
    let best: number | undefined
    let currency: string | undefined
    let timezone: string | undefined
    let hasPaging = false

    const walk = (v: unknown, depth: number): void => {
      if (depth > 5 || v === null || typeof v !== 'object') return

      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && (best === undefined || v.length > best)) best = v.length
        if (v.length === 0 && best === undefined) best = 0
        for (const one of v.slice(0, 20)) walk(one, depth + 1)

        return
      }

      const o = v as Record<string, unknown>

      if (PAGING(o)) hasPaging = true

      for (const [k, x] of Object.entries(o)) {
        if (/^(currency|currency_code|currencyCode)$/.test(k) && typeof x === 'string' && /^[A-Z]{3}$/.test(x)) currency = currency ?? x
        if (/^(timezone_name|time_zone|timezone|timeZone)$/.test(k) && typeof x === 'string') timezone = timezone ?? x
        walk(x, depth + 1)
      }
    }

    walk(parsed, 0)

    if (hasPaging) flags.push('paging')

    return { rows: best, rowsApprox: false, flags, currency, timezone }
  }

  // Plain text (a script's table or CSV): count the lines that look like rows.
  const lines = t.split('\n').filter(l => l.trim() !== '')
  const tabular = lines.filter(l => (l.match(/[\t|;,]/g)?.length ?? 0) >= 2 || /\S\s{2,}\S.*\s{2,}\S/.test(l))

  if (tabular.length >= 2) return { rows: tabular.length - 1, rowsApprox: true, flags }

  return { rows: undefined, rowsApprox: true, flags }
}

/** Every number written in a text, sorted, for the source check. */
export const numberIndex = (text: string): number[] => {
  const out: number[] = []
  const push = (s: string) => {
    const n = Number(s)

    if (Number.isFinite(n)) out.push(n)
  }

  for (const m of text.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
    push(m[0])
    if (out.length > 400000) break
  }

  // 1,234.56 (en) and 1.234,56 (pt-BR) as scripts often print them.
  for (const m of text.matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?/g)) push(m[0].replace(/,/g, ''))
  for (const m of text.matchAll(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+,\d+/g)) push(m[0].replace(/\./g, '').replace(',', '.'))

  return out.sort((a, b) => a - b)
}

const within = (sorted: number[], lo: number, hi: number): boolean => {
  let a = 0
  let b = sorted.length

  while (a < b) {
    const mid = (a + b) >> 1

    if ((sorted[mid] ?? 0) < lo) a = mid + 1
    else b = mid
  }

  return a < sorted.length && (sorted[a] ?? Infinity) <= hi
}

const decimalsOf = (v: number): number => {
  const s = String(v)
  const dot = s.indexOf('.')

  return dot < 0 ? 0 : Math.min(6, s.length - dot - 1)
}

/**
 * Whether `v` appears among the numbers of the source, as written or as
 * platforms store it: rounded to the shown precision, in micros (Google
 * cost), in cents, or as a fraction for a percentage.
 */
export const isInSource = (sorted: number[], v: number): boolean => {
  if (sorted.length === 0) return false

  const tol = 0.5 * Math.pow(10, -decimalsOf(v)) + 1e-9
  const probes: [number, number][] = [
    [v, tol],
    [v * 1e6, tol * 1e6],
    [v * 100, tol * 100],
    [v / 100, tol / 100],
  ]

  return probes.some(([x, t]) => within(sorted, x - t, x + t))
}

export const toNumber = (cell: unknown): number | undefined => {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined
  if (typeof cell !== 'string') return undefined

  const s = cell.trim().replace(/%$/, '')

  if (!/^-?[\d.,]+$/.test(s)) return undefined

  // 1.234,56 or 1234,56 → pt-BR; otherwise drop thousands commas.
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''))

  return Number.isFinite(n) ? n : undefined
}
