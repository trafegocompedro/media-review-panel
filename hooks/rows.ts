import { toNumber } from './detect'

/**
 * The totals a person adds up from a response: every numeric field summed over
 * all rows, and per value of each label (campaign, ad set, day, device...).
 * A total Claude writes ("the account spent R$ 9.038,21 in the last 30 days")
 * is written in no response; its rows are, and their sum can be checked.
 *
 * Reads JSON (Google Ads, the Meta connector, nested JSON in strings) and
 * simple text tables (tab, semicolon or pipe separated, with a header).
 */

type Row = Map<string, number | string>

const MAX_ROWS = 20_000
const MAX_SUMS = 60_000
const MAX_GROUPS = 400

// Fields that hold IDs or codes, never amounts to add up.
const NOT_SUMMED = /(^|\.|_)(id|ids|.*_id|customer|account|resource_name|resourcename|status|type|currency|timezone|date|date_start|date_stop|hour|week|month|year)$/i

const flatten = (o: unknown, path: string, row: Row, depth: number) => {
  if (depth > 6 || o === null || o === undefined) return

  if (Array.isArray(o)) {
    // Meta's actions: [{ action_type: 'lead', value: '3' }] → actions.lead
    for (const x of o) {
      if (x && typeof x === 'object' && 'action_type' in x && 'value' in x) {
        const v = toNumber((x as Record<string, unknown>).value)

        if (v !== undefined) row.set(`${path}.${String((x as Record<string, unknown>).action_type)}`, v)
      }
    }

    return
  }
  if (typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(v, path ? `${path}.${k}` : k, row, depth + 1)

    return
  }
  if (typeof o === 'number') row.set(path, o)
  else if (typeof o === 'string') {
    const n = /^-?\d+(\.\d+)?$/.test(o.trim()) ? Number(o) : undefined

    row.set(path, n !== undefined && !NOT_SUMMED.test(path) ? n : o)
  }
}

/** Every array of objects in a JSON value, nested JSON strings included. */
const tablesIn = (v: unknown, out: unknown[][], depth = 0) => {
  if (depth > 6 || out.length > 40) return
  if (typeof v === 'string') {
    const s = v.trim()

    if ((s.startsWith('[') || s.startsWith('{')) && s.length > 20) {
      try {
        tablesIn(JSON.parse(s), out, depth + 1)
      } catch {
        // not JSON
      }
    }

    return
  }
  if (Array.isArray(v)) {
    if (v.length >= 2 && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) out.push(v)
    else for (const x of v) tablesIn(x, out, depth + 1)

    return
  }
  if (v && typeof v === 'object') for (const x of Object.values(v)) tablesIn(x, out, depth + 1)
}

const jsonDocs = (text: string): unknown[] => {
  const docs: unknown[] = []
  const t = text.trim()

  try {
    docs.push(JSON.parse(t))

    return docs
  } catch {
    // several documents, or JSON after a line of text
  }

  for (const line of t.split('\n')) {
    const l = line.trim()

    if (!(l.startsWith('{') || l.startsWith('['))) continue
    try {
      docs.push(JSON.parse(l))
    } catch {
      // not a whole document
    }
  }

  return docs
}

/** A text table: a header and rows split by tabs, semicolons or pipes. */
const textTables = (text: string): Row[][] => {
  const out: Row[][] = []
  const lines = text.split('\n')

  for (const sep of ['\t', ';', '|']) {
    let block: string[][] = []
    const flush = () => {
      if (block.length >= 3) {
        const [head, ...rest] = block as [string[], ...string[][]]
        const rows = rest
          .filter(r => !r.every(c => /^[\s:-]*$/.test(c)))
          .map(r => {
            const row: Row = new Map()

            head.forEach((h, i) => {
              const raw = (r[i] ?? '').replace(/R\$|US\$|\$|€|%/g, '').trim()
              const n = toNumber(raw)

              row.set(h.trim() || `col${i}`, n !== undefined && !NOT_SUMMED.test(h.trim()) ? n : (r[i] ?? '').trim())
            })

            return row
          })

        if (rows.length >= 2) out.push(rows)
      }
      block = []
    }

    for (const line of lines) {
      const cells = sep === '|' ? line.replace(/^\s*\||\|\s*$/g, '').split('|') : line.split(sep)

      if (cells.length >= 2 && line.includes(sep)) {
        if (block.length > 0 && cells.length !== (block[0] as string[]).length) flush()
        block.push(cells)
      } else flush()
    }
    flush()
  }

  return out
}

