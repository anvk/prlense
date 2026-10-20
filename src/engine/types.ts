// How the prompt tells the model to look at the code. Each engine names its own tools, so
// the prompt never assumes one product's tool set.
export interface ToolNames {
  read: string
  search: string
  diff: string // how to see a change for a path
  showBase: string // how to see the base version of a path
}

export interface EngineInput {
  cwd: string // the worktree
  systemPrompt: string
  userPrompt: string
  outputSchema: object
  verbose: boolean
  onProgress?: (line: string) => void
  transcriptPath?: string // the engine appends its raw events here
  // Why a parsed answer cannot be used, or null when it can. An engine that cannot make
  // the model follow the schema on its own sends this back and asks for a corrected answer.
  checkOutput?: (output: unknown) => string | null
}

export type EngineStatus = "ok" | "schema_failed" | "error"

export interface EngineResult {
  status: EngineStatus
  output?: unknown // JSON matching outputSchema when status is "ok"
  rawText?: string // whatever came back when it is not
  inputTokens?: number
  outputTokens?: number
  turns?: number
  durationMs: number
  engine: string
  model: string
  message?: string // human-readable failure detail
}

export interface DoctorResult {
  ok: boolean
  details: string[]
}

// Everything model-specific lives behind this. Prompt, schema, context and renderer never
// see which engine ran.
export interface Engine {
  readonly name: string
  readonly model: string
  readonly tools: ToolNames
  run(input: EngineInput): Promise<EngineResult>
  doctor(): DoctorResult
}
