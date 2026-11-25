import type { LaunchAlert, LaunchFact, LaunchPiece, PieceKind } from '../types'

/**
 * What a call that changes an ad account builds or changes, read from the call
 * itself before it runs, so the person sees it while the approval is asked.
 *
 * The official Meta Ads connector sends everything structured: names, budgets
 * in the currency's smallest unit, dates, targeting, links. Other tools that
 * change an account (a script, another connector) are logged as a piece with
 * no details, so the panel still says that something changed.
 */

type In = Record<string, unknown>

// The connector names these as zero-decimal: a budget of 5000 is 5000, not 50.00.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'TWD', 'VND', 'IDR', 'COP'])

/** How many of the smallest unit make one unit of the currency. */
export const offsetOf = (currency?: string): number => (currency && ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100)

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : undefined)

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim())

  return undefined
}

/** A field the connector takes as a JSON string, or as an object. */
const json = (v: unknown): unknown => {
  if (typeof v !== 'string') return v

  try {
    return JSON.parse(v)
  } catch {
    return undefined
  }
}

const obj = (v: unknown): In | undefined => {
  const o = json(v)

  return o !== null && typeof o === 'object' && !Array.isArray(o) ? (o as In) : undefined
}

const list = (v: unknown): unknown[] => {
  const o = json(v)

  return Array.isArray(o) ? o : []
}

/** The piece a tool builds, by its name. */
export const kindOf = (tool: string): PieceKind => {
  const name = (tool.split('__').pop() ?? tool).toLowerCase()

  if (/create_campaign/.test(name)) return 'campaign'
  if (/create_ad_?set/.test(name)) return 'adset'
  if (/create_creative/.test(name)) return 'creative'
  if (/create_ad$/.test(name)) return 'ad'
  if (/boost/.test(name)) return 'boost'
  if (/upload|finalize/.test(name)) return 'media'
  if (/activate|publish|launch/.test(name)) return 'activate'
  if (/duplicate/.test(name)) return 'duplicate'
  if (/delete|remove|archive/.test(name)) return 'delete'
  if (/update|edit|change|set_|pause/.test(name)) return 'update'

  return 'other'
}

const COUNTRY: Record<string, [string, string]> = {
  BR: ['Brazil', 'Brasil'],
  PT: ['Portugal', 'Portugal'],
  US: ['United States', 'Estados Unidos'],
  AR: ['Argentina', 'Argentina'],
  MX: ['Mexico', 'México'],
  ES: ['Spain', 'Espanha'],
}

/** Where an ad set runs, in a few words: countries, regions, cities and radius. */
export const whereOf = (targeting: In | undefined, lang: 'en' | 'pt'): string | undefined => {
  const geo = targeting ? obj(targeting.geo_locations) : undefined

  if (!geo) return undefined

  const parts: string[] = []
  const countries = list(geo.countries).map(c => String(c))
  const named = (xs: unknown[]) => xs.map(x => str(obj(x)?.name) ?? str(x)).filter((x): x is string => x !== undefined)

  for (const c of countries) parts.push(COUNTRY[c.toUpperCase()]?.[lang === 'pt' ? 1 : 0] ?? c)

  const regions = named(list(geo.regions))
  const cities = list(geo.cities).map(x => obj(x)).filter((x): x is In => x !== undefined)
  const custom = list(geo.custom_locations).length
  const zips = list(geo.zips).length

  if (regions.length > 0) parts.push(regions.length <= 3 ? regions.join(', ') : lang === 'pt' ? `${regions.length} estados ou regiões` : `${regions.length} regions`)
  if (cities.length > 0) {
    const names = cities.map(c => str(c.name) ?? str(c.key) ?? '').filter(Boolean)
    const r = num(cities[0]?.radius)
    const unit = str(cities[0]?.distance_unit) === 'mile' ? 'mi' : 'km'
    const text = names.length > 0 && names.length <= 3 ? names.join(', ') : lang === 'pt' ? `${cities.length} cidades` : `${cities.length} cities`

    parts.push(r ? `${text} (+${r} ${unit})` : text)
  }
  if (custom > 0) parts.push(lang === 'pt' ? `${custom} ${custom === 1 ? 'ponto no mapa' : 'pontos no mapa'}` : `${custom} map pin${custom === 1 ? '' : 's'}`)
  if (zips > 0) parts.push(lang === 'pt' ? `${zips} CEPs` : `${zips} ZIP codes`)

  return parts.length > 0 ? parts.join(' · ') : undefined
}

