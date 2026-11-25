// Plain-language helpers for the Simple view: what is happening now, alerts
// with a next step, natural dates, friendly names for metrics and settings.
// Pure functions, so the tests can check every sentence.

import type { CallLog, Dataset, Lang, Review } from '../types'
import { fmt } from './charts'
import { toNumber } from './detect'
import { levelName, strings } from './i18n'
import { isCovered, spansOf } from './review'

export type Alert = { level: 'danger' | 'warn' | 'info'; title: string; body?: string; todo?: string }

const MONTHS: Record<Lang, string[]> = {
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

const parts = (iso: string): [number, number, number] | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())

  if (!m) return undefined

  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])

  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? [y, mo, d] : undefined
}

const lastDay = (y: number, mo: number): number => new Date(Date.UTC(y, mo, 0)).getUTCDate()

const dayPt = (d: number): string => (d === 1 ? '1º' : String(d))

/** "outubro de 2026", "1º a 15 de outubro de 2026", "October 1–15, 2026". Falls back to "a → b". */
export const naturalRange = (a: string, b: string, lang: Lang): string => {
  const x = parts(a)
  const y = parts(b)

  if (!x || !y) return `${a} → ${b}`

  const [y1, m1, d1] = x
  const [y2, m2, d2] = y
  const M = MONTHS[lang]
  const n1 = M[m1 - 1] ?? ''
  const n2 = M[m2 - 1] ?? ''

  if (y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDay(y2, m2)) return lang === 'pt' ? `${n1} de ${y1}` : `${n1} ${y1}`
  if (y1 === y2 && m1 === m2 && d1 === d2) return lang === 'pt' ? `${dayPt(d1)} de ${n1} de ${y1}` : `${n1} ${d1}, ${y1}`

  if (lang === 'pt') {
    if (y1 === y2 && m1 === m2) return `${dayPt(d1)} a ${d2} de ${n1} de ${y1}`
    if (y1 === y2) return `${dayPt(d1)} de ${n1} a ${dayPt(d2)} de ${n2} de ${y1}`

    return `${dayPt(d1)} de ${n1} de ${y1} a ${dayPt(d2)} de ${n2} de ${y2}`
  }

  if (y1 === y2 && m1 === m2) return `${n1} ${d1}–${d2}, ${y1}`
  if (y1 === y2) return `${n1} ${d1} – ${n2} ${d2}, ${y1}`

  return `${n1} ${d1}, ${y1} – ${n2} ${d2}, ${y2}`
}

/** The same, starting with a capital letter, for a tile. */
export const capital = (s: string): string => (s ? s[0]?.toUpperCase() + s.slice(1) : s)

const ZONES: Record<string, Record<Lang, string>> = {
  'America/Sao_Paulo': { pt: 'horário de Brasília', en: 'Brasília time' },
  'America/Bahia': { pt: 'horário de Brasília', en: 'Brasília time' },
  'America/Recife': { pt: 'horário de Brasília', en: 'Brasília time' },
  'America/Fortaleza': { pt: 'horário de Brasília', en: 'Brasília time' },
  'America/Manaus': { pt: 'horário de Manaus', en: 'Manaus time' },
  'America/New_York': { pt: 'horário de Nova York', en: 'New York time' },
  'Europe/Lisbon': { pt: 'horário de Lisboa', en: 'Lisbon time' },
}

export const friendlyTimezone = (tz: string, lang: Lang): string => ZONES[tz]?.[lang] ?? tz

const MONEY: Record<string, Record<Lang, string>> = {
  BRL: { pt: 'real (R$)', en: 'Brazilian real (R$)' },
  USD: { pt: 'dólar (US$)', en: 'US dollar ($)' },
  EUR: { pt: 'euro (€)', en: 'euro (€)' },
  GBP: { pt: 'libra (£)', en: 'pound (£)' },
}

export const friendlyCurrency = (code: string, lang: Lang): string => MONEY[code.toUpperCase()]?.[lang] ?? code

