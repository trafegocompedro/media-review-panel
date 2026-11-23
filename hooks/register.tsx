import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, RenderElement, SvgProps, ToolCallResult } from 'claude-code'

import type { CallLog, CallStatus, Dataset, Lang, Mood, Review, StepStatus } from '../types'
import { C, barChart, fmt, lineChart, sparkline, textBar } from './charts'
import { buildDemo } from './demo'
import { OWN_TOOL, accountsIn, classify, classifyOutput, extract, parseScripts, platformOf, readResult, toNumber } from './detect'
import { LEVELS, guessLang, levelName, mascotText, strings } from './i18n'
import type { MascotKey } from './i18n'
import { robot, robotText } from './mascot'
import { applyReport, autoWarnings, daysBetween, mergeAccount, newReview } from './review'

const PANE = 'media-review'
const LINKEDIN = 'https://www.linkedin.com/in/soupedrosimoes/'
const INSTAGRAM = 'https://www.instagram.com/trafegocompedro/'

// Change a shape tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const review = atom({ plugin: 'media-review-panel', key: 'review' } as const, null, { shape: 'review-2' })
const calls = atom({ plugin: 'media-review-panel', key: 'calls' } as const, [], { shape: 'calls-1' })
const mascot = atom({ plugin: 'media-review-panel', key: 'mascot' } as const, null, { shape: 'mascot-1' })
const collapsed = atom({ plugin: 'media-review-panel', key: 'collapsed' } as const, [])
const openCalls = atom({ plugin: 'media-review-panel', key: 'openCalls' } as const, [])
const muted = atom({ plugin: 'media-review-panel', key: 'muted' } as const, false)
const lang = atom({ plugin: 'media-review-panel', key: 'lang' } as const, 'en')
const counter = atom({ plugin: 'media-review-panel', key: 'counter' } as const, 0)

// Raw responses, kept in memory only for the source check (never stored or sent).
const sources = new Map<number, string>()
const MAX_SOURCE = 400_000
const keepSource = (n: number, text: string) => {
  sources.set(n, text.length > MAX_SOURCE ? text.slice(0, MAX_SOURCE) : text)

  for (const k of [...sources.keys()]) {
    if (sources.size <= 80) break
    sources.delete(k)
  }
}
const sourceText = (n: number) => sources.get(n)

const nudged = new Set<string>()

const textOf = (r: ToolCallResult): string =>
  typeof r.text === 'string' ? r.text : typeof r.result === 'string' ? r.result : ''

const REPORT_DESCRIPTION = [
  'Keeps the Media Review Panel current: a side panel the user watches to see exactly what you read while you analyze paid media (Google, Meta, TikTok, LinkedIn Ads). It changes nothing in any ad account.',
  'Call it with action "start" when a paid media analysis begins (title, accounts with platform/id/name, periods, the steps you plan); "update" as you go (step status queued|fetching|analyzing|done|error, the data level you are reading, datasets for charts, assumptions, warnings); "finish" at the end. "clear" empties the panel.',
  'Rules: report only values you actually retrieved in this session, copied from tool results. Never estimate, fill gaps or invent values: use null for a missing point. Say in warnings when data was sampled, truncated, paged or incomplete.',
  'Each dataset cites source_calls: the call numbers the panel gives in tool results ("logged as call #N"). List columns you computed (CPA, ROAS, CTR) in calculated_columns. The panel checks every other number against the raw responses and tells you what it could not find.',
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

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Media Review', backgroundColor: C.bg, columns: 72 })
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
    await say($, 'm_clear', 'happy')

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
  else if (r?.datasets.some(d => d.check.missing > 0) && notes.some(x => x.includes('Not found'))) await say($, 'm_check', 'oops')
  else if (moves.includes('done')) await say($, 'm_step', 'happy')
  else if (moves.includes('analyzing')) await say($, 'm_analyze', 'work')
  else if (moves.includes('fetching')) await say($, 'm_fetch', 'work')

  const done = r?.steps.filter(s => s.status === 'done').length ?? 0
  const head = `Media Review Panel updated: ${r?.status ?? 'idle'}, ${done}/${r?.steps.length ?? 0} steps done, ${r?.datasets.length ?? 0} datasets.`

  return { result: [head, ...notes].join('\n') }
}