const budget = (cadence: 'daily' | 'total' | 'cap' | 'bid', minor: unknown, currency?: string): LaunchFact | undefined => {
  const m = num(minor)

  return m === undefined ? undefined : { k: 'budget', cadence, minor: m, amount: m / offsetOf(currency), currency }
}

const firstText = (one: unknown, many: unknown): string | undefined => {
  const s = str(one) ?? str(list(many)[0])

  return s === undefined ? undefined : s.length > 140 ? `${s.slice(0, 139)}…` : s
}

const linkOf = (url: string | undefined, tags?: string): LaunchFact | undefined =>
  url === undefined ? undefined : { k: 'link', url, hasUtm: (tags !== undefined && /utm_/i.test(tags)) || /[?&]utm_/i.test(url) }

/** The link of an inline creative, wherever the spec puts it. */
const creativeLink = (spec: In | undefined): string | undefined => {
  const story = spec ? obj(spec.object_story_spec) : undefined
  const link = story ? obj(story.link_data) : undefined
  const video = story ? obj(story.video_data) : undefined
  const cta = video ? obj(video.call_to_action) : undefined
  const value = cta ? obj(cta.value) : undefined

  return str(link?.link) ?? str(value?.link) ?? str(spec?.link_url)
}

const mediaOf = (o: In): LaunchFact | undefined => {
  if (o.cards !== undefined) return { k: 'media', v: 'carousel', count: list(o.cards).length }
  if (o.multi_media !== undefined) return { k: 'media', v: 'multi', count: list(o.multi_media).length }
  if (o.product_set_id !== undefined) return { k: 'media', v: 'catalog' }
  if (o.object_story_id !== undefined || o.source_instagram_media_id !== undefined) return { k: 'media', v: 'post' }
  if (o.video_id !== undefined) return { k: 'media', v: 'video' }
  if (o.image_hash !== undefined || o.image_url !== undefined) return { k: 'media', v: 'image' }

  return undefined
}

// Budget fields an update can carry, and the cadence of each.
const BUDGET_FIELDS: Record<string, 'daily' | 'total' | 'cap' | 'bid'> = {
  daily_budget: 'daily',
  lifetime_budget: 'total',
  spend_cap: 'cap',
  daily_spend_cap: 'cap',
  lifetime_spend_cap: 'cap',
  bid_amount: 'bid',
}

export type PieceContext = {
  lang: 'en' | 'pt'
  /** The account's currency, when the session read it. */
  currency?: string
  /** A daily budget above this, in the account currency, is a red alert. */
  budgetCap?: number
  /** Every new campaign name should match this. */
  namePattern?: RegExp
  /** The Meta accounts this review read, without act_. */
  accounts: string[]
  /** A value the session read before the change, for "from → to". */
  before?: (entityId: string, field: string) => number | undefined
}