// Order matters: the more specific names first ("cost per conversion" before "cost").
const COLUMNS: [RegExp, string, string][] = [
  [/^(date|day|data|dia|date_start|segments\.date)$/, 'Data', 'Date'],
  [/cpa|cost_?per_?conv|custo_?por_?conv/, 'Custo por conversão', 'Cost per conversion'],
  [/cpc|cost_?per_?click|custo_?por_?clique/, 'Custo por clique', 'Cost per click'],
  [/cpm/, 'CPM', 'CPM'],
  [/ctr/, 'Taxa de cliques', 'Click-through rate'],
  [/roas/, 'Retorno (ROAS)', 'Return (ROAS)'],
  [/spend|investimento|investido|gasto/, 'Investimento', 'Spend'],
  [/conversion_?value|revenue|receita|valor_?conv/, 'Receita', 'Revenue'],
  [/cost|custo/, 'Custo', 'Cost'],
  [/conversions?|convers/, 'Conversões', 'Conversions'],
  [/clicks?|cliques?/, 'Cliques', 'Clicks'],
  [/impressions?|impress/, 'Impressões', 'Impressions'],
  [/reach|alcance/, 'Alcance', 'Reach'],
  [/frequency|frequ/, 'Frequência', 'Frequency'],
  [/leads?/, 'Contatos (leads)', 'Leads'],
  [/search_?term|termo/, 'Termo pesquisado', 'Search term'],
  [/keyword|palavra/, 'Palavra-chave', 'Keyword'],
  [/campaign|campanha/, 'Campanha', 'Campaign'],
  [/ad_?set|ad_?group|conjunto|grupo/, 'Grupo / conjunto', 'Ad group / ad set'],
  [/^ads?$|ad_name|an[uú]ncio/, 'Anúncio', 'Ad'],
]

/** A column name a beginner can read: "cpa" → "Custo por conversão". Unknown names stay as they are. */
export const plainColumn = (col: string, lang: Lang): string => {
  const c = col.trim().toLowerCase()
  const hit = COLUMNS.find(([re]) => re.test(c))

  return hit ? (lang === 'pt' ? hit[1] : hit[2]) : col
}

const TERMS: [string, RegExp, string, string][] = [
  ['conversions', /^(conversions?|convers[õo]es)$/, 'Conversão: a ação que vale para você, como uma venda ou um contato.', 'Conversion: the action that counts for you, like a sale or a lead.'],
  ['cpa', /cpa|cost_?per_?conv|custo_?por_?conv/, 'Custo por conversão (CPA): quanto custou, em média, cada conversão.', 'Cost per conversion (CPA): what each conversion cost, on average.'],
  ['cpc', /cpc|cost_?per_?click/, 'Custo por clique (CPC): quanto custou, em média, cada clique.', 'Cost per click (CPC): what each click cost, on average.'],
  ['cpm', /cpm/, 'CPM: quanto custou mostrar o anúncio mil vezes.', 'CPM: what it cost to show the ad a thousand times.'],
  ['ctr', /ctr/, 'Taxa de cliques (CTR): de cada 100 pessoas que viram o anúncio, quantas clicaram.', 'Click-through rate (CTR): out of every 100 people who saw the ad, how many clicked.'],
  ['roas', /roas/, 'Retorno (ROAS): quanto voltou em vendas para cada 1 real investido.', 'Return on ad spend (ROAS): how much came back in sales for every 1 spent.'],
  ['impressions', /impressions?|impress[õo]es/, 'Impressões: quantas vezes o anúncio apareceu na tela de alguém.', 'Impressions: how many times the ad appeared on someone’s screen.'],
]

/** One plain sentence per metric in these columns, skipping terms already explained. */
export const glossary = (columns: string[], lang: Lang, seen: Set<string>): string[] => {
  const out: string[] = []

  for (const [key, re, pt, en] of TERMS) {
    if (seen.has(key)) continue
    if (!columns.some(c => re.test(c.trim().toLowerCase()))) continue
    seen.add(key)
    out.push(lang === 'pt' ? pt : en)
  }

  return out
}

/** What is happening right now, in one short sentence. */
export const nowLine = (review: Review | null, lang: Lang): string => {
  const t = strings(lang)

  if (review === null) return t.now_idle
  if (review.status === 'done') return t.now_done
  if (review.status === 'paused') return t.now_paused
  if (review.status === 'error') return t.now_error

  const step = review.steps.find(s => s.status === 'fetching' || s.status === 'analyzing')

  if (step) return step.status === 'fetching' ? t.now_fetching(step.label) : t.now_analyzing(step.label)
  if (review.status === 'running') return t.now_running

  return t.now_idle
}

/** "Step 4 of 5": the step in progress, or the next one, or the last done. */
export const stepPosition = (review: Review | null): [number, number] | undefined => {
  const steps = review?.steps ?? []

  if (steps.length === 0) return undefined

  const active = steps.findIndex(s => s.status === 'fetching' || s.status === 'analyzing' || s.status === 'error')
  const next = steps.findIndex(s => s.status === 'queued')
  const at = active >= 0 ? active : next >= 0 ? next : steps.length - 1

  return [at + 1, steps.length]
}

/** Numbers found, missing and calculated across every dataset. */
export const checkTotals = (review: Review | null): { found: number; missing: number; calculated: number } => {
  const all = review?.datasets ?? []

  return {
    found: all.reduce((a, d) => a + d.check.found, 0),
    missing: all.reduce((a, d) => a + d.check.missing, 0),
    calculated: all.reduce((a, d) => a + d.check.calculated, 0),
  }
}