/** Every table of a response, JSON or text, as rows of fields. */
const tablesOfText = (text: string): Row[][] => {
  const tables: Row[][] = []

  for (const doc of jsonDocs(text)) {
    const found: unknown[][] = []

    tablesIn(doc, found)
    for (const t of found) {
      tables.push(
        t.slice(0, MAX_ROWS).map(o => {
          const row: Row = new Map()

          flatten(o, '', row, 0)

          return row
        }),
      )
    }
  }
  tables.push(...textTables(text))

  return tables
}

/** The sums of a response's rows, sorted, for the same lookup as the raw numbers. */
export const rowSums = (text: string): number[] => {
  const sums: number[] = []
  const tables = tablesOfText(text)

  for (const rows of tables) {
    if (sums.length > MAX_SUMS) break

    const numeric = new Set<string>()
    const labels = new Set<string>()

    for (const r of rows) {
      for (const [k, v] of r) {
        if (typeof v === 'number') numeric.add(k)
        else if (v !== '') labels.add(k)
      }
    }

    for (const f of numeric) {
      let total = 0

      for (const r of rows) {
        const v = r.get(f)

        if (typeof v === 'number') total += v
      }
      sums.push(total)

      for (const g of labels) {
        const groups = new Map<string, number>()

        for (const r of rows) {
          const key = r.get(g)
          const v = r.get(f)

          if (typeof key === 'string' && typeof v === 'number') groups.set(key, (groups.get(key) ?? 0) + v)
          if (groups.size > MAX_GROUPS) break
        }
        if (groups.size >= 2 && groups.size <= MAX_GROUPS && groups.size < rows.length) sums.push(...groups.values())
      }
    }
  }

  // Sums of decimals drift (0.1 + 0.2): round to a millionth.
  return sums.map(v => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b)
}

/** A label as a person writes it and as the API spells it: lower case, no accents, words only. */
export const labelKey = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const MAX_LABELS = 20_000

/**
 * The numbers of each named row: for every text value of a row (a campaign, an
 * ad set, a keyword), its numbers and the sums of all rows that carry it. A
 * number in an answer's table belongs to its own row, not to any row.
 */
export const rowLabels = (text: string): Map<string, number[]> => {
  const out = new Map<string, number[]>()
  const add = (label: string, nums: number[]) => {
    const key = labelKey(label)

    if (key.length < 3 || /^\d+$/.test(key.replace(/ /g, ''))) return
    if (!out.has(key) && out.size >= MAX_LABELS) return
    out.set(key, [...(out.get(key) ?? []), ...nums])
  }

  for (const rows of tablesOfText(text)) {
    const sums = new Map<string, Map<string, number>>()

    for (const r of rows) {
      const nums = [...r.values()].filter((v): v is number => typeof v === 'number')
      const texts = [...r.entries()].filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')

      for (const [, v] of texts) {
        add(v, nums)

        const per = sums.get(v) ?? new Map<string, number>()

        for (const [k, n] of r) if (typeof n === 'number') per.set(k, (per.get(k) ?? 0) + n)
        sums.set(v, per)
      }
    }
    for (const [label, per] of sums) add(label, [...per.values()].map(v => Math.round(v * 1e6) / 1e6))
  }

  for (const [k, v] of out) out.set(k, v.sort((a, b) => a - b))

  return out
}

/** The numbers of every row whose label matches the one written (a written "Marca" matches "Pesquisa | Marca"). */
export const rowNumbers = (labels: Map<string, number[]>, written: string): number[] | undefined => {
  const key = labelKey(written)

  if (key.length < 3) return undefined

  const words = key.split(' ')
  const hits: number[][] = []

  for (const [label, nums] of labels) {
    const lw = label.split(' ')

    if (label === key || words.every(w => lw.includes(w)) || lw.every(w => words.includes(w))) hits.push(nums)
  }

  return hits.length > 0 ? hits.flat().sort((a, b) => a - b) : undefined
}
