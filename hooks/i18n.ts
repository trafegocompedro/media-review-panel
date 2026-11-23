import type { Lang } from '../types'

const EN = {
  title: 'MEDIA REVIEW',
  by: 'by Tráfego Com Pedro',
  status_idle: 'IDLE',
  status_running: 'RUNNING',
  status_paused: 'PAUSED',
  status_done: 'DONE',
  status_error: 'ERROR',
  untitled: 'Paid media review',
  autoTitle: 'Auto-detected review',
  sample: 'SAMPLE DATA. Not from a real account.',
  updated: 'updated',
  started: 'started',
  stepsDone: (a: number, b: number) => `${a} of ${b} steps done`,
  noStepsYet: 'no steps reported yet',
  sec_accounts: 'Accounts under review',
  sec_status: 'Review status',
  sec_level: 'Data level',
  sec_periods: 'Time periods',
  sec_visuals: 'Data visuals',
  sec_debug: 'Debug & validation',
  noAccounts: 'No account identified yet. Accounts show up when Claude reads ad data or reports them.',
  nameMissing: 'name not reported',
  auto: 'auto-detected',
  noSteps: 'No steps reported yet. The call log below shows what was read so far.',
  levelCurrent: 'Reading now',
  levelNone: 'No level identified yet.',
  levelFromCall: 'auto-detected from the last call',
  levelReported: 'reported by Claude',
  noPeriod: 'No date range reported yet.',
  range: 'Range',
  compare: 'Compare',
  timezone: 'Timezone',
  attribution: 'Attribution',
  currency: 'Currency',
  notReported: 'not reported',
  none: 'none',
  datesSeen: 'Dates seen in queries',
  days: (n: number) => (n === 1 ? '1 day' : `${n} days`),
  noData: 'No data reported yet. Charts are drawn only from values retrieved in this session.',
  source: 'source',
  noSource: 'no source call cited',
  check: 'check',
  found: 'found',
  missing: 'not found',
  calculated: 'calculated',
  unchecked: 'unchecked',
  showing: (a: number, b: number) => `showing ${a} of ${b} rows`,
  sum: 'sum',
  min: 'min',
  max: 'max',
  last: 'last',
  gaps: (n: number) => `${n} missing point${n === 1 ? '' : 's'} left blank`,
  counters: 'Summary',
  calls: 'calls',
  errors: 'errors',
  empty: 'empty',
  writes: 'writes',
  rows: 'rows',
  warnings: 'Warnings',
  assumptions: 'Assumptions',
  callLog: 'Call log',
  checkLegend: '"found" means the number appears in the raw responses of the cited calls. It is a spot check, not a proof.',
  noCalls: 'No paid media tool calls yet.',
  subagent: 'subagent',
  write: 'WRITE CALL',
  details: 'Show input',
  hideDetails: 'Hide input',
  mute: 'Mute',
  unmute: 'Show mascot',
  madeBy: 'Made by Tráfego Com Pedro',
  readOnly: 'Read-only. The panel changes nothing in ad accounts and sends nothing anywhere.',
  w_write: (n: number, t: string) => `Call #${n} (${t}) can change an ad account.`,
  w_error: (n: number) => `Call #${n} returned an error.`,
  w_empty: (n: number) => `Call #${n} returned no rows.`,
  w_paging: (n: number) => `Call #${n} has more pages that were not read (incomplete).`,
  w_truncated: (n: number) => `Call #${n} output looks truncated.`,
  w_sampled: (n: number) => `Call #${n} mentions sampled data.`,
  w_dates: (n: number, d: string) => `Call #${n} queried ${d}, outside the reported period.`,
  w_missing: (t: string, n: number) => `"${t}": ${n} value${n === 1 ? '' : 's'} not found in the cited responses.`,
  w_unchecked: (t: string) => `"${t}" cites no logged call, so its numbers were not checked.`,
  m_hello: 'Hi! I will show you everything Claude reads.',
  m_start: "Let's do this!",
  m_fetch: 'Pulling the numbers…',
  m_analyze: 'Crunching the data…',
  m_step: 'Step done. Next!',
  m_empty: 'That one came back empty. Logged it!',
  m_error: 'Hit a snag. Details are in the debug log.',
  m_write: 'Heads up: that call can change an account!',
  m_check: 'A few numbers need a second look.',
  m_done: 'Done with the ad review!',
  m_paused: 'Coffee break. Ready when you are!',
  m_demo: 'Sample data loaded. Take a look around!',
  m_clear: 'Fresh start!',
  m_note: 'Writing down what Claude found.',
  m_sleep: 'Zzz… Wake me when there is an account to review.',
  alerts: (n: number) => (n === 1 ? '1 alert' : `${n} alerts`),
  moreAlerts: (n: number) => `+${n} more in Debug & validation`,
  showAllCalls: (n: number) => `Show all ${n} calls`,
  showFewer: 'Show fewer',
  showTable: 'Show as table',
  hideTable: 'Hide table',
  calcLegend: '* calculated by Claude, not checked against the source',
  missingLegend: '! not found in the cited responses',
  levelLegend: '● reading now · ✓ already read',
  emptyTitle: 'No review yet',
  emptyBody: 'The panel fills in by itself when Claude reads ad data in this session. To see every section, load the sample data.',
  loadDemo: 'Load sample data',
}

