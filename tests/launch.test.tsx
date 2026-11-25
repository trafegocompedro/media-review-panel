import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { findBefore, kindOf, liveScope, managerLink, missingOf, pieceOf, resultOf } from '../hooks/launch'
import { robot } from '../hooks/mascot'
import { factText, launchAlertText } from '../hooks/plain'
import type { LaunchPiece } from '../types'

// Every account, ID, name and link here is made up.
const META = 'mcp__meta__'
const CTX = { lang: 'pt' as const, currency: 'BRL', accounts: ['123456789'] }
const codes = (p: { alerts: { code: string }[] }) => p.alerts.map(a => a.code)

test('kinds: each Meta tool that changes an account is one kind of piece', () => {
  expect(kindOf(`${META}ads_create_campaign`)).toBe('campaign')
  expect(kindOf(`${META}ads_create_ad_set`)).toBe('adset')
  expect(kindOf(`${META}ads_create_creative`)).toBe('creative')
  expect(kindOf(`${META}ads_create_ad`)).toBe('ad')
  expect(kindOf(`${META}ads_update_entity`)).toBe('update')
  expect(kindOf(`${META}ads_activate_entity`)).toBe('activate')
  expect(kindOf(`${META}ads_duplicate_entity`)).toBe('duplicate')
  expect(kindOf(`${META}ads_creative_upload_media`)).toBe('media')
  expect(kindOf(`${META}ads_boost_ig_post`)).toBe('boost')
  expect(kindOf(`${META}ads_pixel_event_create`)).toBe('other')
})

test('campaign: the budget reads in reais, not in the cents the platform receives', () => {
  const p = pieceOf(`${META}ads_create_campaign`, { ad_account_id: '123456789', campaign_name: 'Loja | Leads', objective: 'OUTCOME_LEADS', campaign_daily_budget: 5000 }, CTX)
  const budget = p.facts.find(f => f.k === 'budget')

  expect(budget).toEqual({ k: 'budget', cadence: 'daily', minor: 5000, amount: 50, currency: 'BRL' })
  expect(factText(budget!, 'pt')).toEqual({ label: 'Verba por dia', value: 'R$ 50,00', note: 'a Meta recebe 5000, em centavos', isBig: true })
  expect(factText(p.facts.find(f => f.k === 'objective')!, 'pt')?.value).toBe('Cadastros (leads)')
  // A daily budget with no end date spends until someone pauses it.
  expect(codes(p)).toEqual(['noEnd'])
})

test('campaign: your own name pattern and budget limit, from the local settings', () => {
  const p = pieceOf(
    `${META}ads_create_campaign`,
    { ad_account_id: '123456789', campaign_name: 'Loja Leads', objective: 'OUTCOME_LEADS', campaign_daily_budget: 90000, campaign_stop_time: '2026-12-31T23:59:00-0300' },
    { ...CTX, budgetCap: 300, namePattern: /^[A-Z]{4}-M\d{3}/ },
  )

  expect(codes(p)).toEqual(['nameRule', 'over'])
  expect(launchAlertText(p.alerts[1]!, { ...p, n: 1, at: 0, platform: 'Meta Ads', state: 'waiting' }, 'pt')?.title).toBe('Verba acima do seu limite de R$ 300,00 por dia')
})

