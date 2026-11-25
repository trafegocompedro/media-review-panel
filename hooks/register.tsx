import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, RenderElement, SvgProps, ToolCallResult } from 'claude-code'

import type { CallLog, CallStatus, Dataset, Lang, LaunchAlert, LaunchFact, LaunchPiece, Mood, Review, StepStatus, ViewMode } from '../types'
import { C, setThemeMode, barChart, beltChart, columnChart, fmt, lineChart, sparkline, textBar } from './charts'
import type { BeltStation } from './charts'
import { domainOf, findBefore, kindOf, liveScope, managerLink, missingOf, pieceOf, resultOf } from './launch'
import { buildDemo, buildLaunchDemo } from './demo'
import { digestOf, unitOf } from './digest'
import type { Digest, Metric, Total } from './digest'
import { checkAnswer } from './answer'
import { rowLabels, rowSums } from './rows'
import { OWN_TOOL, accountsIn, classify, classifyOutput, extract, numberIndex, parseScripts, platformOf, readResult, savedPath, toNumber } from './detect'
import { LEVELS, guessLang, levelName, mascotText, strings } from './i18n'
import type { MascotKey } from './i18n'
import { robot, robotText } from './mascot'
import { accountKey, answerWarnings, applyReport, autoWarnings, daysBetween, mergeAccount, newReview } from './review'
import {
  capital,
  checkTotals,
  factText,
  friendlyCurrency,
  friendlyTimezone,
  glossary,
  launchAlertText,
  launchWarnings,
  naturalRange,
  nowLine,
  pieceKindName,
  pieceStateText,
  plainAlerts,
  plainColumn,
  stepPosition,
} from './plain'

const PANE = 'media-review'
const SITE = 'https://trafegocompedro.com.br'
const LINKEDIN = 'https://www.linkedin.com/in/soupedrosimoes/'
const INSTAGRAM = 'https://www.instagram.com/trafegocompedro/'

// Change a shape tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const review = atom({ plugin: 'media-review-panel', key: 'review' } as const, null, { shape: 'review-2' })
const calls = atom({ plugin: 'media-review-panel', key: 'calls' } as const, [], { shape: 'calls-1' })
const mascot = atom({ plugin: 'media-review-panel', key: 'mascot' } as const, null, { shape: 'mascot-1' })
const collapsed = atom({ plugin: 'media-review-panel', key: 'collapsed' } as const, [])
const openCalls = atom({ plugin: 'media-review-panel', key: 'openCalls' } as const, [])
const openTables = atom({ plugin: 'media-review-panel', key: 'openTables' } as const, [])
const showAllCalls = atom({ plugin: 'media-review-panel', key: 'showAllCalls' } as const, false)
const muted = atom({ plugin: 'media-review-panel', key: 'muted' } as const, false)
const lang = atom({ plugin: 'media-review-panel', key: 'lang' } as const, 'en')
const counter = atom({ plugin: 'media-review-panel', key: 'counter' } as const, 0)
// Simple is the default: the panel is made for people new to paid media.
const mode = atom({ plugin: 'media-review-panel', key: 'mode' } as const, 'simple' as ViewMode)
// The pieces of a launch whose card is open, by call number.
const openPieces = atom({ plugin: 'media-review-panel', key: 'openPieces' } as const, [])

// Raw responses, kept in memory only for the source check (never stored or sent).
const sources = new Map<number, string>()
const MAX_SOURCE = 400_000
// The totals of each response's rows (per campaign, per day, overall), for the answer check.
const sourceSums = new Map<number, number[]>()
// The numbers of each named row (a campaign, a day), so a table cell is checked in its own row.
const sourceLabels = new Map<number, Map<string, number[]>>()
const keepSource = (n: number, text: string) => {
  const kept = text.length > MAX_SOURCE ? text.slice(0, MAX_SOURCE) : text

  sources.set(n, kept)
  try {
    sourceSums.set(n, rowSums(kept))
    sourceLabels.set(n, rowLabels(kept))
  } catch {
    sourceSums.set(n, [])
    sourceLabels.delete(n)
  }

  for (const k of [...sources.keys()]) {
    if (sources.size <= 80) break
    sources.delete(k)
    sourceSums.delete(k)
    sourceLabels.delete(k)
  }
}
const sourceText = (n: number) => sources.get(n)

// Everything else Claude read (a plan, a note, a sheet) and what the person wrote,
// kept in memory only: a number of the answer found there is not invented.
const others: string[] = []
const MAX_OTHER = 100_000
const keepOther = (text: string) => {
  if (text.trim() === '') return
  others.push(text.length > MAX_OTHER ? text.slice(0, MAX_OTHER) : text)
  if (others.length > 80) others.splice(0, others.length - 80)
}
const keepOtherResult = (r: ToolCallResult) => {
  try {
    if (r.deny === undefined && !r.isError) keepOther(textOf(r))
  } catch {
    // Keeping a copy must never change the call.
  }
}

// Whether this turn of the main loop read media data or reported to the panel:
// only then is its answer checked.
let touchedTurn = false

/** The saved file of a result too large for the model, or undefined when it can't be read. */
const readSaved = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  try {
    const text = await $.fs.read(path, { length: MAX_SOURCE })

    return typeof text === 'string' && text !== '' ? text : undefined
  } catch {
    return undefined
  }
}

const nudged = new Set<string>()

const textOf = (r: ToolCallResult): string =>
  typeof r.text === 'string' ? r.text : typeof r.result === 'string' ? r.result : ''

const REPORT_DESCRIPTION = [
  'Keeps the Media Review Panel current: a side panel the user watches to see what you read, as far as the panel recognizes it, while you analyze paid media (Google, Meta, TikTok, LinkedIn Ads). It changes nothing in any ad account.',
  'Call it with action "start" when a paid media analysis begins (title, accounts with platform/id/name, periods, the steps you plan); "update" as you go (step status queued|fetching|analyzing|done|error, the data level you are reading, datasets for charts, assumptions, warnings); "finish" at the end. "clear" empties the panel.',
  'Rules: report only values you actually retrieved in this session, copied from tool results. Never estimate, fill gaps or invent values: use null for a missing point. Say in warnings when data was sampled, truncated, paged or incomplete.',
  'Each dataset cites source_calls: the call numbers the panel gives in tool results ("logged as call #N"); cite the call that fetched the data, not a later one that only re-read it. List columns you computed with a formula (CPA, ROAS, CTR) in calculated_columns. The panel checks every other number against the raw responses and tells you what it could not find.',
  'A total you added up from several values (campaigns, days) is written in no response: send it in sums with its row, column and the parts you copied from the cited responses. The panel finds each part and checks the addition.',
  'periods: exactly the dates your numbers cover, the same in titles and datasets.',
  'Steps and datasets merge by id, accounts by id. Use plain numbers (no currency symbols) in rows.',
].join('\n')

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['start', 'update', 'finish', 'clear'] },
    title: { type: 'string' },
    language: { type: 'string', enum: ['en', 'pt-BR'], description: "The user's language" },
    accounts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads' },
          id: { type: 'string' },
          name: { type: 'string' },
          currency: { type: 'string' },
          timezone: { type: 'string' },
        },
        required: ['platform', 'id'],
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['queued', 'fetching', 'analyzing', 'done', 'error'] },
          note: { type: 'string' },
        },
        required: ['id', 'status'],
      },
    },
    level: {
      type: 'string',
      description: 'account, campaign, ad group / ad set, ad, keyword, search term, audience, placement (or another)',
    },
    periods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          start: { type: 'string', description: 'YYYY-MM-DD' },
          end: { type: 'string', description: 'YYYY-MM-DD' },
          compare_start: { type: 'string' },
          compare_end: { type: 'string' },
          timezone: { type: 'string' },
        },
        required: ['start', 'end'],
      },
    },
    attribution: { type: 'string', description: 'Attribution setting or conversion window as read from the account' },
    currency: { type: 'string' },
    datasets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          chart: { type: 'string', enum: ['line', 'bar', 'table'], description: 'line for a series over time, bar to compare items, table otherwise' },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array' }, description: 'One array per row, in column order; null for a missing value' },
          x: { type: 'string', description: 'The column with dates (line) or names (bar)' },
          series: { type: 'array', items: { type: 'string' }, description: 'Numeric columns to chart' },
          unit: { type: 'string', description: 'currency, %, count' },
          currency: { type: 'string' },
          source_calls: { type: 'array', items: { type: 'integer' } },
          calculated_columns: { type: 'array', items: { type: 'string' } },
          sums: {
            type: 'array',
            description: 'Totals you added up: the cell and the parts, as written in the cited responses',
            items: {
              type: 'object',
              properties: {
                row: { type: ['integer', 'string'], description: 'Row index from 0, or the value in the x column' },
                column: { type: 'string' },
                parts: { type: 'array', items: { type: 'number' } },
              },
              required: ['row', 'column', 'parts'],
            },
          },
          note: { type: 'string' },
        },
        required: ['id', 'title', 'chart', 'columns', 'rows', 'source_calls'],
      },
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['running', 'done', 'error'] },
  },
  required: ['action'],
}

// How long a quiet panel waits before Bip falls asleep.
const SLEEP_AFTER_MS = 10 * 60 * 1000

async function say($: EngineInterface, key: MascotKey, mood: Mood) {
  const at = await $.clock.now()
  await update($, mascot, () => ({ key, mood, at }))
}

const clock = (ms: number): string => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')

  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const STEP_GLYPH: Record<StepStatus, [string, string]> = {
  queued: ['○', C.dim],
  fetching: ['↓', C.accent],
  analyzing: ['◐', C.accent],
  done: ['✓', C.ok],
  error: ['✕', C.err],
}

const CALL_GLYPH: Record<CallStatus, [string, string]> = {
  running: ['…', C.accent],
  ok: ['✓', C.ok],
  empty: ['∅', C.warn],
  error: ['✕', C.err],
  denied: ['⊘', C.err],
}

const STATUS_COLOR: Record<Review['status'], string> = {
  idle: C.dim,
  running: C.accent,
  paused: C.warn,
  done: C.ok,
  error: C.err,
}

const badge = (platform: string): string => {
  const p = platform.toLowerCase()

  if (p.includes('google')) return 'GOOGLE'
  if (p.includes('meta') || p.includes('facebook')) return 'META'
  if (p.includes('tiktok')) return 'TIKTOK'
  if (p.includes('linkedin')) return 'LINKEDIN'
  if (p.includes('microsoft') || p.includes('bing')) return 'MSADS'

  return (platform.split(/\s/)[0] ?? 'ADS').toUpperCase().slice(0, 8)
}

const seriesUnit = (col: string, ds: Dataset): string => {
  const c = col.toLowerCase()

  if (/spend|cost|cpa|cpc|cpm|cpl|revenue|value|valor|custo|investimento|receita|gasto|budget|verba/.test(c)) return 'currency'
  if (/ctr|rate|taxa|percent|%|share/.test(c)) return '%'
  if (/roas/.test(c)) return 'x'
  if (ds.unit && ds.unit !== 'currency') return ds.unit

  return 'count'
}

const openedFor = new Set<string>()