type Strings = typeof EN

const PT: Strings = {
  title: 'REVISÃO DE MÍDIA',
  by: 'por Tráfego Com Pedro',
  status_idle: 'PARADO',
  status_running: 'EM ANDAMENTO',
  status_paused: 'PAUSADO',
  status_done: 'CONCLUÍDO',
  status_error: 'ERRO',
  untitled: 'Revisão de mídia paga',
  autoTitle: 'Revisão detectada automaticamente',
  sample: 'DADOS DE EXEMPLO. Não são de uma conta real.',
  updated: 'atualizado',
  started: 'início',
  stepsDone: (a, b) => `${a} de ${b} etapas concluídas`,
  noStepsYet: 'nenhuma etapa informada ainda',
  sec_accounts: 'Contas em revisão',
  sec_status: 'Status da revisão',
  sec_level: 'Nível dos dados',
  sec_periods: 'Períodos',
  sec_visuals: 'Gráficos e tabelas',
  sec_debug: 'Depuração e validação',
  noAccounts: 'Nenhuma conta identificada ainda. As contas aparecem quando o Claude lê dados de anúncios ou informa quais são.',
  nameMissing: 'nome não informado',
  auto: 'detectado automaticamente',
  noSteps: 'Nenhuma etapa informada ainda. O registro de chamadas abaixo mostra o que já foi lido.',
  levelCurrent: 'Lendo agora',
  levelNone: 'Nenhum nível identificado ainda.',
  levelFromCall: 'detectado na última chamada',
  levelReported: 'informado pelo Claude',
  noPeriod: 'Nenhum período informado ainda.',
  range: 'Período',
  compare: 'Comparação',
  timezone: 'Fuso horário',
  attribution: 'Atribuição',
  currency: 'Moeda',
  notReported: 'não informado',
  none: 'nenhuma',
  datesSeen: 'Datas usadas nas consultas',
  days: n => (n === 1 ? '1 dia' : `${n} dias`),
  noData: 'Nenhum dado informado ainda. Os gráficos usam só valores obtidos nesta sessão.',
  source: 'fonte',
  noSource: 'nenhuma chamada citada como fonte',
  check: 'conferência',
  found: 'encontrados',
  missing: 'não encontrados',
  calculated: 'calculados',
  unchecked: 'não conferidos',
  showing: (a, b) => `mostrando ${a} de ${b} linhas`,
  sum: 'soma',
  min: 'mín',
  max: 'máx',
  last: 'último',
  gaps: n => `${n} ponto${n === 1 ? '' : 's'} sem dado deixado${n === 1 ? '' : 's'} em branco`,
  counters: 'Resumo',
  calls: 'chamadas',
  errors: 'erros',
  empty: 'vazias',
  writes: 'escritas',
  rows: 'linhas',
  warnings: 'Alertas',
  assumptions: 'Premissas',
  callLog: 'Registro de chamadas',
  checkLegend: '"encontrados" quer dizer que o número aparece nas respostas brutas das chamadas citadas. É uma conferência por amostra, não uma prova.',
  noCalls: 'Nenhuma chamada de mídia paga ainda.',
  subagent: 'subagente',
  write: 'CHAMADA DE ESCRITA',
  details: 'Ver entrada',
  hideDetails: 'Ocultar entrada',
  mute: 'Silenciar',
  unmute: 'Mostrar mascote',
  madeBy: 'Feito por Tráfego Com Pedro',
  readOnly: 'Somente leitura. O painel não muda nada nas contas e não envia nada para lugar nenhum.',
  w_write: (n, t) => `A chamada #${n} (${t}) pode alterar uma conta de anúncios.`,
  w_error: n => `A chamada #${n} voltou com erro.`,
  w_empty: n => `A chamada #${n} voltou sem linhas.`,
  w_paging: n => `A chamada #${n} tem mais páginas que não foram lidas (incompleta).`,
  w_truncated: n => `A saída da chamada #${n} parece cortada.`,
  w_sampled: n => `A chamada #${n} fala em dados amostrados.`,
  w_dates: (n, d) => `A chamada #${n} consultou ${d}, fora do período informado.`,
  w_missing: (t, n) => `"${t}": ${n} valor${n === 1 ? '' : 'es'} não encontrado${n === 1 ? '' : 's'} nas respostas citadas.`,
  w_unchecked: t => `"${t}" não cita nenhuma chamada registrada, então os números não foram conferidos.`,
  m_hello: 'Oi! Vou te mostrar tudo o que o Claude lê.',
  m_start: 'Bora lá!',
  m_fetch: 'Buscando os números…',
  m_analyze: 'Analisando os dados…',
  m_step: 'Etapa concluída. Próxima!',
  m_empty: 'Essa voltou vazia. Já registrei!',
  m_error: 'Deu um tropeço. Os detalhes estão no registro.',
  m_write: 'Atenção: essa chamada pode alterar uma conta!',
  m_check: 'Alguns números merecem uma segunda olhada.',
  m_done: 'Revisão dos anúncios concluída!',
  m_paused: 'Pausa para o cafezinho. Quando quiser, seguimos!',
  m_demo: 'Dados de exemplo carregados. Dá uma olhada!',
  m_clear: 'Tudo limpo, começando de novo!',
  m_note: 'Anotando o que o Claude achou.',
  m_sleep: 'Zzz… Me chama quando tiver conta para revisar.',
  alerts: n => (n === 1 ? '1 alerta' : `${n} alertas`),
  moreAlerts: n => `+${n} em Depuração e validação`,
  showAllCalls: n => `Mostrar as ${n} chamadas`,
  showFewer: 'Mostrar menos',
  showTable: 'Ver como tabela',
  hideTable: 'Ocultar tabela',
  calcLegend: '* calculado pelo Claude, não conferido na fonte',
  missingLegend: '! não encontrado nas respostas citadas',
  levelLegend: '● lendo agora · ✓ já lido',
  emptyTitle: 'Nenhuma revisão ainda',
  emptyBody: 'O painel se preenche sozinho quando o Claude lê dados de anúncios nesta sessão. Para ver todas as seções, carregue os dados de exemplo.',
  loadDemo: 'Carregar dados de exemplo',
}

