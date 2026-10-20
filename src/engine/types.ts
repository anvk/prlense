export interface EngineInput {
  cwd: string // the worktree
  systemPrompt: string
  userPrompt: string
  outputSchema: object
  verbose: boolean
  onProgress?: (line: string) => void
  transcriptPath?: string // the engine appends its raw events here
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
  run(input: EngineInput): Promise<EngineResult>
  doctor(): DoctorResult
}
