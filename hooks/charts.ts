// Flat SVG charts in the panel's palette: one accent, no gradients, no glow.

export type ThemeMode = 'auto' | 'light' | 'dark'

type Palette = {
  bg: string | undefined
  card: string | undefined
  border: string
  border2: string
  grid: string
  text: string
  bright: string
  muted: string
  dim: string
  accent: string
  fill: string
  onAccent: string
  ok: string
  warn: string
  err: string
  tcp: string
  onTcp: string
  okBg: string
  okText: string
  warnBg: string
  warnText: string
  infoText: string
}

// Terminal-style dark palette (the original look).
const DARK: Palette = {
  bg: '#181818',
  card: '#1f1f1f',
  border: '#2b2b2b',
  border2: '#3c3c3c',
  grid: '#2a2a2a',
  text: '#cccccc',
  bright: '#e7e7e7',
  muted: '#9d9d9d',
  // 5.4:1 on the card (the old #6e7681 was 3.6:1, under WCAG AA for small text).
  dim: '#8b949e',
  accent: '#3794ff',
  // A fill that carries white text at 6.4:1 (white on the accent is only 3.1:1).
  fill: '#0e639c',
  onAccent: '#ffffff',
  ok: '#89d185',
  warn: '#cca700',
  err: '#f14c4c',
  // Simple view: the TCP green for progress and what is right, soft fills for badges.
  tcp: '#7fba24',
  onTcp: '#0d1f05',
  okBg: '#1f3312',
  okText: '#b9e07a',
  warnBg: '#3a2e10',
  warnText: '#f0c75e',
  infoText: '#7fb6f0',
}

// Light palette: every text color is at least 4.5:1 on its own card.
const LIGHT: Palette = {
  bg: '#ffffff',
  card: '#f6f8fa',
  border: '#d8dee4',
  border2: '#b6bfc8',
  grid: '#e3e8ed',
  text: '#24292f',
  bright: '#0b0f14',
  muted: '#4b555f',
  dim: '#586069',
  accent: '#0969da',
  fill: '#0e639c',
  onAccent: '#ffffff',
  ok: '#1a7f37',
  warn: '#8a5a00',
  err: '#cf222e',
  tcp: '#6a9f1c',
  onTcp: '#0d1f05',
  okBg: '#dcf2c8',
  okText: '#2b5a0b',
  warnBg: '#fbecc2',
  warnText: '#7a4f00',
  infoText: '#0550ae',
}

// Follows the app: theme keys for text and borders, and no fill of its own, so the
// panel is light in a light app and dark in a dark one. The badge pairs below carry
// their own background and text, so they read on both.
const AUTO: Palette = {
  ...LIGHT,
  bg: undefined,
  card: undefined,
  border: 'inactive',
  border2: 'inactive',
  text: 'text',
  bright: 'text',
  muted: 'subtle',
  dim: 'inactive',
  accent: 'suggestion',
  ok: 'success',
  warn: 'warning',
  err: 'error',
  infoText: 'suggestion',
}

let mode: ThemeMode = 'auto'

/** The palette every drawing reads. Mutated in place so imports see the change. */
export const C: Palette = { ...AUTO }

export const setThemeMode = (m: ThemeMode): void => {
  mode = m
  Object.assign(C, m === 'dark' ? DARK : m === 'light' ? LIGHT : AUTO)
}

const withPalette = <T>(p: Palette, build: () => T): T => {
  const saved = { ...C }

  Object.assign(C, p)

  try {
    return build()
  } finally {
    Object.assign(C, saved)
  }
}

/**
 * Draws an SVG in the palette of the chosen mode. In auto mode it draws both a light
 * and a dark version and lets the SVG show the one that matches the system.
 */
const themed = (build: () => string): string => {
  if (mode !== 'auto') return withPalette(mode === 'dark' ? DARK : LIGHT, build)

  const split = (s: string) => /^(<svg[^>]*>)([\s\S]*)<\/svg>$/.exec(s)
  const l = split(withPalette(LIGHT, build))
  const d = split(withPalette(DARK, build))

  if (!l || !d) return withPalette(DARK, build)

  return (
    `${l[1]}<style>.tl{display:inline}.td{display:none}@media (prefers-color-scheme:dark){.tl{display:none}.td{display:inline}}</style>` +
    `<g class="tl">${l[2]}</g><g class="td">${d[2]}</g></svg>`
  )
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const SANS = 'system-ui, -apple-system, Segoe UI, sans-serif'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SYMBOL: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' }

const group = (int: string, sep: string): string => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep)