export const register: Register = (on, options) => {
  const autoOpen = options.autoOpen !== 'off'
  const langOption = options.language === 'en' || options.language === 'pt' ? options.language : 'auto'
  // Your own data scripts, from your local settings only (never in the mod's files).
  const scripts = parseScripts(options.extraScripts)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'media-review',
      description: 'Open the Media Review Panel (paid media transparency and debugging)',
      argumentHint: '[demo | clear | mute | unmute | en | pt]',
    })
    await $.tool.register({ name: 'report', description: REPORT_DESCRIPTION, inputSchema: REPORT_SCHEMA, isDeferred: true })

    const stored = await $.store.get('muted')

    if (typeof stored === 'boolean') await update($, muted, () => stored)
    else if (options.mascot === 'off') await update($, muted, () => true)

    if (langOption !== 'auto') await update($, lang, () => langOption)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (langOption === 'auto' && e.command === undefined && e.isMeta === undefined) {
      const guess = guessLang(e.text)

      if (guess) await update($, lang, () => guess)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)

    if (tool === OWN_TOOL) return answerReport($, input, langOption, autoOpen)

    const current = await read($, review)
    const isActive = current !== null && !current.isDemo && (current.status === 'running' || current.status === 'paused')
    const before = classify(tool, input, isActive, scripts)

    if (before === undefined && tool !== 'Bash') return next(e)

    // A terminal command the input did not give away is judged by what it printed.
    const startedAt = await $.clock.now()
    const early = before === undefined ? await next(e) : undefined
    const det = before ?? (early ? classifyOutput(String(input.command ?? ''), textOf(early)) : undefined)

    if (det === undefined) return early ?? next(e)

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
      keepSource(n, text)

      const facts = readResult(text)
      done.chars = text.length
      done.rows = facts.rows
      done.rowsApprox = facts.rowsApprox
      done.flags = facts.flags
      done.currency = facts.currency
      done.timezone = facts.timezone

      if (/^\s*\{\s*"error"\s*:/.test(text)) {
        done.status = 'error'
        done.error = text.slice(0, 400)
      } else done.status = facts.rows === 0 ? 'empty' : 'ok'

      // A script names neither its platform nor its account in the command:
      // read them off what it printed.
      if (tool === 'Bash') {
        if (det.platform === 'Ads') done.platform = platformOf(text.slice(0, 20_000))
        if (x.accounts.length === 0) done.accounts = [...new Set(accountsIn(text.slice(0, 200_000)))].slice(0, 12)
      }
    }

    await update($, calls, list => list.map(c => (c.n === n ? { ...c, ...done } : c)))

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

    if (det.kind === 'write') await say($, 'm_write', 'oops')
    else if (done.status === 'error' || done.status === 'denied') await say($, 'm_error', 'oops')
    else if (done.status === 'empty') await say($, 'm_empty', 'oops')
    else if (!isNew && (m === null || m.key === 'm_start' || m.key === 'm_paused' || m.key === 'm_hello')) await say($, 'm_fetch', 'work')

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
    const r = await read($, review)

    if (r !== null && r.status === 'running' && !r.isDemo) {
      await update($, review, cur => (cur === null ? cur : { ...cur, status: 'paused' as const }))
      await say($, 'm_paused', 'hello')
    }

    return next(e)
  })

  on('command.run', { command: 'media-review' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const t = strings(await read($, lang))

    if (arg === 'demo') {
      const demo = buildDemo(await $.clock.now())
      sources.clear()
      for (const [k, v] of demo.sources) sources.set(k, v)
      await update($, review, () => demo.review)
      await update($, calls, () => demo.calls)
      await update($, counter, c => Math.max(c, demo.counter))
      await say($, 'm_demo', 'happy')
      await openPane($)

      return { text: `Media Review Panel: ${t.sample}` }
    }

    if (arg === 'clear') {
      await update($, review, () => null)
      await update($, calls, () => [])
      await say($, 'm_clear', 'happy')

      return { text: 'Media Review Panel cleared.' }
    }

    if (arg === 'mute' || arg === 'unmute') {
      const value = arg === 'mute'
      await update($, muted, () => value)
      await $.store.set('muted', value)

      return { text: value ? 'Mascot muted.' : 'Mascot back on.' }
    }

    if (arg === 'en' || arg === 'pt') {
      await update($, lang, () => arg)

      return { text: arg === 'pt' ? 'Painel em português.' : 'Panel in English.' }
    }

    if (arg !== '') {
      return { text: 'Usage: /media-review [demo | clear | mute | unmute | en | pt]' }
    }

    if ((await read($, mascot)) === null) await say($, 'm_hello', 'hello')
    await openPane($)

    return { text: 'Media Review Panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const E = $.ui.resolve(e)
    const { Box, Text, Button, Link, Code, Progress } = E
    const Svg = e.surface === 'terminal' ? undefined : (E as { Svg?: ElementConstructor<SvgProps> }).Svg
    const [rv, allCalls, m, col, oc, isMuted, lg] = await Promise.all([
      read($, review),
      read($, calls),
      read($, mascot),
      read($, collapsed),
      read($, openCalls),
      read($, muted),
      read($, lang),
    ])
    const t = strings(lg)
    const chartW = Math.round(Math.min(560, Math.max(240, e.props.bodyColumns * 7.2 - 28)))
    const list = rv === null ? [] : allCalls.filter(c => c.n >= rv.firstCall)
    const status = rv?.status ?? 'idle'
    const statusColor = STATUS_COLOR[status]
    const steps = rv?.steps ?? []
    const stepsDone = steps.filter(s => s.status === 'done').length
    const mood: Mood = m?.mood ?? 'hello'
    const bubble = m ? mascotText(lg, m.key) : mascotText(lg, 'm_hello')
    const statusWord = t[`status_${status}` as 'status_idle']
    const title = rv?.title ?? (rv?.isAuto ? t.autoTitle : t.untitled)
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
            {!isMuted && mascotArt(36)}
            <Box flexDirection="column" flexShrink={1}>
              <Text color={C.bright} weight="semibold" wrap="truncate-end">
                {title}
              </Text>
              <Text color={statusColor} mono size="caption">
                ● {statusWord}
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
            color={isNow ? C.onAccent : wasSeen ? C.text : C.dim}
            backgroundColor={isNow ? C.accent : wasSeen ? C.border2 : undefined}
          >
            {` ${levelName(lg, l)} `}
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
      ]
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

      if (c.calculated) parts.push(`${c.calculated} ${t.calculated}`)
      if (c.unchecked) parts.push(`${c.unchecked} ${t.unchecked}`)

      return (
        <Text mono size="caption" color={C.dim}>
          {sourceTxt} · {t.check}: <Text color={color}>{parts.join(' · ')}</Text>
        </Text>
      )
    }

    const tableOf = (ds: Dataset) => {
      const shown = ds.rows.slice(0, 25)
      const xIdx = Math.max(0, ds.columns.indexOf(ds.x ?? ds.columns[0] ?? ''))
      const missing = new Set(ds.check.missingCells)
      const cellText = (v: unknown, ci: number): string => {
        if (v === null || v === undefined) return '—'
        if (ci === xIdx) return String(v)

        const n = toNumber(v)

        return n === undefined ? String(v) : fmt(n, lg, seriesUnit(ds.columns[ci] ?? '', ds), ds.currency ?? rv?.currency)
      }
      const widths = ds.columns.map((h, ci) =>
        Math.min(ci === xIdx ? 30 : 16, Math.max(h.length, ...shown.map(r => cellText(r[ci], ci).length))),
      )
      const pad = (s: string, w: number, right: boolean) => {
        const cut = s.length > w ? `${s.slice(0, w - 1)}…` : s

        return right ? cut.padStart(w) : cut.padEnd(w)
      }

      return (
        <Box flexDirection="column" overflowX="scroll">
          <Text mono size="caption" color={C.dim}>
            {ds.columns.map((h, ci) => pad(h, widths[ci] ?? 8, ci !== xIdx)).join('  ')}
          </Text>
          {shown.map((row, ri) => (
            <Text mono size="caption" color={C.text}>
              {ds.columns.map((_, ci) => (
                <Text color={missing.has(`${ri}:${ci}`) ? C.err : ds.calculated.includes(ds.columns[ci] ?? '') ? C.muted : C.text}>
                  {pad(cellText(row[ci], ci), widths[ci] ?? 8, ci !== xIdx)}
                  {ci < ds.columns.length - 1 ? '  ' : ''}
                </Text>
              ))}
            </Text>
          ))}
          {ds.totalRows > shown.length ? muteDim(t.showing(shown.length, ds.totalRows)) : null}
        </Box>
      )
    }

    const chartsOf = (ds: Dataset) => {
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
                {s} <Text color={C.dim} mono size="caption">{stats.join(' · ')}</Text>
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
                {s}
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

      const warnings = rv === null ? [] : [...(rv.isDemo ? [t.sample] : []), ...rv.warnings, ...autoWarnings(rv, list, lg)]

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

      for (const c of [...list].reverse().slice(0, 40)) {
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

      out.push(muteDim(t.checkLegend))

      return out
    }

    const header = (
      <Box flexDirection="column" borderStyle="single" borderColor={C.border} backgroundColor={C.card} paddingX={1} gap={1}>
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
          {!isMuted ? mascotArt(52) : null}
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

    const footer = (
      <Box flexDirection="column" borderStyle="single" borderColor={C.border} paddingX={1}>
        <Text color={C.bright} weight="semibold" size="footnote">
          {t.madeBy}
        </Text>
        <Box flexDirection="row" gap={2}>
          <Link href={LINKEDIN} label="LinkedIn" />
          <Link href={INSTAGRAM} label="Instagram" />
        </Box>
        <Text color={C.dim} size="caption">
          {t.readOnly}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" backgroundColor={C.bg} padding={1} gap={1}>
        {header}
        {sample}
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
