import type { AnswerCheck, AnswerMiss, Lang } from '../types'
import { isCommon, isNear } from './detect'
import { rowNumbers } from './rows'
import { guessLang } from './i18n'

/**
 * The numbers of Claude's final answer, looked up in what the session read.
 *
 * The answer is what reaches a client, so this is the check that matters most.
 * Each number is put in one bucket:
 * - found: in the media queries the panel logged;
 * - summed: a total that adds up a column of the answer's own table, each part found;
 * - elsewhere: in another file Claude read, or in the person's own message;
 * - common: too small or too common to prove anything (a count of 3, 30 days);
 * - calculated: not found, and written as a rate, an average, a cost per or a difference;
 * - missing: none of the above. It may be right (a source the panel did not log),
 *   but nothing the panel saw backs it.
 */

type Token = {
  text: string
  value: number
  tol: number
  at: number
  end: number
  isDerived: boolean
  isSmall: boolean
  /** Where it sits in a table of the answer, to add up a column. */
  cell?: { table: number; row: number; col: number; isTotalRow: boolean; label: string; isMetric: boolean }
  context: string
}

const MAX_TOKENS = 400
const MAX_MISSES = 12

const MONTHS =
  'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december'
const SHORT_MONTHS = 'jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec'

// What is not a claim: code, links, IDs, dates, times, versions, list numbers.
// Each is blanked to spaces of its own length, so positions stay those of the answer.
const NOISE: RegExp[] = [
  /```[\s\S]*?```/g,
  /`[^`\n]*`/g,
  /https?:\/\/\S+/g,
  /\]\([^)\s]*\)/g,
  /\bact_\d+/gi,
  /\b\d{3}-\d{3}-\d{4}\b/g,
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?\b/g,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  new RegExp(`\\b(?:${SHORT_MONTHS})[a-zç]*\\.?\\/\\d{2,4}\\b`, 'gi'),
  new RegExp(`\\b\\d{1,2}(?:\\s+(?:de\\s+)?|\\s*)(?:${MONTHS})\\b`, 'gi'),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, 'gi'),
  /\b\d{1,2}h\d{0,2}\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  /\bv?\d+(?:\.\d+){2,}\b/g,
  /#\d+/g,
  /\b\d+\s?[ºª°]/g,
  /(?<!(?:R\$|\$|€)\s?)\b(?:19|20)\d{2}\b(?![.,]\d)/g,
  /\b\d{9,}\b/g,
  /^\s*\d+[.)]\s/gm,
  // A semester or intake written as a year: 2027.1, 2026/2.
  /\b(?:19|20)\d{2}[./][12]\b/g,
]

const blank = (text: string): string =>
  NOISE.reduce((t, re) => t.replace(re, m => ' '.repeat(m.length)), text)

// Written as a rate, an average, a cost per, an estimate or a difference.
// The words around Claude's own arithmetic: a plan, a projection, what is left, a pace.
const DERIVED_BEFORE =
  /\b(cpa|cpl|cpc|cpm|cpv|ctr|roas|cvr|cac|ticket|taxa|rate|m[eé]dia|average|avg|custo\s+por|cost\s+per|por\s+(?:convers|lead|clique|venda|inscri|contato|cadastro)|per\s+(?:conversion|lead|click|sale)|varia|diferen|differen|cresc|ca[ií]u|queda|alta\s+de|aument|redu|subiu|desceu|vs\.?|versus|cerca\s+de|about|around|aprox|estim|proje|previs|forecast|meta\s+de|target|sobra|resta|falta|saldo|left|remaining|fech|ritmo|pace|esperad|expected|teto|limite|cap\b|seria|cairia|ficaria|would|a\s+cada|dividid|divided|vezes|times|configurad|planejad|planned|plano|plan\b|or[çc]amento|budget|l[ií]quid|brut|net\b|gross|somou|added|novo\s+ritmo|at[eé]\s+o\s+fim|contra|against|fica|ficam|stays|\bmais\s*$|\bplus\s*$)/i
const DERIVED_AFTER =
  /^\s*(?:\/\s*(?:dia|day|m[eê]s|month|semana|week)|por\s+(?:dia|semana|m[eê]s|convers|lead|clique|venda|inscri|cadastro)|ao\s+dia|a\s+mais|a\s+menos|de\s+diferen|more|less|higher|lower|per\s+(?:day|week|month|conversion|lead|click)|a\s+day|cada|each|l[ií]quid|brut|do\s+plano|of\s+the\s+plan|previst|planejad|no\s+plano|in\s+the\s+plan)/i
const DERIVED_HEADER = /(cpa|cpl|cpc|cpm|cpv|ctr|roas|cvr|cac|taxa|rate|m[eé]di[ao]|avg|average|por\s|per\s|%|var|dif|delta|Δ|fech|resta|falta|sobra|proje|ritmo|pace|teto|limite|plano|plan\b|previst|esperad|or[çc]amento|budget|l[ií]quid|brut)/i
// "81 conversões a R$ 6,52": a cost per, written after what it divides.
const PER_UNIT_BEFORE = /(convers|lead|clique|click|venda|sale|inscri|cadastr|compra|purchase)\p{L}*\s+(?:a|at|por|de|for)\s*$/iu
// What joins two numbers of one comparison or range: "de 312 para 440", "entre 612,40 e 612,60", "4,10 a 6,30".
const JOINER = /^\s*(?:para|a|at[eé]|e|and|to|→|->|–|-|,)\s*(?:R\$|US\$|\$|€)?\s*$/i
// The columns of a table that copy a metric from the data, where a number must sit in its own row.
const METRIC_HEADER = /(custo|gasto|investi|spend|cost|clique|click|impress|convers|receita|revenue|compras?|purchases?|leads?|cadastros?|alcance|reach|visualiza|views?)/i
// A number that is a code or a measure, not a result: a form ID, a version, an error, pixels, days.
const CODE_BEFORE = /\b(vers[ãa]o|version|v\.?|c[óo]digo|code|erro|error|http|status|porta|port|ids?|idps|n[º°]\.?|n[úu]mero|number|formul[áa]rio|form|recus\w*\s+com|retorn\w*\s+com|fails?\s+with|returns?)\s*[:=]?\s*$/i
const UNIT_AFTER = /^\s*(?:px|pt|dias?|days?|h\b|hs?\b|horas?|hours?|min|minutos?|minutes?|seg|segundos?|seconds?|km|mi\b|mb|kb|gb|anos?|years?|semanas?|weeks?|meses|months?)/i
const TOTAL_ROW = /^\s*[*_]*\s*(total|soma|geral|todos|todas|all|sum)\b/i

const SCALE: Record<string, number> = { mil: 1e3, k: 1e3, mi: 1e6, milhão: 1e6, milhões: 1e6, m: 1e6, mm: 1e6, bi: 1e9 }

// A currency mark, a sign, the digits, and a unit or a scale (%, 3,2x, 12 mil, 1,2 mi).
const NUMBER =
  /(?:(R\$|US\$|\$|€)\s?)?([+\-−]?)(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(\s?(?:%|x(?![\p{L}\d])|[mM]il(?![\p{L}\d])|mi(?![\p{L}\d])|milh(?:ão|ões)(?![\p{L}\d])|bi(?![\p{L}\d])|[kK](?![\p{L}\d])|MM?(?![\p{L}\d])))?/gu

/** A number as a person writes it, in the answer's language: 1.234,56 or 1,234.56. */
export const parseWritten = (s: string, lang: Lang): { value: number; decimals: number } | undefined => {
  let body = s
  let decimals = 0
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    const other = dec === ',' ? '.' : ','
    body = s.split(other).join('')
    decimals = body.length - body.indexOf(dec) - 1
    body = body.replace(dec, '.')
  } else if (hasComma) {
    if ((lang === 'en' || /^\d{1,3}(?:,\d{3}){2,}$/.test(s)) && /^\d{1,3}(?:,\d{3})+$/.test(s)) body = s.replace(/,/g, '')
    else {
      decimals = s.length - s.lastIndexOf(',') - 1
      body = s.replace(',', '.')
    }
  } else if (hasDot) {
    if ((lang === 'pt' || /^\d{1,3}(?:\.\d{3}){2,}$/.test(s)) && /^\d{1,3}(?:\.\d{3})+$/.test(s)) body = s.replace(/\./g, '')
    else decimals = s.length - s.lastIndexOf('.') - 1
  }

  const value = Number(body)

  return Number.isFinite(value) ? { value, decimals } : undefined
}

type Table = { start: number; end: number; headers: string[]; rows: { start: number; end: number; cells: [number, number][]; label: string; isTotal: boolean }[] }

/** The markdown tables of an answer: each row's cells by their place in the text. */
const tablesOf = (text: string): Table[] => {
  const out: Table[] = []
  const lines: { start: number; end: number; text: string }[] = []
  let pos = 0

  for (const line of text.split('\n')) {
    lines.push({ start: pos, end: pos + line.length, text: line })
    pos += line.length + 1
  }

  // The cells between the pipes of a row, by their place in the whole text.
  const cellsOf = (l: { start: number; text: string }): [number, number][] => {
    // A pipe written \| belongs to the cell (campaign names often have one).
    const pipes = [...l.text.matchAll(/(?<!\\)\|/g)].map(p => p.index ?? 0)
    const cells: [number, number][] = []

    for (let i = 0; i + 1 < pipes.length; i += 1) cells.push([l.start + (pipes[i] ?? 0) + 1, l.start + (pipes[i + 1] ?? 0)])

    const last = pipes[pipes.length - 1] ?? -1

    if (last >= 0 && l.text.slice(last + 1).trim() !== '') cells.push([l.start + last + 1, l.start + l.text.length])

    return cells
  }

  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i]
    const sep = lines[i + 1]

    if (!head || !sep || !head.text.trim().startsWith('|') || !/^\s*\|?\s*:?-{2,}/.test(sep.text)) continue

    const headers = cellsOf(head).map(([a, b]) => text.slice(a, b).trim())
    const table: Table = { start: head.start, end: sep.end, headers, rows: [] }
    let j = i + 2

    while (j < lines.length && (lines[j]?.text.trim().startsWith('|') ?? false)) {
      const l = lines[j] as { start: number; end: number; text: string }
      const cells = cellsOf(l)
      const label = cells[0] ? text.slice(cells[0][0], cells[0][1]).replace(/[*_]/g, '').trim() : ''

      table.rows.push({ start: l.start, end: l.end, cells, label, isTotal: TOTAL_ROW.test(label) })
      table.end = l.end
      j += 1
    }

    out.push(table)
    i = j - 1
  }

  return out
}

const tidy = (s: string): string =>
  s
    .replace(/\\\|/g, '\u0000')
    .replace(/[*_]{1,2}/g, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\u0000/g, '|')
    .replace(/\s+/g, ' ')
    .trim()

/** A few words around a number, cut at whole words. */
const snippet = (text: string, from: number, to: number, lineStart: number, lineEnd: number): string => {
  const a = Math.max(lineStart, from - 36)
  const b = Math.min(lineEnd, to + 36)
  let s = text.slice(a, b)

  if (a > lineStart) s = `…${s.slice(s.indexOf(' ') + 1)}`
  if (b < lineEnd) s = `${s.slice(0, s.lastIndexOf(' '))}…`

  return tidy(s)
}

/** Every number of an answer that reads as a claim, with what surrounds it. */
export const tokensOf = (answer: string, lang?: Lang): Token[] => {
  // The answer's own language decides 1.234 (pt: a thousand) from 1.234 (en: one point two).
  const lg = guessLang(answer) ?? lang ?? 'en'
  const text = blank(answer)
  const tables = tablesOf(answer)
  const out: Token[] = []
  let prevEnd = 0

  for (const m of text.matchAll(NUMBER)) {
    if (out.length >= MAX_TOKENS) break

    const at = m.index ?? 0
    const [whole, money = '', sign = '', digits = '', suffixRaw = ''] = m
    const end = at + whole.length
    const before = text.slice(Math.max(0, at - 1), at)
    const after = text.slice(end, end + 1)

    // Part of a word or a code (GA4, utm_2, 3D): not a figure.
    if (!money && /[\p{L}_\d.,]/u.test(before)) continue
    if (/[\p{L}_]/u.test(after) && !suffixRaw) continue

    const parsed = parseWritten(digits, lg)

    if (!parsed) continue

    // A code or a measure: a form ID (40123), a version, an HTTP error, 375 px, 6,5 dias.
    if (!money && !suffixRaw && /^\d{5,}$/.test(digits)) continue
    if (!money && !suffixRaw && (CODE_BEFORE.test(text.slice(Math.max(0, at - 24), at)) || UNIT_AFTER.test(text.slice(end, end + 12)))) continue

    const suffix = suffixRaw.trim().toLowerCase()
    const scale = SCALE[suffix] ?? 1
    const isPercent = suffix === '%'
    const lineStart = answer.lastIndexOf('\n', at) + 1
    const lineEndAt = answer.indexOf('\n', end)
    const lineEnd = lineEndAt < 0 ? answer.length : lineEndAt
    const ctxBefore = text.slice(Math.max(lineStart, prevEnd, at - 40), at)
    const ctxAfter = text.slice(end, Math.min(lineEnd, end + 30))
    const table = tables.findIndex(t => at >= t.start && at <= t.end)
    const t = tables[table]
    const rowIdx = t ? t.rows.findIndex(r => at >= r.start && at <= r.end) : -1
    const row = t?.rows[rowIdx]
    const col = row ? row.cells.findIndex(([a, b]) => at >= a && at < b) : -1
    const header = t && col >= 0 ? (t.headers[col] ?? '') : ''
    const previous = out[out.length - 1]
    const between = previous ? text.slice(previous.end, at) : ''
    // "de 312 para 440": a before and after, both Claude's own comparison.
    const opensPair = /\bde\s*(?:R\$|US\$|\$|€)?\s*$/i.test(text.slice(Math.max(lineStart, at - 8), at)) && /^\s*(?:para|a|at[eé]|to)\s/i.test(ctxAfter)
    const isDerived =
      opensPair ||
      // The second of a pair or a range, when the first one was a calculation or opened the pair.
      (previous !== undefined && previous.isDerived && previous.end > lineStart && JOINER.test(between)) ||
      PER_UNIT_BEFORE.test(ctxBefore) ||
      // A table row named for a calculation: "Meta PE, o que resta".
      (row !== undefined && col > 0 && DERIVED_BEFORE.test(row.label)) ||
      suffix === 'x' ||
      isPercent ||
      // A decimal under 100 with no currency is a rate, an average or a frequency (5,11 per 100 clicks; 1,11).
      (!money && scale === 1 && parsed.decimals > 0 && Math.abs(parsed.value) < 100) ||
      sign !== '' ||
      DERIVED_BEFORE.test(ctxBefore) ||
      DERIVED_AFTER.test(ctxAfter) ||
      (header !== '' && DERIVED_HEADER.test(header))
    const value = (sign === '-' || sign === '−' ? -1 : 1) * parsed.value * scale
    const context = row && col >= 0 ? tidy(`${row.label} · ${header}`) : snippet(answer, at, end, lineStart, lineEnd)

    prevEnd = end
    out.push({
      text: `${money ? `${money} ` : ''}${sign}${digits}${suffixRaw}`.replace(/\s+/g, ' ').trim(),
      value,
      tol: 0.5 * Math.pow(10, -parsed.decimals) * scale,
      at,
      end,
      isDerived,
      // A whole count under 100 (3 campaigns, 30 days, 12 clicks) proves nothing either way.
      isSmall: !money && !isPercent && scale === 1 && parsed.decimals === 0 && Math.abs(value) < 100,
      cell: row && col >= 0 ? { table, row: rowIdx, col, isTotalRow: row.isTotal, label: row.label.replace(/\\\|/g, '|'), isMetric: METRIC_HEADER.test(header) } : undefined,
      context,
    })
  }

  return out
}

type Bucket = 'found' | 'summed' | 'elsewhere' | 'common' | 'calculated' | 'missing' | 'wrongRow'

/** Checks an answer against the numbers of the media queries and of everything else read. */
/**
 * `sums` are the totals of the media responses' rows (rows.ts): a total Claude
 * added up from the days or campaigns it read is checked against them.
 */
export const checkAnswer = (
  answer: string,
  media: number[],
  other: number[],
  at: number,
  lang?: Lang,
  sums: number[] = [],
  labels: Map<string, number[]> = new Map(),
): AnswerCheck => {
  const tokens = tokensOf(answer, lang)
  const seen = new Set<string>()
  const unique = tokens.filter(tk => {
    const key = `${tk.value}|${tk.tol}`

    if (seen.has(key)) return false
    seen.add(key)

    return true
  })

  const plain = (tk: Token): Bucket => {
    if (tk.isSmall) return 'common'
    if (isCommon(media, tk.value, tk.tol)) return 'common'
    if (isNear(media, tk.value, tk.tol)) {
      // In a table, the number of a named row must be in that row: a cost of another campaign is not this one's.
      const own = tk.cell && tk.cell.isMetric && !tk.cell.isTotalRow && !tk.isDerived && labels.size > 0 ? rowNumbers(labels, tk.cell.label) : undefined

      return own === undefined || isNear(own, tk.value, tk.tol) ? 'found' : 'wrongRow'
    }
    if (sums.length > 0 && isNear(sums, tk.value, tk.tol) && !isCommon(sums, tk.value, tk.tol)) return 'summed'
    if (other.length > 0 && isNear(other, tk.value, tk.tol) && !isCommon(other, tk.value, tk.tol)) return 'elsewhere'

    return tk.isDerived ? 'calculated' : 'missing'
  }

  // The column sums of the answer's own tables, each with its parts.
  const columns = new Map<string, Token[]>()

  for (const tk of tokens) {
    if (!tk.cell || tk.cell.isTotalRow || tk.isDerived) continue

    const key = `${tk.cell.table}:${tk.cell.col}`
    const list = columns.get(key) ?? []

    // One number per cell: the first.
    if (!list.some(p => p.cell?.row === tk.cell?.row)) columns.set(key, [...list, tk])
  }

  const bySum = (tk: Token): Bucket | undefined => {
    for (const parts of columns.values()) {
      if (parts.length < 2 || parts.includes(tk)) continue

      const total = parts.reduce((a, p) => a + p.value, 0)
      const slack = parts.reduce((a, p) => a + p.tol, 0)

      if (Math.abs(total - tk.value) > tk.tol + slack + 1e-6) continue

      const kinds = parts.map(plain)

      if (kinds.every(k => k === 'found' || k === 'summed')) return 'summed'
      if (kinds.every(k => k === 'found' || k === 'summed' || k === 'common' || k === 'elsewhere')) return 'common'
    }

    return undefined
  }

  const result: AnswerCheck = { at, total: unique.length, found: 0, summed: 0, elsewhere: 0, common: 0, calculated: 0, missing: [] }
  const misses: AnswerMiss[] = []

  for (const tk of unique) {
    let bucket = plain(tk)

    if (bucket === 'missing' || bucket === 'calculated' || bucket === 'elsewhere') bucket = bySum(tk) ?? bucket

    if (bucket === 'summed') {
      result.found += 1
      result.summed += 1
    } else if (bucket === 'found') result.found += 1
    else if (bucket === 'elsewhere') result.elsewhere += 1
    else if (bucket === 'common') result.common += 1
    else if (bucket === 'calculated') result.calculated += 1
    else if (misses.length < MAX_MISSES) misses.push({ text: tk.text, context: tk.context, ...(bucket === 'wrongRow' ? { isWrongRow: true } : {}) })
    else misses.push({ text: tk.text, context: '' })
  }

  result.missing = misses

  return result
}