/** The piece a call builds or changes, from what the call sends. */
export const pieceOf = (tool: string, input: In, ctx: PieceContext): Omit<LaunchPiece, 'n' | 'at' | 'platform' | 'state'> => {
  const kind = kindOf(tool)
  const facts: LaunchFact[] = []
  const alerts: LaunchAlert[] = []
  const account = str(input.ad_account_id)?.replace(/^act_/i, '')
  const cur = ctx.currency
  const add = (f: LaunchFact | undefined) => {
    if (f) facts.push(f)
  }
  let name: string | undefined
  let parent: string | undefined
  let entity: string | undefined
  let scope: string[] | undefined

  if (kind === 'campaign') {
    name = str(input.campaign_name)
    add(str(input.objective) ? { k: 'objective', v: String(input.objective) } : undefined)
    add(budget('daily', input.campaign_daily_budget, cur))
    add(budget('total', input.campaign_lifetime_budget, cur))
    add(budget('cap', input.campaign_spend_cap, cur))
    if (input.campaign_start_time !== undefined || input.campaign_stop_time !== undefined) {
      add({ k: 'dates', start: str(input.campaign_start_time), end: str(input.campaign_stop_time) })
    }

    const special = list(input.special_ad_categories).map(String).filter(c => c !== 'NONE')

    if (special.length > 0) add({ k: 'category', v: special.join(', ') })
    if (ctx.namePattern && name && !ctx.namePattern.test(name)) alerts.push({ level: 'warn', code: 'nameRule', v: ctx.namePattern.source })
  } else if (kind === 'adset') {
    name = str(input.ad_set_name)
    parent = str(input.campaign_id)
    add(str(input.optimization_goal) ? { k: 'goal', v: String(input.optimization_goal) } : undefined)
    add(budget('daily', input.daily_budget, cur))
    add(budget('total', input.lifetime_budget, cur))
    add(budget('bid', input.bid_amount, cur))
    if (input.start_time !== undefined || input.end_time !== undefined) add({ k: 'dates', start: str(input.start_time), end: str(input.end_time) })

    const t = obj(input.targeting)
    const where = whereOf(t, ctx.lang)

    add(where ? { k: 'where', v: where } : undefined)

    const range = list(t?.age_range).map(num)

    if (range.length === 2) add({ k: 'ages', min: range[0], max: range[1], isSuggestion: true })
    else if (t && (t.age_min !== undefined || t.age_max !== undefined)) add({ k: 'ages', min: num(t.age_min), max: num(t.age_max) })

    const auto = obj(t?.targeting_automation)

    if (t) add({ k: 'audience', v: num(auto?.advantage_audience) === 0 ? 'manual' : 'advantage' })
  } else if (kind === 'creative') {
    name = str(input.name)
    add(mediaOf(input))
    add(linkOf(str(input.link_url), str(input.url_tags)))
    add(str(input.call_to_action_type) ? { k: 'button', v: String(input.call_to_action_type) } : undefined)

    const text = firstText(input.message, input.primary_texts)
    const head = firstText(input.headline, input.headlines)

    add(text ? { k: 'text', v: text } : undefined)
    add(head ? { k: 'headline', v: head } : undefined)
  } else if (kind === 'ad') {
    name = str(input.ad_name)
    parent = str(input.ad_set_id)

    const spec = obj(input.creative)
    const ref = str(spec?.creative_id)

    if (ref) add({ k: 'media', v: 'creative', ref })
    else if (spec) add(mediaOf({ ...spec, ...(obj(spec.object_story_spec) ?? {}) }) ?? { k: 'media', v: 'image' })
    add(linkOf(creativeLink(spec), str(spec?.url_tags)))
  } else if (kind === 'boost') {
    name = str(input.ad_name) ?? str(input.name)
    add(budget('daily', input.daily_budget, cur))
    add(budget('total', input.lifetime_budget ?? input.budget, cur))
    if (input.start_time !== undefined || input.end_time !== undefined) add({ k: 'dates', start: str(input.start_time), end: str(input.end_time) })
    add(linkOf(str(input.link_url) ?? str(input.website_url)))
  } else if (kind === 'media') {
    const file = str(input.file_path) ?? str(input.path) ?? str(input.file_name) ?? str(input.name) ?? str(input.url)

    add({ k: 'media', v: 'file', ref: file?.split('/').pop() })
  } else if (kind === 'update' || kind === 'delete' || kind === 'activate') {
    entity = str(input.entity_type) ?? str(input.level)

    const id = str(input.entity_id) ?? str(input.id)

    if (id) add({ k: 'target', entity: entity ?? '', id })

    const fields = obj(input.fields) ?? {}

    for (const [field, value] of Object.entries(fields)) {
      const cadence = BUDGET_FIELDS[field]

      if (cadence) {
        const to = num(value)
        const from = id && ctx.before ? ctx.before(id, field) : undefined

        if (to === undefined) continue

        const off = offsetOf(cur)

        add({ k: 'change', field, to: String(to), from: from === undefined ? undefined : String(from), amounts: [from === undefined ? undefined : from / off, to / off], currency: cur })
        if (cadence === 'daily') facts.push({ k: 'budget', cadence, minor: to, amount: to / off, currency: cur })
        if (from !== undefined && from > 0 && to / from >= 3) alerts.push({ level: 'warn', code: 'jump', n: Math.round((to / from) * 10) / 10 })
      } else {
        const to = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : field === 'targeting' ? '…' : JSON.stringify(value).slice(0, 60)

        add({ k: 'change', field, to })
        if (field === 'status' && to === 'DELETED') alerts.push({ level: 'danger', code: 'deleteForever' })
      }
    }

    if (kind === 'activate') {
      alerts.push({ level: 'danger', code: 'goesLive' })

      // A draft publish names the exact objects it puts live.
      const ids = list(input.object_ids).map(x => String(x)).filter(x => /^\d{5,}$/.test(x))

      if (ids.length > 0) scope = ids
    }
    if (kind === 'delete') alerts.push({ level: 'danger', code: 'deleteForever' })
  } else if (kind === 'duplicate') {
    entity = str(input.entity_type)

    const rows = list(input.copy_requests).map(r => obj(r)).filter((r): r is In => r !== undefined)
    const each = num(rows[0]?.copy_count) ?? 1

    add({ k: 'copies', n: Math.max(1, rows.length) * each })
  } else alerts.push({ level: 'info', code: 'noDetails' })

  // What every new piece with money in it should pass.
  for (const f of facts) {
    if (f.k !== 'budget' || f.cadence === 'bid') continue
    if (offsetOf(f.currency) === 100 && f.amount > 0 && f.amount < 5) alerts.push({ level: 'warn', code: 'cents', v: String(f.minor) })
    if (f.cadence === 'daily' && ctx.budgetCap !== undefined && f.amount > ctx.budgetCap) alerts.push({ level: 'danger', code: 'over', v: String(ctx.budgetCap) })
  }

  const dates = facts.find((f): f is Extract<LaunchFact, { k: 'dates' }> => f.k === 'dates')
  const hasTotal = facts.some(f => f.k === 'budget' && f.cadence === 'total')
  const hasDaily = facts.some(f => f.k === 'budget' && f.cadence === 'daily')

  if ((kind === 'campaign' || kind === 'adset') && hasTotal && !dates?.end) alerts.push({ level: 'warn', code: 'lifetimeNoEnd' })
  if ((kind === 'campaign' || kind === 'adset') && hasDaily && !dates?.end) alerts.push({ level: 'info', code: 'noEnd' })
  if (facts.some(f => f.k === 'link' && !f.hasUtm)) alerts.push({ level: 'warn', code: 'noUtm' })
  if (account && ctx.accounts.length > 0 && !ctx.accounts.includes(account)) alerts.push({ level: 'warn', code: 'otherAccount', v: account })

  return { kind, tool, name, parent, account, entity, scope, facts, alerts }
}