test('ad set: a budget without the cents, a total with no end, where and who', () => {
  const p = pieceOf(
    `${META}ads_create_ad_set`,
    {
      ad_account_id: '123456789',
      campaign_id: '120000000000001',
      ad_set_name: 'Recife | 25-45',
      optimization_goal: 'LEAD_GENERATION',
      lifetime_budget: 50,
      targeting: JSON.stringify({
        geo_locations: { countries: ['BR'], cities: [{ key: '1', name: 'Recife', radius: 15, distance_unit: 'kilometer' }] },
        age_range: [25, 45],
      }),
    },
    CTX,
  )
  const text = (k: string) => factText(p.facts.find(f => f.k === k)!, 'pt')?.value

  expect(p.parent).toBe('120000000000001')
  expect(text('where')).toBe('Brasil · Recife (+15 km)')
  expect(text('ages')).toBe('25 a 45 anos, como sugestão (Advantage+)')
  expect(text('audience')).toBe('Advantage+: a Meta acha as pessoas')
  expect(text('goal')).toBe('cadastros no formulário')
  expect(codes(p)).toEqual(['cents', 'lifetimeNoEnd'])

  const cents = launchAlertText(p.alerts[0]!, { ...p, n: 1, at: 0, platform: 'Meta Ads', state: 'waiting' }, 'pt')

  expect(cents?.body).toBe('A Meta lê a verba em centavos: 50 vira R$ 0,50. Se a ideia era R$ 50, o número certo é 5000.')
})

test('creative and ad: a link without UTM is flagged, one with UTM is not', () => {
  const bare = pieceOf(`${META}ads_create_creative`, { ad_account_id: '123456789', page_id: '1', name: 'Oferta', link_url: 'https://loja.example/oferta', image_hash: 'abc', call_to_action_type: 'SIGN_UP', message: 'Garanta a sua vaga.' }, CTX)
  const tagged = pieceOf(
    `${META}ads_create_creative`,
    { ad_account_id: '123456789', page_id: '1', link_url: 'https://loja.example/oferta', url_tags: 'utm_source=facebook&utm_medium=cpc', video_id: '9' },
    CTX,
  )
  const ad = pieceOf(`${META}ads_create_ad`, { ad_account_id: '123456789', ad_set_id: '120000000000002', ad_name: 'Oferta | vídeo', creative: JSON.stringify({ creative_id: '120000000000003' }) }, CTX)

  expect(codes(bare)).toEqual(['noUtm'])
  expect(factText(bare.facts.find(f => f.k === 'button')!, 'pt')?.value).toBe('Cadastre-se')
  expect(factText(bare.facts.find(f => f.k === 'link')!, 'pt')).toEqual({ label: 'Leva para', value: 'loja.example/oferta', note: '! sem UTM' })
  expect(codes(tagged)).toEqual([])
  expect(factText(tagged.facts.find(f => f.k === 'media')!, 'pt')?.value).toBe('vídeo')
  expect(ad.parent).toBe('120000000000002')
  expect(factText(ad.facts.find(f => f.k === 'media')!, 'pt')?.value).toBe('criativo 120000000000003')
})

test('change: a budget read earlier shows from and to, and a big jump is flagged', () => {
  const read = ['{"data":[{"id":"120000000000002","name":"Recife","daily_budget":"5000","status":"ACTIVE"}]}']

  expect(findBefore(read, '120000000000002', 'daily_budget')).toBe(5000)

  const p = pieceOf(
    `${META}ads_update_entity`,
    { ad_account_id: '123456789', entity_id: '120000000000002', entity_type: 'ad_set', fields: JSON.stringify({ daily_budget: 50000 }) },
    { ...CTX, before: (id, field) => findBefore(read, id, field) },
  )

  expect(factText(p.facts.find(f => f.k === 'change')!, 'pt')?.value).toBe('verba por dia: R$ 50,00 → R$ 500,00')
  expect(codes(p)).toEqual(['jump'])

  const gone = pieceOf(`${META}ads_update_entity`, { entity_id: '120000000000002', entity_type: 'ad', fields: '{"status":"DELETED"}' }, CTX)

  expect(codes(gone)).toEqual(['deleteForever'])
  expect(factText(gone.facts.find(f => f.k === 'change')!, 'pt')?.value).toBe('estado → apagado')
})

test('go live: activating is flagged before it runs, and the flag fades once it ran', () => {
  const p = pieceOf(`${META}ads_activate_entity`, { ad_account_id: '123456789', entity_id: '120000000000001', entity_type: 'campaign' }, CTX)
  const piece = (state: LaunchPiece['state']): LaunchPiece => ({ ...p, n: 1, at: 0, platform: 'Meta Ads', state })

  expect(codes(p)).toEqual(['goesLive'])
  expect(launchAlertText(p.alerts[0]!, piece('waiting'), 'pt')?.title).toBe('Isto põe no ar e pode começar a gastar')
  expect(launchAlertText(p.alerts[0]!, piece('ok'), 'pt')).toBeUndefined()
})