export const strings = (lang: Lang): Strings => (lang === 'pt' ? PT : EN)

export type MascotKey =
  | 'm_hello'
  | 'm_start'
  | 'm_fetch'
  | 'm_analyze'
  | 'm_step'
  | 'm_empty'
  | 'm_error'
  | 'm_write'
  | 'm_check'
  | 'm_done'
  | 'm_paused'
  | 'm_demo'
  | 'm_clear'
  | 'm_note'
  | 'm_sleep'

export const mascotText = (lang: Lang, key: string): string => {
  const s = strings(lang) as unknown as Record<string, unknown>
  const v = s[key]

  return typeof v === 'string' ? v : ''
}

/** The data levels the panel lays out, in drill-down order. */
export const LEVELS = [
  'account',
  'campaign',
  'adgroup',
  'ad',
  'keyword',
  'searchterm',
  'audience',
  'placement',
] as const

const LEVEL_NAMES: Record<Lang, Record<string, string>> = {
  en: {
    account: 'Account',
    campaign: 'Campaign',
    adgroup: 'Ad group / Ad set',
    ad: 'Ad',
    keyword: 'Keyword',
    searchterm: 'Search term',
    audience: 'Audience',
    placement: 'Placement',
  },
  pt: {
    account: 'Conta',
    campaign: 'Campanha',
    adgroup: 'Grupo / Conjunto',
    ad: 'Anúncio',
    keyword: 'Palavra-chave',
    searchterm: 'Termo de pesquisa',
    audience: 'Público',
    placement: 'Posicionamento',
  },
}

export const levelName = (lang: Lang, level: string): string => LEVEL_NAMES[lang][level] ?? level

/** Maps any level spelling (Meta, Google Ads GAQL, plain words in EN or PT) to one of LEVELS. */
export const normalizeLevel = (raw: string): string => {
  const s = raw.trim().toLowerCase()

  if (s === '') return ''
  if (/search[_ ]?term|termo/.test(s)) return 'searchterm'
  if (/keyword|ad_group_criterion|palavra/.test(s)) return 'keyword'
  if (/^ads?$|ad_group_ad|creative|an[úu]ncio|^ad[_ ]?level$/.test(s)) return 'ad'
  if (/ad_?set|ad[ _-]?group|asset[_ ]?group|conjunto|grupo/.test(s)) return 'adgroup'
  if (/campaign|campanha/.test(s)) return 'campaign'
  if (/account|customer|conta/.test(s)) return 'account'
  if (/audience|p[úu]blico|age_range|gender|demograph|user_list/.test(s)) return 'audience'
  if (/placement|posicionamento|publisher_platform|platform_position|group_placement/.test(s)) return 'placement'

  return s.replace(/_view$/, '').replace(/_/g, ' ')
}

/** A rough guess of the language a message is written in. */
export const guessLang = (text: string): Lang | undefined => {
  const t = ` ${text.toLowerCase()} `
  const pt =
    (t.match(/[ãõçâêôá]/g)?.length ?? 0) +
    2 *
      (t.match(
        /\b(você|voce|não|nao|para|com|uma|isso|está|esta|campanha|campanhas|anúncio|anúncios|conta|contas|relatório|faz|fazer|preciso|por favor|obrigado|bora|olá|oi|quero|análise|analisa|verba|então|também|mês)\b/g,
      )?.length ?? 0)
  const en =
    2 *
    (t.match(
      /\b(the|and|you|please|with|this|what|campaign|campaigns|account|accounts|report|can|need|make|show|review|analyze|analysis|budget|spend|month|thanks|let's|how|why)\b/g,
    )?.length ?? 0)

  if (pt === 0 && en === 0) return undefined

  return pt > en ? 'pt' : 'en'
}