/** A full number for tables and tooltips: 1,234.56 (en) or 1.234,56 (pt). */
export const fmt = (v: number | null | undefined, lang: 'en' | 'pt', unit?: string, currency?: string): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'

  const isMoney = unit === 'currency' || (unit !== undefined && SYMBOL[unit] !== undefined)
  const isInt = Number.isInteger(v) && !isMoney
  const fixed = Math.abs(v).toFixed(isInt ? 0 : 2)
  const [int = '0', dec] = fixed.split('.')
  const [sep, point] = lang === 'pt' ? ['.', ','] : [',', '.']
  const body = `${v < 0 ? '-' : ''}${group(int, sep)}${dec ? point + dec : ''}`

  if (unit === '%') return `${body}%`
  if (isMoney) {
    const code = unit === 'currency' ? currency : unit
    const sym = code ? (SYMBOL[code] ?? code) : ''

    return sym ? `${sym} ${body}` : body
  }

  return unit && unit !== 'count' ? `${body} ${unit}` : body
}

/** A short number for axes: 1.2k, 3.4M. */
export const compact = (v: number): string => {
  const a = Math.abs(v)

  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  if (a >= 10 || Number.isInteger(v)) return v.toFixed(0)

  return v.toFixed(2)
}

const shortLabel = (s: string): string => {
  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(s)

  return iso ? `${iso[1]}-${iso[2]}` : s
}

const niceMax = (v: number): number => {
  if (v <= 0) return 1

  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10

  return step * p
}

type Series = {
  labels: string[]
  values: (number | null)[]
  name: string
  tip: (v: number) => string
  width: number
}

/** A line over time; a missing point stays a gap, never drawn in. */
const lineChartRaw = ({ labels, values, name, tip, width }: Series): string => {
  const W = Math.max(240, Math.round(width))
  const H = 132
  const L = 44
  const R = 10
  const T = 10
  const B = 22
  const nums = values.filter((v): v is number => v !== null)
  const lo = Math.min(0, ...nums)
  const hi = niceMax(Math.max(0, ...nums))
  const span = hi - lo || 1
  const n = values.length
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1))
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / span)
  const parts: string[] = []

  for (let g = 0; g <= 4; g += 1) {
    const v = lo + (span * g) / 4
    const gy = y(v)
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`)
    parts.push(
      `<text x="${L - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${C.dim}">${esc(compact(v))}</text>`,
    )
  }

  const ticks = n <= 1 ? [0] : n <= 4 ? [...Array(n).keys()] : [0, Math.floor((n - 1) / 2), n - 1]

  for (const i of ticks) {
    const anchor = n <= 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
    parts.push(
      `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" font-family="${MONO}" font-size="10" fill="${C.dim}">${esc(shortLabel(labels[i] ?? ''))}</text>`,
    )
  }

  // Runs of consecutive points; a null ends a run.
  let run: string[] = []
  const runs: string[][] = []

  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run)
      run = []
    } else run.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  })
  if (run.length) runs.push(run)

  for (const r of runs) {
    if (r.length > 1) {
      parts.push(`<polyline points="${r.join(' ')}" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)
    }
  }

  // Each point gets a hover target wider than the line (its tooltip), and only
  // the last one a visible marker with its value, so the line stays clean.
  const hit = Math.max(4, Math.min(10, (W - L - R) / Math.max(1, n) / 2))

  values.forEach((v, i) => {
    if (v === null) return
    parts.push(
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${hit.toFixed(1)}" fill="transparent"><title>${esc(`${labels[i] ?? ''} · ${name}: ${tip(v)}`)}</title></circle>`,
    )
  })

  const lastIdx = values.map(v => v !== null).lastIndexOf(true)
  const last = lastIdx >= 0 ? values[lastIdx] : null

  if (last !== null && last !== undefined) {
    const lx = x(lastIdx)
    const ly = y(last)
    parts.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${C.accent}" stroke="${C.card}" stroke-width="2" pointer-events="none"/>`)
    parts.push(
      `<text x="${(lx - 7).toFixed(1)}" y="${(ly - 8).toFixed(1)}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${C.text}" pointer-events="none">${esc(compact(last))}</text>`,
    )
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${SANS}"><rect width="${W}" height="${H}" fill="${C.card}"/>${parts.join('')}</svg>`
}

/** Horizontal bars, largest first, labels on the left. */
const barChartRaw = ({ labels, values, name, tip, width }: Series): string => {
  const W = Math.max(240, Math.round(width))
  const rowH = 20
  const H = labels.length * rowH + 8
  const labelW = Math.round(W * 0.38)
  const valueW = 64
  const max = Math.max(0, ...values.map(v => v ?? 0)) || 1
  const barMax = W - labelW - valueW - 8
  const chars = Math.max(6, Math.floor(labelW / 6.2))
  const parts: string[] = []

  labels.forEach((label, i) => {
    const v = values[i] ?? null
    const top = 4 + i * rowH
    const text = label.length > chars ? `${label.slice(0, chars - 1)}…` : label
    parts.push(
      `<text x="0" y="${top + 13}" font-size="10.5" fill="${C.text}">${esc(text)}<title>${esc(label)}</title></text>`,
    )

    if (v === null) {
      parts.push(`<text x="${labelW}" y="${top + 13}" font-family="${MONO}" font-size="10" fill="${C.dim}">—</text>`)

      return
    }

    const w = Math.max(1, (Math.max(0, v) / max) * barMax)
    // Square at the baseline, rounded at the data end; the whole row is the hover target.
    const h = rowH - 8
    const r = Math.min(3, w / 2, h / 2)
    const y0 = top + 4
    parts.push(
      `<g><title>${esc(`${label} · ${name}: ${tip(v)}`)}</title>` +
        `<rect x="0" y="${top}" width="${W}" height="${rowH}" fill="transparent"/>` +
        `<path d="M${labelW} ${y0}h${(w - r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}v${(h - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 -${r} ${r}h-${(w - r).toFixed(1)}z" fill="${C.accent}"/></g>`,
    )
    parts.push(
      `<text x="${(labelW + w + 6).toFixed(1)}" y="${top + 13}" font-family="${MONO}" font-size="10" fill="${C.muted}">${esc(compact(v))}</text>`,
    )
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${SANS}"><rect width="${W}" height="${H}" fill="${C.card}"/>${parts.join('')}</svg>`
}

const BLOCKS = '▁▂▃▄▅▆▇█'

/** A one-row spark line for the terminal, which draws no SVG. */
export const sparkline = (values: (number | null)[]): string => {
  const nums = values.filter((v): v is number => v !== null)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)

  return values
    .map(v => (v === null ? ' ' : BLOCKS[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)] ?? ' '))
    .join('')
}