async function loadDemo($: EngineInterface, isLaunch = false) {
  const demo = (isLaunch ? buildLaunchDemo : buildDemo)(await $.clock.now(), await read($, lang))
  sources.clear()
  for (const [k, v] of demo.sources) sources.set(k, v)
  await update($, review, () => demo.review)
  await update($, calls, () => demo.calls)
  await update($, counter, c => Math.max(c, demo.counter))
  if (isLaunch) await say($, 'm_launch', 'launch')
  else await say($, 'm_demo', 'demo')
  await openPane($)
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Media Review', ...(C.bg ? { backgroundColor: C.bg } : {}), columns: 72 })
}

async function maybeOpen($: EngineInterface, r: Review | null, autoOpen: boolean) {
  if (!autoOpen || r === null || openedFor.has(r.id)) return
  openedFor.add(r.id)
  await openPane($)
}

// The model's report: answered here, so it asks for no permission and runs nothing.
async function answerReport($: EngineInterface, input: Record<string, unknown>, langOption: Lang | 'auto', autoOpen: boolean) {
  const now = await $.clock.now()
  const action = input.action

  if (langOption === 'auto' && typeof input.language === 'string') {
    const l: Lang = input.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'
    await update($, lang, () => l)
  }

  if (action === 'clear') {
    await update($, review, () => null)
    await say($, 'm_clear', 'clean')

    return { result: 'Media Review Panel cleared.' }
  }

  const n = await read($, counter)
  let notes: string[] = []
  let moves: StepStatus[] = []
  let isFresh = false

  const r = await update($, review, cur => {
    let base = cur

    if (action === 'start') {
      const keep = cur !== null && cur.isAuto && !cur.isDemo && (cur.status === 'running' || cur.status === 'paused')
      base = keep && cur ? { ...cur, isAuto: false } : newReview(now, n + 1, false)
      isFresh = !keep
    } else if (cur === null || cur.isDemo) {
      base = newReview(now, cur === null ? 1 : n + 1, false)
      isFresh = true
    }

    const applied = applyReport(base as Review, input, now, sourceText)
    notes = applied.notes
    moves = applied.stepMoves

    return applied.review
  })

  if (action === 'start' || isFresh) {
    await say($, 'm_start', 'hello')
    openedFor.delete(r?.id ?? '')
    await maybeOpen($, r, autoOpen)
  } else if (r?.status === 'done') await say($, 'm_done', 'done')
  else if (moves.includes('error') || r?.status === 'error') await say($, 'm_error', 'oops')
  else if (r?.datasets.some(d => d.check.missing > 0) && notes.some(x => x.includes('Not found'))) await say($, 'm_check', 'sus')
  else if (Array.isArray(input.datasets) && input.datasets.length > 0) await say($, 'm_note', 'write')
  else if (moves.includes('done')) await say($, 'm_step', 'step')
  else if (moves.includes('analyzing')) await say($, 'm_analyze', 'look')
  else if (moves.includes('fetching')) await say($, 'm_fetch', 'fetch')

  const done = r?.steps.filter(s => s.status === 'done').length ?? 0
  const head = `Media Review Panel updated: ${r?.status ?? 'idle'}, ${done}/${r?.steps.length ?? 0} steps done, ${r?.datasets.length ?? 0} datasets.`

  return { result: [head, ...notes].join('\n') }
}