test('another account than the review read is flagged', () => {
  const p = pieceOf(`${META}ads_create_campaign`, { ad_account_id: '987654321', campaign_name: 'X', objective: 'OUTCOME_SALES', campaign_stop_time: '2026-12-01' }, CTX)

  expect(codes(p)).toEqual(['otherAccount'])
})

test('answers: the new ID, a draft, validation errors and a refusal', () => {
  expect(resultOf('campaign', '{"campaign_id":"120000000000001","status":"DRAFT","active_errors":[]}')).toEqual({ id: '120000000000001', result: 'DRAFT', errors: 0 })
  expect(resultOf('adset', '{"ad_set_id":"120000000000002","is_draft":true,"active_errors":[{"error_summary":"a"},{"error_summary":"b"}]}')).toEqual({
    id: '120000000000002',
    result: 'DRAFT',
    errors: 2,
  })
  expect(resultOf('ad', '{"error":{"message":"Invalid parameter","code":100}}').error).toBe('Invalid parameter')
})

test('receipt: what is still missing, and the link to each piece', () => {
  const base = { tool: 't', platform: 'Meta Ads', at: 0, facts: [], alerts: [], account: '123456789' }
  const pieces: LaunchPiece[] = [
    { ...base, n: 1, kind: 'campaign', state: 'ok', id: '120000000000001', name: 'Loja' },
    { ...base, n: 2, kind: 'adset', state: 'ok', id: '120000000000002', parent: '120000000000001', name: 'Recife' },
  ]

  expect(missingOf(pieces).map(m => `${m.kind}:${m.under.name}`)).toEqual(['ad:Recife'])
  expect(managerLink(pieces[1]!)).toBe('https://adsmanager.facebook.com/adsmanager/manage/adsets?act=123456789&selected_adset_ids=120000000000002')
})

test('Bip: building and going live have their own poses', () => {
  expect(robot('build')).toMatch(/st-build/)
  expect(robot('launch')).toMatch(/st-launch/)
  expect(robot('launch')).toMatch(/fxfa/)
})

const PANE = {
  plugin: 'media-review-panel',
  component: 'Pane',
  requestId: 'media-review',
  props: { title: 'Media Review', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 400 }, view: {} },
} as const

const ANSWERS: Record<string, string> = {
  ads_get_ad_accounts: '{"data":[{"id":"act_123456789","name":"Loja Teste","currency":"BRL","timezone_name":"America/Sao_Paulo"}]}',
  ads_create_campaign: '{"campaign_id":"120000000000001","status":"PAUSED"}',
  ads_create_ad_set: '{"ad_set_id":"120000000000002","status":"PAUSED"}',
  ads_create_creative: '{"creative_id":"120000000000003"}',
  ads_create_ad: '{"ad_id":"120000000000004","status":"PAUSED"}',
  ads_activate_entity: '{"id":"120000000000001","status":"ACTIVE"}',
}