/** A text bar for the terminal. */
export const textBar = (v: number, max: number, width: number): string => {
  const n = max <= 0 ? 0 : Math.round((Math.max(0, v) / max) * width)

  return '█'.repeat(n) + '·'.repeat(Math.max(0, width - n))
}

type Columns = {
  labels: string[]
  values: (number | null)[]
  /** A count per column (conversions that day): drawn as a dot above the bar. */
  marks: number[]
  name: string
  markName: string
  tip: (v: number) => string
  /** How a label reads under the axis: 12/11 or 11/12. */
  short: (label: string) => string
  width: number
}

/** Vertical bars, one per day, with a dot above the days that brought a result. */
const columnChartRaw = ({ labels, values, marks, name, markName, tip, short, width }: Columns): string => {
  const W = Math.max(240, Math.round(width))
  const H = 150
  const L = 44
  const R = 10
  const T = 26
  const B = 22
  const n = Math.max(1, values.length)
  const hi = niceMax(Math.max(0, ...values.map(v => v ?? 0)))
  const slot = (W - L - R) / n
  const barW = Math.max(2, Math.min(28, slot * 0.68))
  const y = (v: number) => T + (H - T - B) * (1 - v / hi)
  const parts: string[] = []

  for (let g = 0; g <= 2; g += 1) {
    const v = (hi * g) / 2
    const gy = y(v)
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`)
    parts.push(
      `<text x="${L - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${C.dim}">${esc(compact(v))}</text>`,
    )
  }

  values.forEach((v, i) => {
    const cx = L + slot * (i + 0.5)
    const mark = marks[i] ?? 0
    const what = `${labels[i] ?? ''} · ${name}: ${v === null ? '—' : tip(v)}${mark > 0 ? ` · ${markName}: ${mark}` : ''}`

    parts.push(`<g><title>${esc(what)}</title><rect x="${(cx - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent"/>`)

    if (v !== null && v > 0) {
      const top = y(v)
      const h = H - B - top
      const r = Math.min(2, barW / 2, h / 2)
      parts.push(
        `<path d="M${(cx - barW / 2).toFixed(1)} ${H - B}v-${(h - r).toFixed(1)}a${r} ${r} 0 0 1 ${r} -${r}h${(barW - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}v${(h - r).toFixed(1)}z" fill="${C.accent}"/>`,
      )
    }
    if (mark > 0) {
      const top = v !== null && v > 0 ? y(v) : H - B
      parts.push(`<circle cx="${cx.toFixed(1)}" cy="${(top - 7).toFixed(1)}" r="3.5" fill="${C.tcp}"/>`)
      // More than one that day: the count above the dot, so 4 doesn't read as 1.
      if (mark > 1) {
        parts.push(
          `<text x="${cx.toFixed(1)}" y="${(top - 14).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="10" fill="${C.okText}">${esc(compact(Math.round(mark * 10) / 10))}</text>`,
        )
      }
    }
    parts.push('</g>')
  })

  const ticks = n <= 1 ? [0] : n <= 4 ? [...Array(n).keys()] : [0, Math.floor((n - 1) / 2), n - 1]

  for (const i of ticks) {
    parts.push(
      `<text x="${(L + slot * (i + 0.5)).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-family="${MONO}" font-size="10" fill="${C.dim}">${esc(short(labels[i] ?? ''))}</text>`,
    )
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${SANS}"><rect width="${W}" height="${H}" fill="${C.card}"/>${parts.join('')}</svg>`
}

export const lineChart = (a: Parameters<typeof lineChartRaw>[0]): string => themed(() => lineChartRaw(a))
export const barChart = (a: Parameters<typeof barChartRaw>[0]): string => themed(() => barChartRaw(a))
export const columnChart = (a: Parameters<typeof columnChartRaw>[0]): string => themed(() => columnChartRaw(a))