const ID_KEYS: Partial<Record<PieceKind, string[]>> = {
  campaign: ['campaign_id'],
  adset: ['ad_set_id', 'adset_id'],
  creative: ['creative_id'],
  ad: ['ad_id'],
  boost: ['ad_id'],
  update: ['entity_id'],
  activate: ['entity_id'],
}

export type PieceResult = { id?: string; result?: string; errors: number; error?: string }

/** What the platform answered: the new ID, its status, and any validation errors. */
export const resultOf = (kind: PieceKind, raw: string): PieceResult => {
  const out: PieceResult = { errors: 0 }
  // The connector often answers JSON inside a string ("result":"{\"status\":...}"): read through it.
  const text = raw.replace(/\\+"/g, '"')
  const pick = (key: string) => new RegExp(`"${key}"\\s*:\\s*"?(\\d{5,})"?`).exec(text)?.[1]

  for (const key of [...(ID_KEYS[kind] ?? []), 'id']) {
    const id = pick(key)

    if (id) {
      out.id = id
      break
    }
  }

  const status = /"(?:status|effective_status|configured_status)"\s*:\s*"([A-Z_]+)"/.exec(text)?.[1]

  out.result = /"is_draft"\s*:\s*true/.test(text) ? 'DRAFT' : status

  // A list, or the same list written as a string ("active_errors":"[]").
  const errs = /"active_errors"\s*:\s*"?\[([\s\S]*?)\]"?\s*[,}]/.exec(text)?.[1]?.trim()

  if (errs) out.errors = Math.max(1, (errs.match(/\{/g) ?? []).length)

  const isErr = /^\s*\{\s*"error"\s*:\s*[{"]/.test(text) || /"error"\s*:\s*\{\s*"(?:message|code|type)"/.test(text) || /"success"\s*:\s*false/.test(text)
  const err = isErr ? (/"(?:message|error_user_msg|error_message)"\s*:\s*"([^"]{1,240})/.exec(text)?.[1] ?? text.slice(0, 200)) : undefined

  if (err) out.error = err

  return out
}

/** A budget the session read before a change, next to the entity's ID in any response. */
export const findBefore = (texts: string[], entityId: string, field: string): number | undefined => {
  for (const text of texts) {
    let at = text.indexOf(`"${entityId}"`)

    while (at >= 0) {
      const window = text.slice(Math.max(0, at - 1200), at + 1200)
      const m = new RegExp(`"${field}"\\s*:\\s*"?(\\d+)"?`).exec(window)

      if (m) return Number(m[1])
      at = text.indexOf(`"${entityId}"`, at + 1)
    }
  }

  return undefined
}

/** A piece that was built but still waits for the next one: a campaign with no ad set, an ad set with no ad. */
export const missingOf = (pieces: LaunchPiece[]): { kind: 'adset' | 'ad'; under: LaunchPiece }[] => {
  const out: { kind: 'adset' | 'ad'; under: LaunchPiece }[] = []

  for (const p of pieces) {
    if (p.state !== 'ok' || !p.id) continue
    if (p.kind === 'campaign' && !pieces.some(c => c.kind === 'adset' && c.parent === p.id && c.state !== 'denied')) out.push({ kind: 'adset', under: p })
    if (p.kind === 'adset' && !pieces.some(c => c.kind === 'ad' && c.parent === p.id && c.state !== 'denied')) out.push({ kind: 'ad', under: p })
  }

  return out
}

/** The address of a piece in Ads Manager. */
export const managerLink = (p: LaunchPiece): string | undefined => {
  if (!p.id || !p.account || p.platform !== 'Meta Ads') return undefined

  const base = 'https://adsmanager.facebook.com/adsmanager/manage'

  if (p.kind === 'campaign') return `${base}/campaigns?act=${p.account}&selected_campaign_ids=${p.id}`
  if (p.kind === 'adset') return `${base}/adsets?act=${p.account}&selected_adset_ids=${p.id}`
  if (p.kind === 'ad' || p.kind === 'boost') return `${base}/ads?act=${p.account}&selected_ad_ids=${p.id}`

  return undefined
}

/** Links of earlier pieces on another site: a launch usually sends every ad to one place. */
export const domainOf = (url: string): string => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0]?.toLowerCase() ?? url

// What a person checks before something goes live.
const LIVE_FACTS = new Set(['objective', 'goal', 'budget', 'dates', 'where', 'ages', 'audience', 'link', 'button', 'change'])

/**
 * What an activation puts live, from the pieces of this launch: the campaign,
 * its ad sets and their ads (and the creatives those ads use). Activating an
 * ad set or an ad brings its own branch. Only the facts worth a last look.
 */
export const liveScope = (p: LaunchPiece, pieces: LaunchPiece[]): { piece: LaunchPiece; facts: LaunchFact[] }[] => {
  const target = p.facts.find((f): f is Extract<LaunchFact, { k: 'target' }> => f.k === 'target')

  if (p.kind !== 'activate' || !target) return []

  const built = pieces.filter(x => x.state === 'ok' && x.id && x.kind !== 'update' && x.kind !== 'activate')
  const ids = new Set([target.id, ...(p.scope ?? [])])
  const roots = built.filter(x => x.id && ids.has(x.id))
  const campaigns = roots.filter(x => x.kind === 'campaign')
  const adsets = [...roots.filter(x => x.kind === 'adset'), ...built.filter(x => x.kind === 'adset' && campaigns.some(c => c.id === x.parent))]
  const ads = [...roots.filter(x => x.kind === 'ad'), ...built.filter(x => x.kind === 'ad' && adsets.some(s => s.id === x.parent))]
  const creativeIds = new Set(
    ads.flatMap(a => a.facts.filter((f): f is Extract<LaunchFact, { k: 'media' }> => f.k === 'media' && f.v === 'creative').map(f => f.ref ?? '')),
  )
  const creatives = built.filter(x => x.kind === 'creative' && x.id && creativeIds.has(x.id))

  // Changes staged since the last go-live, on what this one publishes (or all, when it names nothing but itself).
  const at = pieces.indexOf(p)
  const lastLive = pieces.slice(0, at < 0 ? pieces.length : at).map(x => x.kind).lastIndexOf('activate')
  const staged = pieces
    .slice(lastLive + 1, at < 0 ? pieces.length : at)
    .filter(x => x.kind === 'update' && x.state === 'ok')
    .filter(x => {
      const t = x.facts.find((f): f is Extract<LaunchFact, { k: 'target' }> => f.k === 'target')

      return t !== undefined && (p.scope === undefined || ids.has(t.id))
    })
  const unique = [...new Set([...campaigns, ...adsets, ...ads, ...creatives, ...staged])]

  return unique
    .map(piece => ({ piece, facts: piece.facts.filter(f => LIVE_FACTS.has(f.k) || (piece.kind === 'update' && f.k === 'target')) }))
    .filter(x => x.facts.length > 0)
}
