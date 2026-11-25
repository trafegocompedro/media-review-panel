export type Lang = 'en' | 'pt'

export type StepStatus = 'queued' | 'fetching' | 'analyzing' | 'done' | 'error'

export type ReviewStatus = 'idle' | 'running' | 'paused' | 'done' | 'error'

/** Where a fact came from: Claude reported it, or the mod read it off a tool call. */
export type Origin = 'reported' | 'auto'

export type Account = {
  platform: string
  id: string
  name?: string
  currency?: string
  timezone?: string
  origin: Origin
  calls: number[]
}

export type Step = { id: string; label: string; status: StepStatus; note?: string }

export type Period = {
  label?: string
  start: string
  end: string
  compareStart?: string
  compareEnd?: string
  timezone?: string
}

export type Cell = string | number | null

export type CheckResult = {
  found: number
  missing: number
  calculated: number
  unchecked: number
  /** Of the found, those confirmed by adding up their parts (a total of campaigns, days). */
  summed?: number
  missingSamples: string[]
  /** "row:column" of each number not found, for the table to mark. */
  missingCells: string[]
  /**
   * Numbers too common to prove anything: they, or their neighbours, show up
   * in almost any answer (a small count). Neither found nor missing.
   */
  common?: number
  /** "row:column" of each common number, for the table to mark. */
  commonCells?: string[]
  note?: string
}

/** One number of Claude's final answer that the panel could not find. */
export type AnswerMiss = { text: string; context: string }

/** The numbers of Claude's last answer, looked up in what the session read. */
export type AnswerCheck = {
  at: number
  /** Numbers written in the answer, after dates, IDs and code are set aside. */
  total: number
  /** Found in the media queries the panel logged. */
  found: number
  /** Of the found, totals that are the sum of a column of the answer's own table. */
  summed: number
  /** Not in the media queries, but in another file Claude read or in your message. */
  elsewhere: number
  /** Too small or too common to prove anything (a count of 3, 30 days). */
  common: number
  /** Not found, and written as a rate, an average, a cost per or a difference. */
  calculated: number
  missing: AnswerMiss[]
}

export type Dataset = {
  id: string
  title: string
  chart: 'line' | 'bar' | 'table'
  columns: string[]
  rows: Cell[][]
  x?: string
  series?: string[]
  unit?: string
  currency?: string
  sourceCalls: number[]
  calculated: string[]
  /** Totals Claude added up, each with the parts it copied from the sources. */
  sums?: SumSpec[]
  note?: string
  totalRows: number
  check: CheckResult
}

/** One cell that is a sum: its row (from 0), its column and the values added up. */
export type SumSpec = { row: number; column: string; parts: number[] }

export type Review = {
  id: string
  title?: string
  status: ReviewStatus
  isAuto: boolean
  isDemo: boolean
  startedAt: number
  updatedAt: number
  finishedAt?: number
  firstCall: number
  accounts: Account[]
  steps: Step[]
  level?: string
  levelOrigin?: Origin
  levelsSeen: string[]
  periods: Period[]
  attribution?: string
  currency?: string
  datasets: Dataset[]
  assumptions: string[]
  warnings: string[]
  reports: number
  /** The numbers of Claude's last answer in this review, checked when the turn ended. */
  answer?: AnswerCheck
}

export type CallStatus = 'running' | 'ok' | 'empty' | 'error' | 'denied'

export type CallKind = 'read' | 'write' | 'file' | 'lookup'

export type CallLog = {
  n: number
  id: string
  tool: string
  label: string
  platform: string
  kind: CallKind
  agentId?: string
  params: [string, string][]
  accounts: string[]
  level?: string
  dates: string[]
  fields: string[]
  status: CallStatus
  rows?: number
  rowsApprox?: boolean
  flags: string[]
  error?: string
  currency?: string
  timezone?: string
  startedAt: number
  ms?: number
  chars?: number
  input: string
}

export type Mood =
  | 'sleep'
  | 'hello'
  | 'fetch'
  | 'look'
  | 'write'
  | 'done'
  | 'oops'
  | 'alert'
  | 'sus'
  | 'empty'
  | 'step'
  | 'pause'
  | 'clean'
  | 'demo'

export type Mascot = { key: string; detail?: string; mood: Mood; at: number }

/** Simple: plain words for beginners. Full: every technical detail open. */
export type ViewMode = 'simple' | 'full'

declare module 'claude-code' {
  interface PluginState {
    'media-review-panel': {
      review: Shaped<Review | null>
      calls: Shaped<CallLog[]>
      mascot: Shaped<Mascot | null>
      collapsed: string[]
      openCalls: number[]
      openTables: string[]
      showAllCalls: boolean
      muted: boolean
      lang: Lang
      counter: number
      mode: ViewMode
    }
  }
}