export const register: Register = (on, options) => {
  const autoOpen = options.autoOpen !== 'off'
  setThemeMode(options.theme === 'light' || options.theme === 'dark' ? options.theme : 'auto')
  const langOption = options.language === 'en' || options.language === 'pt' ? options.language : 'auto'
  // Your own data scripts, from your local settings only (never in the mod's files).
  const scripts = parseScripts(options.extraScripts)
  // Your own launch rules, from your local settings only.
  const budgetCap = (() => {
    const n = Number(String(options.budgetAlert ?? '').replace(',', '.').trim())

    return Number.isFinite(n) && n > 0 ? n : undefined
  })()
  const namePattern = (() => {
    const raw = String(options.namePattern ?? '').trim()

    if (raw === '') return undefined

    try {
      return new RegExp(raw)
    } catch {
      return undefined
    }
  })()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'media-review',
      description: 'Open the Media Review Panel (paid media transparency and debugging)',
      argumentHint: '[demo | demo launch | clear | simple | full | mute | unmute | en | pt]',
    })
    await $.tool.register({ name: 'report', description: REPORT_DESCRIPTION, inputSchema: REPORT_SCHEMA, isDeferred: true })

    const stored = await $.store.get('muted')

    if (typeof stored === 'boolean') await update($, muted, () => stored)
    else if (options.mascot === 'off') await update($, muted, () => true)

    if (langOption !== 'auto') await update($, lang, () => langOption)

    const storedMode = await $.store.get('mode')

    if (storedMode === 'simple' || storedMode === 'full') await update($, mode, () => storedMode)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // A number the person gave (a budget, a goal) is not invented when Claude repeats it.
    if (e.isMeta === undefined && typeof e.text === 'string') keepOther(e.text)

    if (langOption === 'auto' && e.command === undefined && e.isMeta === undefined) {
      const guess = guessLang(e.text)

      if (guess) await update($, lang, () => guess)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)

    if (tool === OWN_TOOL) {
      touchedTurn = true

      return answerReport($, input, langOption, autoOpen)
    }

    const current = await read($, review)
    const isActive = current !== null && !current.isDemo && (current.status === 'running' || current.status === 'paused')
    const before = classify(tool, input, isActive, scripts)

    if (before === undefined && tool !== 'Bash') {
      const other = await next(e)
      keepOtherResult(other)

      return other
    }

    // A terminal command the input did not give away is judged by what it printed.
    const startedAt = await $.clock.now()
    const early = before === undefined ? await next(e) : undefined
    const det = before ?? (early ? classifyOutput(String(input.command ?? ''), textOf(early)) : undefined)

    if (det === undefined) {
      const other = early ?? (await next(e))
      keepOtherResult(other)

      return other
    }

    touchedTurn = true
    const n = await update($, counter, c => c + 1)
    const x = extract(tool, input)
    const hadReview = current?.id

    const r = await update($, review, cur => {
      let base: Review =
        cur === null || cur.isDemo || cur.status === 'done' || cur.status === 'idle'
          ? newReview(startedAt, n, true)
          : { ...cur, status: 'running', updatedAt: startedAt }

      for (const id of x.accounts) {
        base = { ...base, accounts: mergeAccount(base.accounts, { platform: det.platform, id, origin: 'auto', calls: [n] }) }
      }

      if (x.level) {
        base = {
          ...base,
          level: x.level,
          levelOrigin: 'auto',
          levelsSeen: base.levelsSeen.includes(x.level) ? base.levelsSeen : [...base.levelsSeen, x.level],
        }
      }

      return base
    })
    const isNew = r !== null && r.id !== hadReview

    const entry: CallLog = {
      n,
      id: e.tool_use_id,
      tool,
      label: det.label,
      platform: det.platform,
      kind: det.kind,
      agentId: e.agentId,
      params: x.params,
      accounts: x.accounts,
      level: x.level,
      dates: x.dates,
      fields: x.fields.slice(0, 40),
      status: 'running',
      flags: [],
      startedAt,
      input: JSON.stringify(
        Object.fromEntries(Object.entries(input).filter(([k]) => !['tool', 'tool_use_id', 'agentId', 'requestMeta'].includes(k))),
        null,
        2,
      ).slice(0, 4000),
    }
    await update($, calls, list => [...list, entry].slice(-150))

    if (isNew) {
      await say($, 'm_start', 'hello')
      await maybeOpen($, r, autoOpen)
    }

    // A call that changes an account: its card is ready before you are asked to approve it.
    const pieceKind = det.kind === 'write' ? kindOf(tool) : undefined

    if (pieceKind !== undefined) {
      try {
        const rv0 = await read($, review)
        const lg0 = await read($, lang)
        const acct = String(input.ad_account_id ?? '').replace(/^act_/i, '')
        const logged = await read($, calls)
        const currency =
          rv0?.accounts.find(a => accountKey(a.id) === acct && a.currency)?.currency ?? rv0?.currency ?? logged.find(c => c.currency)?.currency
        const metaAccounts = (rv0?.accounts ?? []).filter(a => /meta|facebook/i.test(a.platform)).map(a => accountKey(a.id))
        const base = pieceOf(tool, input, {
          lang: lg0,
          currency,
          budgetCap,
          namePattern,
          accounts: metaAccounts,
          before: (id, field) => findBefore([...sources.values()], id, field),
        })
        const isLink = (f: LaunchFact): f is Extract<LaunchFact, { k: 'link' }> => f.k === 'link'
        const earlier = (rv0?.launch ?? []).flatMap(p => p.facts.filter(isLink).map(f => domainOf(f.url)))
        const link = base.facts.find(isLink)

        if (link && earlier.length > 0 && !earlier.includes(domainOf(link.url))) base.alerts.push({ level: 'info', code: 'otherDomain', v: domainOf(link.url) })

        const piece: LaunchPiece = { ...base, n, at: startedAt, platform: det.platform, state: 'waiting' }

        await update($, review, cur => (cur === null ? cur : { ...cur, launch: [...(cur.launch ?? []), piece].slice(-40) }))
        // The first piece, and every go-live, put the panel in front: that is when you approve.
        if (autoOpen && (pieceKind === 'activate' || (rv0?.launch ?? []).length === 0)) await openPane($)
      } catch {
        // The card is extra: the call goes on without it.
      }

      if (pieceKind === 'activate') await say($, 'm_launch', 'launch')
      else if (pieceKind === 'delete' || pieceKind === 'other') await say($, 'm_write', 'alert')
      else await say($, 'm_build', 'build')
    }

    const ran = early ?? (await next(e))
    const ms = (await $.clock.now()) - startedAt
    const done: Partial<CallLog> = { ms }

    if (ran.deny !== undefined) {
      done.status = 'denied'
      done.error = ran.deny.slice(0, 400)
    } else if (ran.isError) {
      done.status = 'error'
      done.error = (ran.text ?? String(ran.result ?? '')).slice(0, 400)
    } else {
      const text = ran.text ?? (typeof ran.result === 'string' ? ran.result : JSON.stringify(ran.result ?? ''))
      // A result too large for the model was saved to a file, and the model
      // got only where: the numbers are in the file, so the check reads it.
      const saved = savedPath(text)
      const file = saved === undefined ? undefined : await readSaved($, saved)
      const body = file ?? text

      if (saved === undefined || file !== undefined) keepSource(n, file === undefined ? text : `${text}\n${file}`)

      const facts = readResult(body)
      done.chars = body.length
      done.rows = facts.rows
      done.rowsApprox = facts.rowsApprox
      done.flags = saved === undefined ? facts.flags : [...facts.flags, file === undefined ? 'saved-unread' : 'saved']
      done.currency = facts.currency
      done.timezone = facts.timezone

      if (/^\s*\{\s*"error"\s*:/.test(text)) {
        done.status = 'error'
        done.error = text.slice(0, 400)
      } else done.status = facts.rows === 0 ? 'empty' : 'ok'

      // A script names neither its platform nor its account in the command:
      // read them off what it printed.
      if (tool === 'Bash') {
        if (det.platform === 'Ads') done.platform = platformOf(body.slice(0, 20_000))
        if (x.accounts.length === 0) done.accounts = [...new Set(accountsIn(body.slice(0, 200_000)))].slice(0, 12)
      }
    }

    await update($, calls, list => list.map(c => (c.n === n ? { ...c, ...done } : c)))

    if (pieceKind !== undefined) {
      const raw = ran.text ?? (typeof ran.result === 'string' ? ran.result : JSON.stringify(ran.result ?? ''))
      const res = ran.deny === undefined && !ran.isError ? resultOf(pieceKind, raw) : undefined
      const state: LaunchPiece['state'] =
        ran.deny !== undefined ? 'denied' : ran.isError || done.status === 'error' || res?.error !== undefined ? 'error' : 'ok'
      const extra: LaunchAlert[] = []

      if (state === 'denied') extra.push({ level: 'info', code: 'denied' })
      if (state === 'error') extra.push({ level: 'danger', code: 'refused', v: (res?.error ?? done.error ?? raw).slice(0, 240) })
      if (res && res.errors > 0) extra.push({ level: 'warn', code: 'validation', n: res.errors })
      if (state === 'ok' && res?.result === 'ACTIVE' && ['campaign', 'adset', 'ad', 'boost'].includes(pieceKind)) extra.push({ level: 'danger', code: 'bornActive' })

      await update($, review, cur =>
        cur === null
          ? cur
          : {
              ...cur,
              launch: (cur.launch ?? []).map(p => (p.n === n ? { ...p, state, id: res?.id ?? p.id, result: res?.result ?? p.result, alerts: [...p.alerts, ...extra] } : p)),
            },
      )
    }

    // A script's command named its account but not its platform: the output did.
    if (det.platform === 'Ads' && done.platform !== undefined && done.platform !== 'Ads' && x.accounts.length > 0) {
      const platform = done.platform

      await update($, review, cur => {
        if (cur === null) return cur

        let accounts = cur.accounts

        for (const id of x.accounts) accounts = mergeAccount(accounts, { platform, id, origin: 'auto', calls: [n] })

        return { ...cur, accounts }
      })
    }

    if (done.accounts && done.accounts.length > 0) {
      const found = done.accounts
      const platform = done.platform ?? det.platform
      await update($, review, cur => {
        if (cur === null) return cur

        let accounts = cur.accounts

        for (const id of found) accounts = mergeAccount(accounts, { platform, id, origin: 'auto', calls: [n] })

        return { ...cur, accounts }
      })
    }

    if ((done.currency || done.timezone) && x.accounts.length === 1) {
      await update($, review, cur =>
        cur === null
          ? cur
          : {
              ...cur,
              accounts: mergeAccount(cur.accounts, {
                platform: det.platform,
                id: x.accounts[0] ?? '',
                currency: done.currency,
                timezone: done.timezone,
                origin: 'auto',
                calls: [n],
              }),
            },
      )
    }

    const m = await read($, mascot)

    if (pieceKind !== undefined && (done.status === 'error' || ran.deny !== undefined)) await say($, 'm_error', 'oops')
    else if (pieceKind === 'activate') await say($, 'm_live', 'launch')
    else if (pieceKind === 'delete' || pieceKind === 'other') await say($, 'm_write', 'alert')
    else if (pieceKind !== undefined) await say($, 'm_built', 'build')
    else if (done.status === 'error' || done.status === 'denied') await say($, 'm_error', 'oops')
    else if (done.status === 'empty') await say($, 'm_empty', 'empty')
    else if (!isNew && (m === null || m.key === 'm_start' || m.key === 'm_paused' || m.key === 'm_hello')) await say($, 'm_fetch', 'fetch')

    if (ran.deny !== undefined || ran.isError) return ran

    const latest = await read($, review)
    const shouldNudge = latest !== null && latest.reports === 0 && !nudged.has(latest.id)

    if (shouldNudge && latest) nudged.add(latest.id)

    const note = shouldNudge
      ? `[Media Review Panel] The user is watching a side panel for this paid media analysis. This call is logged as call #${n}. Load the panel's tool (ToolSearch "select:${OWN_TOOL}") and call it with action "start" (title, accounts, periods, planned steps), then "update" as you go (step status, data level, datasets citing source_calls by these call numbers, assumptions, warnings), and "finish" at the end. Report only retrieved values.`
      : `[Media Review Panel] logged as call #${n}.`

    return { ...ran, context: [...(ran.context ?? []), note] }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // The answer is what reaches a client: every number in it is looked up in
    // what this review read. Only the main loop's answer, and only after a turn
    // that read media data or reported to the panel.
    let isSuspect = false

    if (e.agentId === undefined) {
      const touched = touchedTurn
      touchedTurn = false
      const cur = await read($, review)

      if (touched && !e.isAborted && cur !== null && !cur.isDemo && typeof e.answer === 'string' && e.answer.trim() !== '') {
        // What Claude said before is no new source, but repeating it is no new claim either.
        const said = e.answer

        const list = await read($, calls)
        const inReview = list.filter(c => c.n >= cur.firstCall)
        const media = inReview.map(c => sources.get(c.n)).filter((x): x is string => x !== undefined)
        const sums = inReview.flatMap(c => sourceSums.get(c.n) ?? []).sort((a, b) => a - b)
        const labels = new Map<string, number[]>()

        for (const c of inReview) {
          for (const [k, v] of sourceLabels.get(c.n) ?? []) labels.set(k, [...(labels.get(k) ?? []), ...v])
        }
        for (const [k, v] of labels) labels.set(k, v.sort((a, b) => a - b))

        if (media.length > 0) {
          const at = await $.clock.now()
          const lg = await read($, lang)
          const check = checkAnswer(e.answer, numberIndex(media.join('\n')), numberIndex(others.join('\n')), at, lg, sums, labels)

          await update($, review, rv => (rv === null || rv.id !== cur.id ? rv : { ...rv, answer: check }))

          keepOther(said)

          if (check.missing.length > 0) {
            isSuspect = true
            await say($, 'm_answer', 'sus')

            try {
              await $.ui.toast(strings(lg).toastAnswer(check.missing.length))
            } catch {
              // A surface without toasts still has the panel.
            }
          }
        }
      }
    }

    const r = await read($, review)

    if (r !== null && r.status === 'running' && !r.isDemo) {
      await update($, review, cur => (cur === null ? cur : { ...cur, status: 'paused' as const }))
      if (!isSuspect) await say($, 'm_paused', 'pause')
    }

    return next(e)
  })

  on('command.run', { command: 'media-review' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const t = strings(await read($, lang))

    if (arg === 'demo') {
      await loadDemo($)

      return { text: `Media Review Panel: ${t.sample}` }
    }

    if (arg === 'demo launch' || arg === 'demo subida') {
      await loadDemo($, true)

      return { text: `Media Review Panel: ${t.sample}` }
    }

    if (arg === 'clear') {
      await update($, review, () => null)
      await update($, calls, () => [])
      await say($, 'm_clear', 'clean')

      return { text: 'Media Review Panel cleared.' }
    }

    if (arg === 'mute' || arg === 'unmute') {
      const value = arg === 'mute'
      await update($, muted, () => value)
      await $.store.set('muted', value)

      return { text: value ? 'Mascot muted.' : 'Mascot back on.' }
    }

    if (arg === 'simple' || arg === 'simples' || arg === 'full' || arg === 'completo') {
      const value: ViewMode = arg === 'simple' || arg === 'simples' ? 'simple' : 'full'
      await update($, mode, () => value)
      await $.store.set('mode', value)
      await openPane($)

      return { text: value === 'simple' ? `Media Review Panel: ${t.modeSimple}.` : `Media Review Panel: ${t.modeFull}.` }
    }

    if (arg === 'en' || arg === 'pt') {
      await update($, lang, () => arg)

      return { text: arg === 'pt' ? 'Painel em português.' : 'Panel in English.' }
    }

    if (arg !== '') {
      return { text: 'Usage: /media-review [demo | demo launch | clear | simple | full | mute | unmute | en | pt]' }
    }

    if ((await read($, mascot)) === null) await say($, 'm_hello', 'hello')
    await openPane($)

    return { text: 'Media Review Panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const E = $.ui.resolve(e)
    const { Box, Text, Button, Link, Code, Progress } = E
    const Svg = e.surface === 'terminal' ? undefined : (E as { Svg?: ElementConstructor<SvgProps> }).Svg
    const [rv, allCalls, m, col, oc, isMuted, lg, tables, allCallsShown, view, openP] = await Promise.all([
      read($, review),
      read($, calls),
      read($, mascot),
      read($, collapsed),
      read($, openCalls),
      read($, muted),
      read($, lang),
      read($, openTables),
      read($, showAllCalls),
      read($, mode),
      read($, openPieces),
    ])
    const t = strings(lg)
    const isSimple = view === 'simple'
    const chartW = Math.round(Math.min(560, Math.max(240, e.props.bodyColumns * 7.2 - 28)))
    const list = rv === null ? [] : allCalls.filter(c => c.n >= rv.firstCall)
    const status = rv?.status ?? 'idle'
    const statusColor = STATUS_COLOR[status]
    const steps = rv?.steps ?? []
    const stepsDone = steps.filter(s => s.status === 'done').length
    // Left alone with nothing running for a while, Bip falls asleep.
    const isAsleep = m !== null && rv?.status !== 'running' && (await $.clock.now()) - m.at > SLEEP_AFTER_MS
    const mood: Mood = isAsleep ? 'sleep' : (m?.mood ?? 'hello')
    const bubble = mascotText(lg, isAsleep ? 'm_sleep' : (m?.key ?? 'm_hello'))
    // What needs a second look, found by the panel or reported by Claude.
    const alerts = rv === null ? [] : [...launchWarnings(rv, lg), ...answerWarnings(rv, lg), ...rv.warnings, ...autoWarnings(rv, list, lg)]
    const statusWord = t[`status_${status}` as 'status_idle']
    const isLaunchOnly = rv !== null && (rv.launch ?? []).length > 0 && rv.datasets.length === 0 && rv.periods.length === 0
    const title = rv?.title ?? (isLaunchOnly ? t.launchTitle : rv?.isAuto ? t.autoTitle : t.untitled)
    const progress =
      steps.length > 0 ? (
        <Progress label={t.sec_status} value={stepsDone} max={steps.length} valueText={t.stepsDone(stepsDone, steps.length)} color={C.accent} />
      ) : status === 'running' ? (
        <Progress label={t.sec_status} valueText={t.noStepsYet} color={C.accent} />
      ) : null

    const mascotArt = (size: number) =>
      Svg ? (
        <Svg source={robot(mood)} alt="Bip, the panel's robot" isInteractive width={size} height={size} />
      ) : (
        <Text color={C.accent} mono>
          {robotText(mood)}
        </Text>
      )

    // The small form of a minimized pane: what reads at a glance.
    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column" backgroundColor={C.bg} padding={1} gap={1}>
          <Box flexDirection="row" gap={1} alignItems="center">
            {!isMuted && mascotArt(28)}
            <Box flexDirection="column" flexShrink={1}>
              <Text color={C.bright} weight="semibold" wrap="truncate-end">
                {title}
              </Text>
              <Text color={statusColor} mono={!isSimple} size="caption">
                ● {isSimple ? nowLine(rv, lg) : statusWord}
              </Text>
            </Box>
          </Box>
          {progress}
          <Text color={C.dim} size="caption">
            {t.madeBy}
          </Text>
        </Box>
      )
    }

    const toggle = (id: string) =>
      update($, collapsed, cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))

    const section = (id: string, name: string, count: string | undefined, body: () => RenderElement | RenderElement[]) => {
      const isOpen = !col.includes(id)
      const label = (
        <Text color={C.muted} weight="semibold" size="caption">
          {isOpen ? '▾ ' : '▸ '}
          {name.toUpperCase()}
        </Text>
      )

      return (
        <Box flexDirection="column" borderStyle="single" borderColor={C.border} backgroundColor={C.card} paddingX={1} gap={1}>
          <Button key={`sec-${id}`} plain onPress={() => toggle(id)}>
            {label}
            {count !== undefined ? (
              <Text color={C.dim} size="caption" mono>
                {'  '}
                {count}
              </Text>
            ) : (
              ''
            )}
          </Button>
          {isOpen ? body() : null}
        </Box>
      )
    }

    const muteDim = (text: string) => (
      <Text color={C.dim} size="footnote">
        {text}
      </Text>
    )

    const kv = (k: string, v: string, color: string = C.text) => (
      <Box flexDirection="row" gap={1}>
        <Box width={13}>
          <Text color={C.dim} size="footnote">
            {k}
          </Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={color} mono size="footnote">
            {v}
          </Text>
        </Box>
      </Box>
    )

    // 1. Accounts
    const accountsBody = () => {
      const accounts = rv?.accounts ?? []

      if (accounts.length === 0) return muteDim(t.noAccounts)

      return accounts.map(a => (
        <Box flexDirection="row" gap={1}>
          <Box width={9}>
            <Text color={C.accent} mono size="caption" weight="semibold">
              {badge(a.platform)}
            </Text>
          </Box>
          <Box flexDirection="column" flexShrink={1}>
            <Text color={a.name ? C.bright : C.dim} italic={!a.name}>
              {a.name ?? t.nameMissing}
            </Text>
            <Text color={C.muted} mono size="caption">
              {[a.id, a.currency, a.timezone, a.origin === 'auto' ? t.auto : undefined, a.calls.length ? `#${a.calls.join(' #')}` : undefined]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Box>
        </Box>
      ))
    }

    // 2. Status
    const statusBody = () => {
      const rows: RenderElement[] = []

      if (progress) rows.push(progress)
      if (steps.length === 0) rows.push(muteDim(t.noSteps))

      for (const s of steps) {
        const [glyph, color] = STEP_GLYPH[s.status]
        rows.push(
          <Box flexDirection="row" gap={1}>
            <Box width={2}>
              <Text color={color} mono>
                {glyph}
              </Text>
            </Box>
            <Box flexDirection="column" flexShrink={1}>
              <Text color={s.status === 'queued' ? C.muted : C.text}>
                {s.label}{' '}
                <Text color={color} mono size="caption">
                  {s.status.toUpperCase()}
                </Text>
              </Text>
              {s.note ? muteDim(s.note) : null}
            </Box>
          </Box>,
        )
      }

      return rows
    }

    // 3. Data level
    const levelBody = () => {
      const current = rv?.level
      const seen = rv?.levelsSeen ?? []
      const extra = seen.filter(l => !(LEVELS as readonly string[]).includes(l))
      const chips = [...LEVELS, ...extra].map(l => {
        const isNow = l === current
        const wasSeen = seen.includes(l)

        return (
          <Text
            mono
            size="caption"
            color={isNow ? C.onAccent : wasSeen ? C.chipText : C.dim}
            backgroundColor={isNow ? C.fill : wasSeen ? C.chip : undefined}
          >
            {` ${isNow ? '● ' : wasSeen ? '✓ ' : ''}${levelName(lg, l)} `}
          </Text>
        )
      })

      return [
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {chips}
        </Box>,
        current
          ? muteDim(`${t.levelCurrent}: ${levelName(lg, current)} · ${rv?.levelOrigin === 'reported' ? t.levelReported : t.levelFromCall}`)
          : muteDim(t.levelNone),
        seen.length > 0 ? muteDim(t.levelLegend) : null,
      ].filter((x): x is RenderElement => x !== null)
    }

    // 4. Time periods
    const periodsBody = () => {
      const out: RenderElement[] = []
      const periods = rv?.periods ?? []

      if (periods.length === 0) out.push(muteDim(t.noPeriod))

      for (const p of periods) {
        const d = daysBetween(p.start, p.end)
        out.push(kv(p.label ? `${t.range} · ${p.label}` : t.range, `${p.start} → ${p.end}${d ? ` (${t.days(d)})` : ''}`, C.bright))

        if (p.compareStart && p.compareEnd) {
          const c = daysBetween(p.compareStart, p.compareEnd)
          out.push(kv(t.compare, `${p.compareStart} → ${p.compareEnd}${c ? ` (${t.days(c)})` : ''}`))
        }
      }

      const tz = periods.find(p => p.timezone)?.timezone ?? rv?.accounts.find(a => a.timezone)?.timezone
      out.push(kv(t.timezone, tz ?? t.notReported, tz ? C.text : C.dim))
      out.push(kv(t.attribution, rv?.attribution ?? t.notReported, rv?.attribution ? C.text : C.dim))

      const cur = rv?.currency ?? rv?.accounts.find(a => a.currency)?.currency
      out.push(kv(t.currency, cur ?? t.notReported, cur ? C.text : C.dim))

      const seen = list.filter(c => c.dates.length > 0)

      if (seen.length > 0) {
        out.push(
          <Text color={C.dim} size="caption" weight="semibold">
            {t.datesSeen.toUpperCase()}
          </Text>,
        )
        for (const c of seen.slice(-8)) {
          out.push(
            <Text mono size="caption" color={C.muted}>
              #{c.n} {c.dates.join(' · ')}
            </Text>,
          )
        }
      }

      return out
    }

    // 5. Data visuals
    const checkLine = (ds: Dataset) => {
      const c = ds.check
      const color = c.missing > 0 ? C.err : c.note ? C.warn : C.ok
      const sourceTxt = ds.sourceCalls.length ? `${t.source} #${ds.sourceCalls.join(' #')}` : t.noSource
      const parts = [`${c.found} ${t.found}`, `${c.missing} ${t.missing}`]

      if (c.summed) parts.push(t.bySum(c.summed))
      if (c.common) parts.push(`${c.common} ${t.common}`)
      if (c.calculated) parts.push(`${c.calculated} ${t.calculated}`)
      if (c.unchecked) parts.push(`${c.unchecked} ${t.unchecked}`)

      return (
        <Text mono size="caption" color={C.dim}>
          {sourceTxt} · {t.check}: <Text color={color}>{parts.join(' · ')}</Text>
        </Text>
      )
    }

    const tableOf = (ds: Dataset, simple = false) => {
      const shown = ds.rows.slice(0, 25)
      const xIdx = Math.max(0, ds.columns.indexOf(ds.x ?? ds.columns[0] ?? ''))
      const missing = new Set(ds.check.missingCells)
      const common = new Set(ds.check.commonCells ?? [])
      const isCalc = (ci: number) => ds.calculated.includes(ds.columns[ci] ?? '')
      const head = (h: string, ci: number) => {
        const name = simple ? plainColumn(h, lg) : h

        return isCalc(ci) ? `${name}*` : name
      }
      // A mark beside the color, so a reader who can't tell the red still sees it.
      const cellText = (v: unknown, ci: number, ri: number): string => {
        if (v === null || v === undefined) return '—'
        if (ci === xIdx) return String(v)

        const n = toNumber(v)
        const text = n === undefined ? String(v) : fmt(n, lg, seriesUnit(ds.columns[ci] ?? '', ds), ds.currency ?? rv?.currency)

        return missing.has(`${ri}:${ci}`) ? `${text}!` : common.has(`${ri}:${ci}`) ? `${text}?` : text
      }
      const widths = ds.columns.map((h, ci) =>
        Math.min(ci === xIdx ? 30 : 16, Math.max(head(h, ci).length, ...shown.map((r, ri) => cellText(r[ci], ci, ri).length))),
      )
      const hasMissing = shown.some((r, ri) => ds.columns.some((_, ci) => missing.has(`${ri}:${ci}`)))
      const hasCalc = ds.columns.some((_, ci) => isCalc(ci))
      const hasCommon = shown.some((r, ri) => ds.columns.some((_, ci) => common.has(`${ri}:${ci}`)))
      const pad = (s: string, w: number, right: boolean) => {
        const cut = s.length > w ? `${s.slice(0, w - 1)}…` : s

        return right ? cut.padStart(w) : cut.padEnd(w)
      }

      return (
        <Box flexDirection="column" overflowX="scroll">
          <Text mono size="caption" color={C.dim}>
            {ds.columns.map((h, ci) => pad(head(h, ci), widths[ci] ?? 8, ci !== xIdx)).join('  ')}
          </Text>
          {shown.map((row, ri) => (
            <Text mono size="caption" color={C.text}>
              {ds.columns.map((_, ci) => (
                <Text color={missing.has(`${ri}:${ci}`) ? C.err : isCalc(ci) || common.has(`${ri}:${ci}`) ? C.muted : C.text}>
                  {pad(cellText(row[ci], ci, ri), widths[ci] ?? 8, ci !== xIdx)}
                  {ci < ds.columns.length - 1 ? '  ' : ''}
                </Text>
              ))}
            </Text>
          ))}
          {ds.totalRows > shown.length ? muteDim(t.showing(shown.length, ds.totalRows)) : null}
          {hasMissing ? muteDim(t.missingLegend) : null}
          {hasCommon ? muteDim(t.commonLegend) : null}
          {hasCalc ? muteDim(t.calcLegend) : null}
        </Box>
      )
    }

    const chartsOf = (ds: Dataset, simple = false) => {
      const xName = ds.x ?? ds.columns[0] ?? ''
      const xIdx = Math.max(0, ds.columns.indexOf(xName))
      const numeric = ds.columns.filter((c, i) => i !== xIdx && ds.rows.some(r => toNumber(r[i]) !== undefined))
      const series = (ds.series && ds.series.length ? ds.series : numeric).slice(0, 4)
      const out: RenderElement[] = []

      for (const s of series) {
        const si = ds.columns.indexOf(s)
        const unit = seriesUnit(s, ds)
        const cur = ds.currency ?? rv?.currency
        const tip = (v: number) => fmt(v, lg, unit, cur)

        if (ds.chart === 'line') {
          const labels = ds.rows.map(r => String(r[xIdx] ?? ''))
          const values = ds.rows.map(r => toNumber(r[si]) ?? null)
          const nums = values.filter((v): v is number => v !== null)
          const gaps = values.length - nums.length
          const sum = nums.reduce((a, b) => a + b, 0)
          const stats = [
            unit === 'currency' || unit === 'count' ? `${t.sum} ${tip(sum)}` : undefined,
            nums.length ? `${t.min} ${tip(Math.min(...nums))}` : undefined,
            nums.length ? `${t.max} ${tip(Math.max(...nums))}` : undefined,
          ].filter(Boolean)

          out.push(
            <Box flexDirection="column">
              <Text size="footnote" color={C.text} weight="medium">
                {simple ? plainColumn(s, lg) : s}{' '}
                {simple ? '' : <Text color={C.dim} mono size="caption">{stats.join(' · ')}</Text>}
              </Text>
              {Svg ? (
                <Svg source={lineChart({ labels, values, name: s, tip, width: chartW })} alt={`${ds.title}: ${s} by ${xName}`} isInteractive />
              ) : (
                <Text mono color={C.accent}>
                  {sparkline(values)}
                </Text>
              )}
              {gaps > 0 ? muteDim(t.gaps(gaps)) : null}
            </Box>,
          )
        } else {
          const pairs = ds.rows
            .map(r => ({ label: String(r[xIdx] ?? ''), v: toNumber(r[si]) ?? null }))
            .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
          const top = pairs.slice(0, 12)
          const max = Math.max(0, ...top.map(p => p.v ?? 0))

          out.push(
            <Box flexDirection="column">
              <Text size="footnote" color={C.text} weight="medium">
                {simple ? plainColumn(s, lg) : s}
                {ds.calculated.includes(s) ? <Text color={C.dim} size="caption"> ({t.calculated})</Text> : ''}
              </Text>
              {Svg ? (
                <Svg
                  source={barChart({ labels: top.map(p => p.label), values: top.map(p => p.v), name: s, tip, width: chartW })}
                  alt={`${ds.title}: ${s} by ${xName}`}
                  isInteractive
                />
              ) : (
                <Box flexDirection="column">
                  {top.map(p => (
                    <Text mono size="caption">
                      {p.label.slice(0, 22).padEnd(22)} <Text color={C.accent}>{textBar(p.v ?? 0, max, 16)}</Text> {p.v === null ? '—' : tip(p.v)}
                    </Text>
                  ))}
                </Box>
              )}
              {pairs.length > top.length ? muteDim(t.showing(top.length, pairs.length)) : null}
            </Box>,
          )
        }
      }

      return out
    }

    const visualsBody = () => {
      const datasets = rv?.datasets ?? []

      if (datasets.length === 0) return muteDim(t.noData)

      return datasets.map(ds => (
        <Box flexDirection="column" borderStyle="single" borderColor={C.border2} paddingX={1} gap={1}>
          <Box flexDirection="column">
            <Text color={C.bright} weight="semibold">
              {ds.title}
            </Text>
            {checkLine(ds)}
          </Box>
          {ds.chart === 'table' ? tableOf(ds) : chartsOf(ds)}
          {ds.chart !== 'table' ? (
            <Button
              key={`tbl-${ds.id}`}
              plain
              dimColor
              onPress={() => update($, openTables, cur => (cur.includes(ds.id) ? cur.filter(x => x !== ds.id) : [...cur, ds.id]))}
            >
              {tables.includes(ds.id) ? `▾ ${t.hideTable}` : `▸ ${t.showTable}`}
            </Button>
          ) : null}
          {ds.chart !== 'table' && tables.includes(ds.id) ? tableOf(ds) : null}
          {ds.note ? muteDim(ds.note) : null}
        </Box>
      ))
    }

    // 6. Debug & validation
    const debugBody = () => {
      const out: RenderElement[] = []
      const errors = list.filter(c => c.status === 'error' || c.status === 'denied').length
      const empty = list.filter(c => c.status === 'empty').length
      const writes = list.filter(c => c.kind === 'write').length
      const rows = list.reduce((a, c) => a + (c.rows ?? 0), 0)

      out.push(
        <Text mono size="caption" color={C.text}>
          {list.length} {t.calls} · <Text color={errors ? C.err : C.text}>{errors} {t.errors}</Text> ·{' '}
          <Text color={empty ? C.warn : C.text}>
            {empty} {t.empty}
          </Text>{' '}
          · <Text color={writes ? C.err : C.text}>{writes} {t.writes}</Text> · {rows} {t.rows}
        </Text>,
      )

      const warnings = [...(rv?.isDemo ? [t.sample] : []), ...alerts]

      if (warnings.length > 0) {
        out.push(
          <Text color={C.dim} size="caption" weight="semibold">
            {t.warnings.toUpperCase()}
          </Text>,
        )
        for (const w of warnings) {
          out.push(
            <Text size="footnote" color={C.text}>
              <Text color={C.warn}>⚠ </Text>
              {w}
            </Text>,
          )
        }
      }

      if (rv && rv.assumptions.length > 0) {
        out.push(
          <Text color={C.dim} size="caption" weight="semibold">
            {t.assumptions.toUpperCase()}
          </Text>,
        )
        for (const a of rv.assumptions) {
          out.push(
            <Text size="footnote" color={C.text}>
              <Text color={C.dim}>• </Text>
              {a}
            </Text>,
          )
        }
      }

      out.push(
        <Text color={C.dim} size="caption" weight="semibold">
          {t.callLog.toUpperCase()}
        </Text>,
      )

      if (list.length === 0) out.push(muteDim(t.noCalls))

      // The newest first; the rest one press away, so a long review stays readable.
      const SHOWN = 12
      const visible = [...list].reverse().slice(0, allCallsShown ? 150 : SHOWN)

      for (const c of visible) {
        const [glyph, color] = CALL_GLYPH[c.status]
        const isOpen = oc.includes(c.n)
        const facts = [
          c.platform,
          c.accounts.slice(0, 3).join(', '),
          c.level ? levelName(lg, c.level) : undefined,
          c.dates[0],
          c.agentId ? t.subagent : undefined,
        ].filter(Boolean)
        const rowsTxt = c.rows === undefined ? '' : `${c.rowsApprox ? '≈' : ''}${c.rows} ${t.rows}`
        const timing = c.ms === undefined ? '' : `${(c.ms / 1000).toFixed(1)}s`

        out.push(
          <Box flexDirection="column" borderStyle="single" borderColor={c.kind === 'write' ? C.err : C.border} paddingX={1}>
            <Button
              key={`call-${c.n}`}
              plain
              onPress={() => update($, openCalls, cur => (cur.includes(c.n) ? cur.filter(x => x !== c.n) : [...cur, c.n].slice(-20)))}
            >
              <Text color={C.dim} mono size="caption">
                {isOpen ? '▾ ' : '▸ '}
              </Text>
              <Text color={color} mono>
                {glyph}{' '}
              </Text>
              <Text color={C.dim} mono size="caption">
                #{c.n} {clock(c.startedAt)}{' '}
              </Text>
              <Text color={C.bright} mono size="caption">
                {c.label}{' '}
              </Text>
              <Text color={C.muted} mono size="caption">
                {[rowsTxt, timing].filter(Boolean).join(' · ')}
              </Text>
            </Button>
            {facts.length ? (
              <Text mono size="caption" color={C.muted}>
                {facts.join(' · ')}
              </Text>
            ) : null}
            {c.fields.length ? (
              <Text mono size="caption" color={C.dim} maxLines={2}>
                fields: {c.fields.join(', ')}
              </Text>
            ) : null}
            {c.kind === 'write' ? (
              <Text mono size="caption" color={C.err} weight="semibold">
                {t.write}
              </Text>
            ) : null}
            {c.flags.length ? (
              <Text mono size="caption" color={C.warn}>
                {c.flags.join(' · ')}
              </Text>
            ) : null}
            {c.error ? (
              <Text mono size="caption" color={C.err} maxLines={3}>
                {c.error}
              </Text>
            ) : null}
            {isOpen ? <Code language="json" source={c.input} /> : null}
          </Box>,
        )
      }

      if (list.length > SHOWN) {
        out.push(
          <Button key="all-calls" plain dimColor onPress={() => update($, showAllCalls, v => !v)}>
            {allCallsShown ? `▴ ${t.showFewer}` : `▾ ${t.showAllCalls(list.length)}`}
          </Button>,
        )
      }

      out.push(muteDim(t.checkLegend))

      return out
    }

    const setMode = async (value: ViewMode) => {
      await update($, mode, () => value)
      await $.store.set('mode', value)
    }
    const modeSwitch = (
      <Box flexDirection="row" gap={1}>
        <Button key="mode-simple" variant={isSimple ? 'primary' : 'secondary'} onPress={() => setMode('simple')}>
          {t.modeSimple}
        </Button>
        <Button key="mode-full" variant={isSimple ? 'secondary' : 'primary'} onPress={() => setMode('full')}>
          {t.modeFull}
        </Button>
      </Box>
    )

    const header = (
      <Box flexDirection="column" borderStyle="single" borderColor={C.border} backgroundColor={C.card} paddingX={1} gap={1}>
        <Box flexDirection="row" justifyContent="flex-end">{modeSwitch}</Box>
        <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box flexDirection="column" flexShrink={1}>
            <Text color={C.muted} weight="semibold" size="caption">
              {t.title} <Text color={C.dim}>· {t.by}</Text>
            </Text>
            <Text color={C.bright} weight="semibold">
              {title}
            </Text>
            <Text mono size="caption" color={statusColor}>
              ● {statusWord}
              {rv ? <Text color={C.dim}>{`  ${t.started} ${clock(rv.startedAt)} · ${t.updated} ${clock(rv.updatedAt)}`}</Text> : ''}
            </Text>
          </Box>
          {!isMuted ? mascotArt(56) : null}
        </Box>
        {!isMuted ? (
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" borderStyle="round" borderColor={C.border2} paddingX={1} gap={1}>
            <Box flexShrink={1}>
              <Text size="footnote" color={C.text}>
                {bubble}
              </Text>
            </Box>
            <Button
              key="mute"
              plain
              dimColor
              onPress={async () => {
                await update($, muted, () => true)
                await $.store.set('muted', true)
              }}
            >
              {t.mute}
            </Button>
          </Box>
        ) : (
          <Button
            key="unmute"
            plain
            dimColor
            onPress={async () => {
              await update($, muted, () => false)
              await $.store.set('muted', false)
            }}
          >
            {t.unmute}
          </Button>
        )}
        {progress}
      </Box>
    )

    const sample = rv?.isDemo ? (
      <Box borderStyle="single" borderColor={C.warn} paddingX={1}>
        <Text color={C.warn} weight="semibold" mono size="caption">
          ▲ {t.sample}
        </Text>
      </Box>
    ) : null

    // The alerts lead: catching a mistake early is the panel's job.
    const alertStrip =
      alerts.length > 0 ? (
        <Box flexDirection="column" borderStyle="single" borderColor={C.warn} paddingX={1}>
          <Text color={C.warn} weight="semibold" size="caption">
            ⚠ {t.alerts(alerts.length).toUpperCase()}
          </Text>
          {alerts.slice(0, 3).map(a => (
            <Text size="footnote" color={C.text} maxLines={2}>
              • {a}
            </Text>
          ))}
          {alerts.length > 3 ? muteDim(t.moreAlerts(alerts.length - 3)) : null}
        </Box>
      ) : null

    const empty = (
      <Box flexDirection="column" borderStyle="single" borderColor={C.border} backgroundColor={C.card} paddingX={1} gap={1}>
        <Text color={C.bright} weight="semibold">
          {t.emptyTitle}
        </Text>
        <Text size="footnote" color={C.text}>
          {t.emptyBody}
        </Text>
        <Button key="load-demo" variant="primary" onPress={() => loadDemo($)}>
          {t.loadDemo}
        </Button>
      </Box>
    )

    const footer = (
      <Box flexDirection="column" borderStyle="single" borderColor={C.border} paddingX={1}>
        <Text color={C.bright} weight="semibold" size="footnote">
          {t.madeBy}
        </Text>
        <Box flexDirection="row" gap={2}>
          <Link href={SITE} label="trafegocompedro.com.br" />
          <Link href={LINKEDIN} label="LinkedIn" />
          <Link href={INSTAGRAM} label="Instagram" />
        </Box>
        <Text color={C.dim} size="caption">
          {t.readOnly}
        </Text>
      </Box>
    )

    // --- Simple view: the same review in plain words, for people new to paid media.
    // Every technical detail stays one press away, under "Technical details".
    const card = (heading: string, body: (RenderElement | null)[]) => (
      <Box flexDirection="column" borderStyle="round" borderColor={C.border2} backgroundColor={C.card} paddingX={1} paddingY={1} gap={1}>
        <Text color={C.bright} weight="semibold">
          {heading}
        </Text>
        {body.filter((x): x is RenderElement => x !== null)}
      </Box>
    )

    // Behind text that follows the app's theme: a fill only where the palette is fixed.
    const soft = (): { backgroundColor?: string; borderStyle?: 'round'; borderColor?: string } =>
      C.soft ? { backgroundColor: C.soft } : { borderStyle: 'round', borderColor: C.border2 }

    // A platform's name: an outline and the theme's own colors, so it follows a light or a dark app.
    const tag = (text: string) => (
      <Box borderStyle="round" borderColor={C.border2} paddingX={1}>
        <Text size="caption" weight="semibold" color={C.infoText}>
          {text}
        </Text>
      </Box>
    )

    const pill = (text: string, color: string, bg?: string) => (
      <Text size="caption" color={color} backgroundColor={bg}>
        {` ${text} `}
      </Text>
    )

    const platformLabel = (p: string): string => p.replace(/\s*ads$/i, '')

    const pos = stepPosition(rv)
    const simpleProgress =
      steps.length > 0 ? (
        <Progress label={t.sec_status} value={stepsDone} max={steps.length} valueText={pos ? t.stepOf(pos[0], pos[1]) : ''} color={C.tcp} />
      ) : null

    const bipLine = !isMuted ? (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Box flexShrink={1}>
          <Text size="footnote" color={C.muted}>
            {t.bipSays(bubble)}
          </Text>
        </Box>
        <Button
          key="mute"
          plain
          dimColor
          onPress={async () => {
            await update($, muted, () => true)
            await $.store.set('muted', true)
          }}
        >
          {t.mute}
        </Button>
      </Box>
    ) : (
      <Button
        key="unmute"
        plain
        dimColor
        onPress={async () => {
          await update($, muted, () => false)
          await $.store.set('muted', false)
        }}
      >
        {t.unmute}
      </Button>
    )

    const hero = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.border2} backgroundColor={C.card} paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Text color={C.muted} weight="semibold" size="caption">
            {t.title} <Text color={C.dim}>· {t.by}</Text>
          </Text>
          {modeSwitch}
        </Box>
        <Box flexDirection="row" gap={2} alignItems="center">
          {!isMuted ? mascotArt(56) : null}
          <Box flexDirection="column" flexShrink={1}>
            <Text color={C.muted} size="caption">
              {t.now}
            </Text>
            <Text color={C.bright} size="heading" weight="semibold">
              {nowLine(rv, lg)}
            </Text>
            {rv ? (
              <Text color={C.dim} size="footnote">
                {title}
              </Text>
            ) : null}
          </Box>
        </Box>
        {simpleProgress}
        {bipLine}
      </Box>
    )

    const sampleBanner = rv?.isDemo ? (
      <Box borderStyle="round" borderColor={C.warn} paddingX={1}>
        <Text color={C.warnText} size="footnote">
          ▲ {t.sampleBanner}
        </Text>
      </Box>
    ) : null

    // Alerts, most serious first, each with what to do next.
    const plain = rv ? plainAlerts(rv, list, lg) : []
    const allAlertsShown = col.includes('alerts-all')
    const ALERT_MARK: Record<string, [string, string]> = { danger: ['✕', C.err], warn: ['⚠', C.warnText], info: ['ℹ', C.infoText] }
    const attention =
      plain.length > 0 ? (
        <Box flexDirection="column" borderStyle="round" borderColor={C.warn} backgroundColor={C.card} paddingX={1} paddingY={1} gap={1}>
          <Text color={C.warnText} weight="semibold">
            ⚠ {t.attention} <Text color={C.dim}>· {plain.length}</Text>
          </Text>
          {(allAlertsShown ? plain : plain.slice(0, 3)).map(a => {
            const [mark, color] = ALERT_MARK[a.level] ?? ['ℹ', C.infoText]

            return (
              <Box flexDirection="row" gap={1}>
                <Box width={2}>
                  <Text color={color} weight="semibold">
                    {mark}
                  </Text>
                </Box>
                <Box flexDirection="column" flexShrink={1}>
                  <Text color={C.bright} weight="medium">
                    {a.title}
                  </Text>
                  {a.body ? (
                    <Text size="footnote" color={C.muted}>
                      {a.body}
                    </Text>
                  ) : null}
                  {a.todo ? (
                    <Box {...soft()} paddingX={1}>
                      <Text size="footnote" color={C.text}>
                        <Text weight="semibold" color={C.bright}>
                          {t.whatToDo}
                        </Text>
                        {a.todo}
                      </Text>
                    </Box>
                  ) : null}
                </Box>
              </Box>
            )
          })}
          {plain.length > 3 ? (
            <Button key="alerts-more" plain dimColor onPress={() => toggle('alerts-all')}>
              {allAlertsShown ? `▴ ${t.fewerAlerts}` : `▾ ${t.moreAlertsBtn(plain.length - 3)}`}
            </Button>
          ) : null}
        </Box>
      ) : null

    // Three numbers at a glance.
    const totals = checkTotals(rv)
    const checkedAll = totals.found + totals.missing
    const firstPeriod = rv?.periods[0]
    const platforms = [...new Set((rv?.accounts ?? []).map(a => platformLabel(a.platform)))]
    const tile = (label: string, big: string, caption: string, captionColor: string = C.muted, bigSize: 'title' | 'heading' = 'title') => (
      <Box flexDirection="column" flexGrow={1} minWidth={14} borderStyle="round" borderColor={C.border2} backgroundColor={C.card} paddingX={1}>
        <Text size="caption" color={C.muted}>
          {label}
        </Text>
        <Text size={bigSize} weight="semibold" color={C.bright}>
          {big}
        </Text>
        {caption ? (
          <Text size="caption" color={captionColor}>
            {caption}
          </Text>
        ) : null}
      </Box>
    )
    // A launch with nothing read yet has no period or checked numbers to show.
    const tiles = rv && !isLaunchOnly ? (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {tile(t.tileAccounts, String(rv.accounts.length), platforms.join(lg === 'pt' ? ' e ' : ' and '))}
        {tile(
          t.tilePeriod,
          firstPeriod ? capital(naturalRange(firstPeriod.start, firstPeriod.end, lg)) : '—',
          firstPeriod?.compareStart && firstPeriod.compareEnd ? t.comparedWith(naturalRange(firstPeriod.compareStart, firstPeriod.compareEnd, lg)) : '',
          C.muted,
          'heading',
        )}
        {tile(
          t.tileChecked,
          checkedAll > 0 ? `${totals.found} ${t.of} ${checkedAll}` : t.noneYet,
          [totals.missing > 0 ? t.notMatch(totals.missing) : totals.found > 0 ? t.allMatch : '', totals.common > 0 ? t.commonNote(totals.common) : '']
            .filter(Boolean)
            .join(' · '),
          totals.missing > 0 ? C.warnText : C.okText,
          checkedAll > 0 ? 'title' : 'heading',
        )}
      </Box>
    ) : null

    // Claude's last answer: each number looked up in what this review read.
    const ans = rv?.answer
    const answerLines = (): RenderElement[] => {
      if (!ans) return []
      if (ans.total === 0) return [muteDim(t.ansNone)]

      const line = (text: string, color: string) => (
        <Text size="footnote" color={color}>
          {text}
        </Text>
      )
      const out: RenderElement[] = [
        <Text color={C.bright} weight="medium">
          {t.ansTotal(ans.total)}
        </Text>,
      ]

      if (ans.missing.length > 0) out.push(line(t.ansMissing(ans.missing.length), C.warnText))
      if (ans.found > 0) out.push(line(t.ansFound(ans.found), C.okText))
      if (ans.summed > 0) out.push(line(t.ansSummed(ans.summed), C.okText))
      if (ans.elsewhere > 0) out.push(line(t.ansElsewhere(ans.elsewhere), C.text))
      if (ans.calculated > 0) out.push(line(t.ansCalculated(ans.calculated), C.muted))
      if (ans.common > 0) out.push(line(t.ansCommon(ans.common), C.muted))

      if (ans.missing.length > 0) {
        const shown = ans.missing.slice(0, 6)

        out.push(
          <Box flexDirection="column" {...soft()} paddingX={1}>
            <Text size="footnote" weight="semibold" color={C.bright}>
              {t.ansMissingHead}
            </Text>
            {shown.map(m => (
              <Text size="footnote" color={C.text}>
                <Text color={C.warnText} weight="semibold">
                  {`! ${m.text}`}
                </Text>
                {m.context ? <Text color={C.muted}>{`  ${m.context}${m.isWrongRow ? ` · ${t.ansWrongRow}` : ''}`}</Text> : null}
              </Text>
            ))}
            {ans.missing.length > shown.length ? muteDim(t.ansMore(ans.missing.length - shown.length)) : null}
          </Box>,
        )
      }
      out.push(muteDim(t.ansExplain))

      return out
    }
    const answerCard = ans ? card(t.ansTitle, answerLines()) : null

    // A launch: an assembly line, the card of the piece at hand, and the receipt.
    const pieces = rv?.launch ?? []
    const ALERT_GLYPH: Record<string, [string, string]> = { danger: ['✕', C.err], warn: ['⚠', C.warnText], info: ['ℹ', C.infoText] }
    const STATE_GLYPH: Record<LaunchPiece['state'], [string, string]> = { waiting: ['…', C.accent], ok: ['✓', C.okText], error: ['✕', C.err], denied: ['⊘', C.muted] }
    const stationOf = (label: string, list: LaunchPiece[]): BeltStation => {
      const live = list.filter(p => p.state !== 'denied')

      return {
        label,
        state: live.some(p => p.state === 'waiting') ? 'now' : live.some(p => p.state === 'ok') ? 'done' : live.some(p => p.state === 'error') ? 'error' : 'todo',
        count: live.filter(p => p.state === 'ok').length,
      }
    }
    const goLive = pieces.filter(p => p.kind === 'activate' || (p.state === 'ok' && p.result === 'ACTIVE'))
    const stations: BeltStation[] = [
      stationOf(t.st_campaign, pieces.filter(p => p.kind === 'campaign')),
      stationOf(t.st_adset, pieces.filter(p => p.kind === 'adset')),
      stationOf(t.st_creative, pieces.filter(p => p.kind === 'creative' || p.kind === 'media')),
      stationOf(t.st_ad, pieces.filter(p => p.kind === 'ad' || p.kind === 'boost')),
      stationOf(t.st_live, goLive),
    ]
    const STATION_MARK = { todo: '○', now: '…', done: '✓', error: '✕' } as const
    const beltLine = stations.map(st => `${st.label} ${STATION_MARK[st.state]}${st.count > 1 ? `×${st.count}` : ''}`).join(' › ')
    const isLiveNow = goLive.some(p => p.state === 'ok')
    const current = [...pieces].reverse().find(p => p.state === 'waiting') ?? pieces[pieces.length - 1]
    const togglePiece = (n: number) => update($, openPieces, xs => (xs.includes(n) ? xs.filter(x => x !== n) : [...xs, n].slice(-20)))
    const pieceTitle = (p: LaunchPiece) => `${pieceKindName(p, lg)}${p.name ? `: ${p.name}` : ''}`
    const fichaOf = (p: LaunchPiece): RenderElement[] => {
      const facts = p.facts.map(f => factText(f, lg, rv?.currency)).filter((f): f is NonNullable<ReturnType<typeof factText>> => f !== undefined)
      const notes = p.alerts.map(a => launchAlertText(a, p, lg, rv?.currency)).filter((a): a is NonNullable<ReturnType<typeof launchAlertText>> => a !== undefined)
      const [mark, markColor] = STATE_GLYPH[p.state]
      const out: RenderElement[] = [
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Text color={C.bright} weight="semibold">
            {pieceTitle(p)}
          </Text>
          {pill(`${mark} ${pieceStateText(p, lg)}`, p.state === 'ok' ? C.okText : p.state === 'waiting' ? C.chipText : C.warnText, p.state === 'ok' ? C.okBg : p.state === 'waiting' ? C.chip : C.warnBg)}
        </Box>,
      ]

      // Going live: what goes live with it, for a last look before the approval.
      const scope = liveScope(p, pieces)

      if (scope.length > 0) {
        out.push(
          <Text size="caption" weight="semibold" color={C.muted}>
            {t.goesLiveWith.toUpperCase()}
          </Text>,
        )
        for (const x of scope) {
          out.push(
            <Box flexDirection="column" {...soft()} paddingX={1}>
              <Text size="footnote" weight="semibold" color={C.bright}>
                {pieceTitle(x.piece)}
              </Text>
              {x.facts
                .map(f => factText(f, lg, rv?.currency))
                .filter((f): f is NonNullable<ReturnType<typeof factText>> => f !== undefined)
                .map(f => (
                  <Text size="footnote" color={C.text}>
                    <Text color={C.muted}>{`${f.label}: `}</Text>
                    <Text weight={f.isBig ? 'semibold' : undefined} color={C.bright}>
                      {f.value}
                    </Text>
                    {f.note && /^!/.test(f.note) ? <Text color={C.warnText}>{`  ${f.note}`}</Text> : null}
                  </Text>
                ))}
            </Box>,
          )
        }
      }

      for (const f of facts) {
        out.push(
          <Box flexDirection="column">
            <Text size="caption" color={C.muted}>
              {f.label}
            </Text>
            {f.value ? (
              <Text size={f.isBig ? 'heading' : 'footnote'} weight={f.isBig ? 'semibold' : undefined} color={C.bright}>
                {f.value}
              </Text>
            ) : null}
            {f.note ? (
              <Text size="caption" color={/^!/.test(f.note) ? C.warnText : /^✓/.test(f.note) ? C.okText : C.dim}>
                {f.note}
              </Text>
            ) : null}
          </Box>,
        )
      }

      for (const a of notes) {
        const [g, color] = ALERT_GLYPH[a.level] ?? ['ℹ', C.infoText]

        out.push(
          <Box flexDirection="row" gap={1}>
            <Box width={2}>
              <Text color={color} weight="semibold">
                {g}
              </Text>
            </Box>
            <Box flexDirection="column" flexShrink={1}>
              <Text color={C.bright} weight="medium" size="footnote">
                {a.title}
              </Text>
              {a.body ? (
                <Text size="footnote" color={C.muted}>
                  {a.body}
                </Text>
              ) : null}
              {a.todo ? (
                <Text size="footnote" color={C.text}>
                  <Text weight="semibold" color={C.bright}>
                    {t.whatToDo}
                  </Text>
                  {a.todo}
                </Text>
              ) : null}
            </Box>
          </Box>,
        )
      }

      const href = managerLink(p)

      if (href) out.push(<Link href={href} label={`${t.openManager} ↗`} />)

      return out
    }
    const missing = missingOf(pieces)
    const launchLines = (): RenderElement[] => {
      if (pieces.length === 0) return []

      const out: RenderElement[] = [
        <Text size="footnote" color={C.muted}>
          {t.launchSummary(
            pieces.filter(p => p.state === 'ok').length,
            pieces.filter(p => p.state === 'waiting').length,
            pieces.filter(p => p.state === 'error').length,
          )}
        </Text>,
        Svg ? (
          <Svg
            source={beltChart({ stations, isLive: isLiveNow, isMoving: pieces.some(p => p.state === 'waiting'), width: chartW })}
            alt={t.beltAlt(beltLine)}
          />
        ) : (
          <Text mono size="caption" color={C.text}>
            {beltLine}
          </Text>
        ),
      ]

      if (current) {
        out.push(
          <Box flexDirection="column" borderStyle="round" borderColor={current.state === 'waiting' ? C.accent : C.border2} paddingX={1} paddingY={1} gap={1}>
            {fichaOf(current)}
          </Box>,
        )
      }

      if (pieces.length > 1 || missing.length > 0) {
        out.push(
          <Text color={C.muted} weight="semibold" size="caption">
            {t.receiptTitle.toUpperCase()}
          </Text>,
        )

        for (const p of pieces) {
          const [g, color] = STATE_GLYPH[p.state]
          const isOpen = openP.includes(p.n) && p !== current

          out.push(
            <Button key={`piece-${p.n}`} plain onPress={() => togglePiece(p.n)}>
              <Text size="footnote" color={C.text}>
                <Text color={color} weight="semibold">
                  {`${g} `}
                </Text>
                {pieceTitle(p)}
                <Text color={C.dim}>{`  ${p.id ? `ID ${p.id} · ` : ''}${pieceStateText(p, lg)}`}</Text>
              </Text>
            </Button>,
          )
          if (isOpen) {
            out.push(
              <Box flexDirection="column" borderStyle="round" borderColor={C.border2} paddingX={1} gap={1}>
                {fichaOf(p)}
              </Box>,
            )
          }
        }

        if (missing.length > 0) {
          out.push(
            <Text size="footnote" weight="semibold" color={C.bright}>
              {t.stillMissing}
            </Text>,
          )
          for (const x of missing) {
            const nm = x.under.name ?? t.unnamed

            out.push(
              <Text size="footnote" color={C.muted}>
                {`○ ${x.kind === 'adset' ? t.miss_adset(nm) : t.miss_ad(nm)}`}
              </Text>,
            )
          }
        }
      }

      return out
    }
    const launchCard = pieces.length > 0 ? card(t.launchTitle, launchLines()) : null

    // The steps as a path: done, happening now, still to come.
    const stepsCard =
      steps.length > 0
        ? card(
            t.stepsTitle,
            steps.map((s, i) => {
              const isNow = s.status === 'fetching' || s.status === 'analyzing'
              const badgeEl =
                s.status === 'done'
                  ? pill('✓', C.okText, C.okBg)
                  : s.status === 'error'
                    ? pill('✕', C.warnText, C.warnBg)
                    : isNow
                      ? pill(String(i + 1), C.onTcp, C.tcp)
                      : pill(String(i + 1), C.chipText, C.chip)

              return (
                <Box flexDirection="row" gap={1}>
                  <Box width={4}>{badgeEl}</Box>
                  <Box flexDirection="column" flexShrink={1}>
                    <Text color={s.status === 'queued' ? C.muted : isNow ? C.bright : C.text} weight={isNow ? 'semibold' : 'regular'}>
                      {s.label}
                    </Text>
                    {isNow ? (
                      <Text size="caption" color={C.tcp}>
                        ● {t.happeningNow}
                        {s.note ? ` · ${s.note}` : ''}
                      </Text>
                    ) : s.note ? (
                      muteDim(s.note)
                    ) : null}
                  </Box>
                </Box>
              )
            }),
          )
        : null

    // Each chart with its totals, a check badge and the meaning of its metrics.
    const explained = new Set<string>()
    const headlines = (ds: Dataset): { label: string; value: string }[] => {
      const xIdx = Math.max(0, ds.columns.indexOf(ds.x ?? ds.columns[0] ?? ''))
      const series = (ds.series && ds.series.length ? ds.series : ds.columns.filter((_, i) => i !== xIdx)).slice(0, 2)

      return series
        .map(s => {
          const si = ds.columns.indexOf(s)
          const unit = seriesUnit(s, ds)

          if (si < 0 || (unit !== 'currency' && unit !== 'count')) return undefined

          const sum = ds.rows.reduce((a, r) => a + (toNumber(r[si]) ?? 0), 0)

          return { label: plainColumn(s, lg), value: fmt(sum, lg, unit, ds.currency ?? rv?.currency) }
        })
        .filter((x): x is { label: string; value: string } => x !== undefined)
    }
    const badgesOf = (ds: Dataset): RenderElement[] => {
      const c = ds.check
      const total = c.found + c.missing
      const out: RenderElement[] = []

      if (c.note === 'none-cited') out.push(pill(t.badgeNone, C.warnText, C.warnBg))
      else {
        if (c.missing > 0) out.push(pill(t.badgeMissing(c.missing), C.warnText, C.warnBg))
        if (total > 0) out.push(pill(t.badgeOk(c.found, total), C.okText, C.okBg))
        if (c.summed) out.push(pill(t.badgeSummed(c.summed), C.okText, C.okBg))
        if (c.common) out.push(pill(t.badgeCommon(c.common), C.chipText, C.chip))
      }
      if (c.calculated > 0) out.push(pill(t.badgeCalc(c.calculated), C.chipText, C.chip))
      if (c.unchecked > 0) out.push(pill(t.badgeUnchecked(c.unchecked), C.chipText, C.chip))

      return out
    }
    // A long table, read for the person: the period's totals, a chart per day,
    // one line per campaign, or the top items of a list. The table stays one press away.
    const metricName = (dg: Digest, m: Metric): string =>
      m === 'cpa' ? t.m_cpa : m === 'cpc' ? t.m_cpc : m === 'roas' ? t.m_roas : plainColumn(dg.names[m] ?? m, lg).toLowerCase()
    const metricValue = (m: Metric, v: number, cur?: string): string =>
      unitOf(m) === 'currency' ? fmt(v, lg, 'currency', cur) : fmt(Math.round(v * 100) / 100, lg, unitOf(m) === 'count' ? 'count' : undefined)
    // "106 cliques", "1 conversão", "R$ 485,05", "R$ 23,97 por conversão".
    const metricText = (dg: Digest, x: Total, cur?: string): string => {
      const value = metricValue(x.metric, x.value, cur)
      const name = metricName(dg, x.metric)

      if (x.metric === 'cost' || x.metric === 'revenue') return value
      if (unitOf(x.metric) === 'count') return `${value} ${x.value === 1 ? t.singular(name) : name}`

      return `${value} ${name}`
    }
    const tableToggle = (ds: Dataset) => (
      <Button
        key={`tbl-${ds.id}`}
        plain
        dimColor
        onPress={() => update($, openTables, cur => (cur.includes(ds.id) ? cur.filter(x => x !== ds.id) : [...cur, ds.id]))}
      >
        {tables.includes(ds.id) ? t.hideFullTable : t.fullTable(ds.totalRows)}
      </Button>
    )
    const digestBody = (ds: Dataset, dg: Digest): (RenderElement | null)[] => {
      const cur = ds.currency ?? rv?.currency

      if (dg.kind === 'ranking') {
        const max = Math.max(0, ...dg.top.map(r => r.value))
        const groupName = dg.groupColumn ? plainColumn(dg.groupColumn, lg).toLowerCase() : ''
        const rest = dg.rest
        const restParts = rest
          ? [
              t.others(rest.count, rest.each !== undefined ? metricText(dg, { metric: dg.metric, value: rest.each }, cur) : undefined),
              rest.each === undefined ? metricText(dg, { metric: dg.metric, value: rest.value }, cur) : undefined,
              rest.cost !== undefined ? fmt(rest.cost, lg, 'currency', cur) : undefined,
            ].filter((x): x is string => x !== undefined)
          : []

        return [
          <Box flexDirection="column" gap={1}>
            {dg.top.map(r => (
              <Box flexDirection="column">
                <Text color={C.bright}>
                  {r.label}
                  {r.group ? <Text color={C.dim} size="caption">{`  ·  ${groupName}: ${r.group}`}</Text> : ''}
                </Text>
                <Text mono size="caption" color={C.muted}>
                  <Text color={C.accent}>{textBar(r.value, max, 14)}</Text> {metricText(dg, { metric: dg.metric, value: r.value }, cur)}
                  {r.cost !== undefined ? ` · ${fmt(r.cost, lg, 'currency', cur)}` : ''}
                </Text>
              </Box>
            ))}
          </Box>,
          rest ? muteDim(restParts.join(' · ')) : null,
        ]
      }

      const values = dg.days.map(d => d.value)
      const markName = dg.names.conversions ? plainColumn(dg.names.conversions, lg).toLowerCase() : ''
      const markDays = dg.days.filter(d => d.marks > 0)
      const shown = dg.totals.map(x => x.metric)

      return [
        muteDim(capital(naturalRange(dg.from, dg.to, lg))),
        <Box flexDirection="row" flexWrap="wrap" gap={3}>
          {dg.totals.map(x => (
            <Box flexDirection="column">
              <Text size="title" weight="semibold" color={C.bright}>
                {metricValue(x.metric, x.value, cur)}
              </Text>
              <Text size="caption" color={C.muted}>
                {metricName(dg, x.metric)}
              </Text>
            </Box>
          ))}
        </Box>,
        <Box flexDirection="column">
          <Text size="footnote" color={C.text} weight="medium">
            {t.perDay(capital(metricName(dg, dg.chartMetric)))}
          </Text>
          {Svg ? (
            <Svg
              source={columnChart({
                labels: dg.days.map(d => d.date),
                values,
                marks: dg.days.map(d => d.marks),
                name: metricName(dg, dg.chartMetric),
                markName,
                tip: v => metricValue(dg.chartMetric, v, cur),
                short: t.dayShort,
                width: chartW,
              })}
              alt={`${ds.title}: ${t.perDay(metricName(dg, dg.chartMetric))}`}
              isInteractive
            />
          ) : (
            <Text mono color={C.accent}>
              {sparkline(values)}
            </Text>
          )}
          {markDays.length > 0
            ? Svg
              ? <Text size="caption" color={C.tcp}>{t.markLegend(t.singular(markName))}</Text>
              : muteDim(t.markDays(markName, markDays.map(d => t.dayShort(d.date)).join(', ')))
            : null}
        </Box>,
        dg.groups.length >= 2 && dg.groupColumn ? (
          <Box flexDirection="column" gap={1}>
            <Text size="footnote" color={C.text} weight="medium">
              {t.byGroup(plainColumn(dg.groupColumn, lg).toLowerCase())}
            </Text>
            {dg.groups.map(g => (
              <Box flexDirection="column">
                <Text color={C.bright}>{g.label}</Text>
                <Text size="caption" color={C.muted}>
                  {shown
                    .map(m => g.totals.find(x => x.metric === m))
                    .filter((x): x is Total => x !== undefined)
                    .map(x => metricText(dg, x, cur))
                    .join(' · ')}
                </Text>
              </Box>
            ))}
          </Box>
        ) : null,
      ]
    }

    const numberCards = (rv?.datasets ?? []).map(ds => {
      const dg = isSimple ? digestOf(ds) : undefined

      if (dg) {
        const terms = dg.kind === 'series' ? dg.totals.map(x => x.metric) : [dg.metric]

        return card(ds.title, [
          ...digestBody(ds, dg),
          ds.note ? muteDim(ds.note) : null,
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {badgesOf(ds)}
          </Box>,
          ds.check.missing > 0 ? <Text size="caption" color={C.warnText}>{t.totalsUnverified}</Text> : null,
          tableToggle(ds),
          tables.includes(ds.id) ? tableOf(ds, true) : null,
          ...glossary(terms, lg, explained).map(line => muteDim(line)),
        ])
      }

      const heads = ds.chart === 'line' ? headlines(ds) : []
      const meaning = glossary(ds.columns, lg, explained)

      return card(ds.title, [
        heads.length > 0 ? (
          <Box flexDirection="row" flexWrap="wrap" gap={3}>
            {heads.map(head => (
              <Box flexDirection="column">
                <Text size="title" weight="semibold" color={C.bright}>
                  {head.value}
                </Text>
                <Text size="caption" color={C.muted}>
                  {t.inPeriod(head.label)}
                </Text>
              </Box>
            ))}
          </Box>
        ) : null,
        ds.chart === 'table' ? tableOf(ds, true) : (
          <Box flexDirection="column" gap={1}>
            {chartsOf(ds, true)}
          </Box>
        ),
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {badgesOf(ds)}
        </Box>,
        ds.note ? muteDim(ds.note) : null,
        ...meaning.map(line => muteDim(line)),
      ])
    })
    const numbersBlock =
      numberCards.length > 0 ? (
        <Box flexDirection="column" gap={1}>
          <Text color={C.muted} weight="semibold" size="caption">
            {t.numbers.toUpperCase()}
          </Text>
          {numberCards}
        </Box>
      ) : null

    // The level ladder, from the whole account down to what people typed.
    const ladder = (() => {
      const current = rv?.level
      const seen = rv?.levelsSeen ?? []

      if (!current && seen.length === 0) return null

      const main = ['account', 'campaign', 'adgroup', 'ad', 'keyword', 'searchterm']
      const extra = seen.filter(l => !main.includes(l))
      const items = [...main, ...extra]
      const chips: RenderElement[] = []

      items.forEach((l, i) => {
        const isNow = l === current
        const wasSeen = seen.includes(l)

        chips.push(
          isNow
            ? pill(`● ${levelName(lg, l)}`, C.onTcp, C.tcp)
            : wasSeen
              ? pill(`✓ ${levelName(lg, l)}`, C.okText, C.okBg)
              : pill(levelName(lg, l), C.chipText, C.chip),
        )
        if (i < items.length - 1) chips.push(<Text color={C.dim}>›</Text>)
      })

      return card(t.lookingAt, [
        <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
          {chips}
        </Box>,
        muteDim(t.lookingCaption),
      ])
    })()

    // Accounts and the period, with friendly names for settings.
    const line = (label: string, value: string) => (
      <Text size="footnote" color={C.text}>
        <Text color={C.dim}>{label}</Text>
        {value}
      </Text>
    )
    const tz = rv?.periods.find(p => p.timezone)?.timezone ?? rv?.accounts.find(a => a.timezone)?.timezone
    const money = rv?.currency ?? rv?.accounts.find(a => a.currency)?.currency
    const accountsCard = rv
      ? card(t.accountsPeriod, [
          ...rv.accounts.map(a => (
            <Box flexDirection="row" gap={1}>
              {tag(platformLabel(a.platform))}
              <Box flexDirection="column" flexShrink={1}>
                <Text color={a.name ? C.bright : C.muted}>{a.name ?? t.noNameAccount}</Text>
                <Text size="caption" color={C.dim}>
                  {[`ID ${a.id}`, a.origin === 'auto' ? t.foundAlone : undefined].filter(Boolean).join(' · ')}
                </Text>
              </Box>
            </Box>
          )),
          ...rv.periods.map(p => line(t.periodLine, naturalRange(p.start, p.end, lg))),
          ...rv.periods
            .filter(p => p.compareStart && p.compareEnd)
            .map(p => line(t.compareLine, naturalRange(p.compareStart ?? '', p.compareEnd ?? '', lg))),
          money || tz ? line(t.moneyTime, [money ? friendlyCurrency(money, lg) : undefined, tz ? friendlyTimezone(tz, lg) : undefined].filter(Boolean).join(', ')) : null,
          rv.attribution ? line(t.howCounted, rv.attribution) : null,
        ])
      : null

    // Everything technical, folded by default.
    const techOpen = col.includes('tech-open')
    const techCard = rv ? (
      <Box flexDirection="column" borderStyle="round" borderColor={C.border2} backgroundColor={C.card} paddingX={1} gap={1}>
        <Button key="tech" plain onPress={() => toggle('tech-open')}>
          <Text color={C.text} weight="semibold">
            {techOpen ? '▾ ' : '▸ '}
            {t.tech}
          </Text>
          <Text color={C.dim} size="caption">
            {'  '}
            {t.techSummary(
              list.length,
              list.filter(c => c.status === 'empty').length,
              list.filter(c => c.status === 'error' || c.status === 'denied').length,
              list.filter(c => c.kind === 'write').length,
            )}
          </Text>
        </Button>
        {techOpen ? debugBody() : null}
      </Box>
    ) : null

    const whatIs = card(t.emptyTitle, [
      <Text color={C.bright} weight="medium">
        {t.whatIs}
      </Text>,
      <Text size="footnote" color={C.text}>
        <Text color={C.okText}>✓ </Text>
        {t.whatIs1}
      </Text>,
      <Text size="footnote" color={C.text}>
        <Text color={C.okText}>✓ </Text>
        {t.whatIs2}
      </Text>,
      <Text size="footnote" color={C.text}>
        <Text color={C.okText}>✓ </Text>
        {t.whatIs3}
      </Text>,
      muteDim(t.whatIsNext),
      <Button key="load-demo" variant="primary" onPress={() => loadDemo($)}>
        {t.loadDemo}
      </Button>,
    ])

    if (isSimple) {
      return (
        <Box flexDirection="column" backgroundColor={C.bg} padding={1} gap={1}>
          {hero}
          {rv === null ? whatIs : null}
          {sampleBanner}
          {attention}
          {launchCard}
          {tiles}
          {answerCard}
          {stepsCard}
          {numbersBlock}
          {ladder}
          {accountsCard}
          {techCard}
          {footer}
        </Box>
      )
    }

    if (rv === null) {
      return (
        <Box flexDirection="column" backgroundColor={C.bg} padding={1} gap={1}>
          {header}
          {empty}
          {footer}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={C.bg} padding={1} gap={1}>
        {header}
        {sample}
        {alertStrip}
        {pieces.length > 0 ? section('launch', t.sec_launch, `${pieces.filter(p => p.state === 'ok').length}/${pieces.length}`, launchLines) : null}
        {ans ? section('answer', t.sec_answer, ans.total > 0 ? `${ans.found}/${ans.total}` : undefined, answerLines) : null}
        {section('accounts', t.sec_accounts, String(rv?.accounts.length ?? 0), accountsBody)}
        {section('status', t.sec_status, steps.length ? `${stepsDone}/${steps.length}` : undefined, statusBody)}
        {section('level', t.sec_level, undefined, levelBody)}
        {section('periods', t.sec_periods, rv?.periods.length ? String(rv.periods.length) : undefined, periodsBody)}
        {section('visuals', t.sec_visuals, String(rv?.datasets.length ?? 0), visualsBody)}
        {section('debug', t.sec_debug, `${list.length} ${t.calls}`, debugBody)}
        {footer}
      </Box>
    )
  })
}