const engine = (on: On, seen: string[][], t$: Engine, denied?: string) => {
  mock.clock(on, { now: Date.parse('2026-11-25T12:00:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'media-review' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', async (_, e) => {
    const name = String(e.tool).split('__').pop() ?? ''

    // While the call waits for approval, the card is already in the panel.
    if (name !== 'ads_get_ad_accounts') {
      const ui = await t$.ui.mount({ ...PANE, surface: 'desktop' })
      const texts = (await ui.findAll({ type: 'Text' })).map(x => x.text)

      seen.push(texts)
      await ui.unmount()
    }

    // You said no to this one in the approval.
    if (name === denied) return { deny: 'The user said no.' }

    const text = ANSWERS[name] ?? '{}'

    return { result: text, text }
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`launch on ${surface}: the card is there before the approval, the belt fills, the receipt links each piece`, async ($, on) => {
    const seen: string[][] = []
    engine(on, seen, $)
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    await $.prompt.submit({ text: 'Cria a campanha de cadastros da loja, por favor', wait: false, origin: { kind: 'composer' } })
    await $.tool.call({ tool: `${META}ads_get_ad_accounts`, ad_account_id: 'act_123456789' })
    await $.tool.call({ tool: `${META}ads_create_campaign`, ad_account_id: '123456789', campaign_name: 'Loja | Cadastros', objective: 'OUTCOME_LEADS', buying_type: 'AUCTION', campaign_daily_budget: 5000 })

    // The card of the campaign, while its approval was being asked.
    expect(seen[0]?.some(x => /^Campanha: Loja \| Cadastros$/.test(x))).toBe(true)
    expect(seen[0]?.some(x => /esperando a sua aprovação/.test(x))).toBe(true)
    expect(seen[0]?.some(x => x === 'R$ 50,00')).toBe(true)
    expect(seen[0]?.some(x => x === 'a Meta recebe 5000, em centavos')).toBe(true)
    // The card says it all: no second, vaguer alert about the same call.
    expect(seen[0]?.some(x => /O Claude pediu uma mudança na conta/.test(x))).toBe(false)
    expect(seen[0]?.some(x => /^Montando: campanha “Loja \| Cadastros”\. Confira a ficha antes de aprovar\.$/.test(x))).toBe(true)

    await $.tool.call({
      tool: `${META}ads_create_ad_set`,
      ad_account_id: '123456789',
      campaign_id: '120000000000001',
      ad_set_name: 'Recife',
      optimization_goal: 'LEAD_GENERATION',
      billing_event: 'IMPRESSIONS',
      targeting: '{"geo_locations":{"countries":["BR"]}}',
    })
    await $.tool.call({ tool: `${META}ads_create_creative`, ad_account_id: '123456789', page_id: '1', link_url: 'https://loja.example/cadastro', image_hash: 'abc' })
    await $.tool.call({ tool: `${META}ads_create_ad`, ad_account_id: '123456789', ad_set_id: '120000000000002', ad_name: 'Cadastro | imagem', creative: '{"creative_id":"120000000000003"}' })
    await $.tool.call({ tool: `${META}ads_activate_entity`, ad_account_id: '123456789', entity_id: '120000000000001', entity_type: 'campaign' })

    // Going live was flagged while it waited, in the card and at the top.
    expect(seen[4]?.some(x => /^Isto põe no ar e pode começar a gastar$/.test(x))).toBe(true)
    expect(seen[4]?.some(x => /^Pôr no ar: Isto põe no ar e pode começar a gastar$/.test(x))).toBe(true)

    const ui = await $.ui.mount({ ...PANE, surface })
    const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

    expect(await has(/^Montando na conta de anúncios$/)).toBe(true)
    expect(await has(/^5 prontas$/)).toBe(true)
    expect(await has(/^COMPROVANTE$/)).toBe(true)
    expect(await has(/ID 120000000000002 · criado, pausado/)).toBe(true)
    expect(await has(/ID 120000000000001 · no ar/)).toBe(true)
    if (surface === 'terminal') expect(await has(/^Campanha ✓ › Conjunto ✓ › Criativo ✓ › Anúncio ✓ › No ar ✓$/)).toBe(true)
    else expect((await ui.findAll({ type: 'Svg' })).some(x => /Linha de montagem: Campanha ✓/.test(String(x.props.alt)))).toBe(true)

    // Each piece opens its own card: the creative's link had no UTM.
    await ui.press({ key: 'piece-4' })
    expect(await has(/^! sem UTM$/)).toBe(true)
    // And the ad set's has its link to Ads Manager.
    await ui.press({ key: 'piece-3' })
    expect((await ui.findAll({ type: 'Link' })).some(x => /Abrir no Gerenciador/.test(String(x.props.label)) && /selected_adset_ids=120000000000002/.test(String(x.props.href)))).toBe(true)
    await ui.unmount()
  })
}

test('launch: a call you refused stays in the receipt as refused, nothing changed', async ($, on) => {
  const seen: string[][] = []
  engine(on, seen, $, 'ads_activate_entity')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Põe a campanha da loja no ar', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: `${META}ads_create_campaign`, ad_account_id: '123456789', campaign_name: 'Loja', objective: 'OUTCOME_SALES', buying_type: 'AUCTION' })
  await $.tool.call({ tool: `${META}ads_activate_entity`, ad_account_id: '123456789', entity_id: '120000000000001', entity_type: 'campaign' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /você recusou: nada mudou/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Nada mudou na conta\.$/ })).toBeDefined()
  await ui.unmount()
})

test('demo launch: sample pieces, the go-live waiting, and what goes live with it', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-11-25T12:00:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'media-review' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__media-review-panel__report' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

  await $.command.run({ command: 'media-review', args: 'pt', ...RUN })
  await $.command.run({ command: 'media-review', args: 'demo subida', ...RUN })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

  expect(await has(/Estes números são de EXEMPLO/)).toBe(true)
  expect(await has(/^EXEMPLO: subida da campanha de cadastros, Loja Demo$/)).toBe(true)
  expect(await has(/^O QUE VAI AO AR$/)).toBe(true)
  expect(await has(/^Verba por dia: R\$ 50,00$/)).toBe(true)
  expect(await has(/^Onde: Brasil · Recife \(\+15 km\)$/)).toBe(true)
  expect(await has(/! sem UTM/)).toBe(true)
  expect(await has(/^Isto põe no ar e pode começar a gastar$/)).toBe(true)
  await ui.unmount()
})

test('answers: the status inside a JSON string, and validation errors written as a string', () => {
  const live = '{"result":"{\\"ad_account_id\\":\\"123456789\\",\\"entity_id\\":\\"120000000000001\\",\\"entity_type\\":\\"campaign\\",\\"status\\":\\"PUBLISHING\\",\\"success\\":null}"}'

  expect(resultOf('activate', live)).toEqual({ id: '120000000000001', result: 'PUBLISHING', errors: 0 })

  const staged = '{"success":true,"entity_id":"120000000000002","is_draft":true,"active_errors":"[{\\"error_summary\\":\\"Budget too low\\"}]"}'

  expect(resultOf('update', staged)).toEqual({ id: '120000000000002', result: 'DRAFT', errors: 1 })
})

test('go live: the changes staged as drafts go live with it, listed on its card', () => {
  const base = { platform: 'Meta Ads', at: 0, alerts: [], account: '123456789', state: 'ok' as const }
  const update = (n: number, id: string, fields: string): LaunchPiece => ({
    ...base,
    ...pieceOf(`${META}ads_update_entity`, { ad_account_id: '123456789', entity_id: id, entity_type: 'campaign', fields }, CTX),
    n,
    result: 'DRAFT',
  })
  const pieces: LaunchPiece[] = [
    update(1, '120000000000001', '{"lifetime_budget":185781}'),
    update(2, '120000000000002', '{"end_time":"2026-12-01T02:59:00+0000"}'),
    update(3, '120000000000009', '{"lifetime_budget":1000}'),
  ]
  const go: LaunchPiece = {
    ...base,
    ...pieceOf(`${META}ads_activate_entity`, { ad_account_id: '123456789', entity_id: '120000000000001', entity_type: 'campaign', object_ids: ['120000000000001', '120000000000002'] }, CTX),
    n: 4,
    state: 'waiting',
  }

  pieces.push(go)

  const scope = liveScope(go, pieces)
  const lines = scope.flatMap(x => x.facts.map(f => factText(f, 'pt')?.value))

  // The two staged changes it publishes, not the one on another campaign.
  expect(scope.map(x => x.piece.n)).toEqual([1, 2])
  expect(lines).toContain('verba total → R$ 1.857,81')
  expect(lines).toContain('fim → 1º de dezembro de 2026')
})