// The first number a dataset could not find, named the way a person would say it.
const missingExample = (ds: Dataset, lang: Lang, currency?: string): string | undefined => {
  const cell = ds.check.missingCells[0]

  if (!cell) return undefined

  const [ri, ci] = cell.split(':').map(Number)
  const row = ds.rows[ri ?? -1]
  const col = ds.columns[ci ?? -1]

  if (!row || !col) return undefined

  const xIdx = Math.max(0, ds.columns.indexOf(ds.x ?? ds.columns[0] ?? ''))
  const label = String(row[xIdx] ?? '')
  const n = toNumber(row[ci ?? -1])
  const money = /spend|cost|cpa|cpc|cpm|revenue|valor|custo|investimento|receita|gasto/.test(col.toLowerCase())
  const value = n === undefined ? String(row[ci ?? -1]) : fmt(n, lang, money ? 'currency' : 'count', ds.currency ?? currency)
  const name = plainColumn(col, lang).toLowerCase()

  return lang === 'pt' ? `${name} de “${label}”: ${value}` : `${name} of “${label}”: ${value}`
}

const DATE_PAIR = /(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/

/** The alerts a beginner needs, in plain words, each with what to do next. Most serious first. */
export const plainAlerts = (review: Review, calls: CallLog[], lang: Lang): Alert[] => {
  const t = strings(lang)
  const out: Alert[] = []
  const period = review.periods[0]
  const main = period ? naturalRange(period.start, period.end, lang) : ''
  // A comparison is a period too: a query of last year's dates is inside it.
  const compare =
    period?.compareStart !== undefined && period.compareEnd !== undefined ? naturalRange(period.compareStart, period.compareEnd, lang) : ''
  const want = compare ? t.periodsBoth(main, compare) : main
  const list = compare ? t.periodsList(main, compare) : main

  for (const c of calls) {
    if (c.kind === 'write') out.push({ level: 'danger', title: t.a_write_t, body: t.a_write_b(c.n, c.label), todo: t.a_write_d })
    if (c.status === 'error' || c.status === 'denied') out.push({ level: 'danger', title: t.a_error_t, body: t.a_error_b(c.n), todo: t.a_error_d })
  }

  for (const ds of review.datasets) {
    if (ds.check.missing > 0) {
      out.push({
        level: 'warn',
        title: t.a_missing_t(ds.check.missing),
        body: t.a_missing_b(ds.title, ds.check.missing, missingExample(ds, lang, review.currency)),
        todo: t.a_missing_d(ds.title),
      })
    }
    if (ds.check.note === 'none-cited') out.push({ level: 'warn', title: t.a_unchecked_t, body: t.a_unchecked_b(ds.title), todo: t.a_unchecked_d })
  }

  for (const c of calls) {
    if (c.flags.includes('paging')) out.push({ level: 'warn', title: t.a_paging_t, body: t.a_paging_b(c.n), todo: t.a_paging_d })
    if (c.flags.includes('truncated')) out.push({ level: 'warn', title: t.a_trunc_t, body: t.a_trunc_b(c.n), todo: t.a_trunc_d })
    if (c.flags.includes('saved-unread')) out.push({ level: 'warn', title: t.a_saved_t, body: t.a_saved_b(c.n), todo: t.a_saved_d })
    if (c.flags.includes('sampled')) out.push({ level: 'info', title: t.a_sampled_t, body: t.a_sampled_b(c.n), todo: t.a_sampled_d })
    if (c.status === 'empty') out.push({ level: 'info', title: t.a_empty_t, body: t.a_empty_b(c.n, c.level ? levelName(lang, c.level) : ''), todo: t.a_empty_d })
  }

  if (review.periods.length > 0) {
    // Each period the review reports, the comparison included.
    const spans = spansOf(review.periods)

    // One alert per query. A range that holds a whole period is a wider pull,
    // often filtered later; a range that misses the periods is outside them.
    for (const c of calls) {
      const out1: string[] = []
      let isWider = true

      for (const d of c.dates) {
        const m = DATE_PAIR.exec(d)

        if (!m) continue

        const [, a = '', b = ''] = m

        if (isCovered(a, b, spans)) continue
        if (!spans.some(([s, e]) => a <= s && b >= e)) isWider = false
        out1.push(naturalRange(a, b, lang))
      }

      if (out1.length === 0) continue

      const got = out1.join('; ')

      out.push(
        isWider
          ? { level: 'info', title: t.a_wider_t, body: t.a_wider_b(c.n, got, list), todo: t.a_wider_d }
          : { level: 'info', title: t.a_dates_t, body: t.a_dates_b(c.n, got, want), todo: t.a_dates_d },
      )
    }
  }

  // What Claude itself flagged, as it wrote it.
  for (const w of review.warnings) out.push({ level: 'info', title: w })

  // Most serious first; the order within a level stays as found.
  const rank = { danger: 0, warn: 1, info: 2 }

  return out.sort((x, y) => rank[x.level] - rank[y.level])
}
