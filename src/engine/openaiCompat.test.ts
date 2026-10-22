import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { OpenAiCompatEngine, parseJsonAnswer } from "./openaiCompat.js"

interface Recorded {
  authorization?: string
  body: { model: string; messages: Array<{ role: string; content: string | null; tool_call_id?: string }>; tools?: unknown[] }
}

// A chat completions endpoint that plays back `replies` in order and records every request.
async function fakeApi(replies: object[]): Promise<{ baseUrl: string; requests: Recorded[]; close: () => void }> {
  const requests: Recorded[] = []
  const server = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      requests.push({ authorization: req.headers.authorization, body: JSON.parse(raw) })
      const reply = replies[Math.min(requests.length - 1, replies.length - 1)]
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(reply))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests, close: () => server.close() }
}

const say = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
const callTool = (name: string, args: object) => ({
  choices: [
    { message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] } },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
})

function worktree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-engine-"))
  fs.writeFileSync(path.join(dir, "README.md"), "hello from the checkout\n")
  return dir
}

const input = (cwd: string, checkOutput?: (v: unknown) => string | null) => ({
  cwd,
  systemPrompt: "Explain the PR.",
  userPrompt: "PR #1",
  outputSchema: { type: "object", required: ["why"] },
  verbose: false,
  checkOutput,
})

test("the model reads files through the tools, and a rejected answer is sent back to be fixed", async () => {
  const api = await fakeApi([
    callTool("read_file", { path: "README.md" }),
    say('Here it is: {"wrong": true}'),
    say('```json\n{"why": "because"}\n```'),
  ])
  process.env.PRLENSE_TEST_KEY = "secret"
  const engine = new OpenAiCompatEngine({ baseUrl: api.baseUrl, model: "any-model", apiKeyEnv: "PRLENSE_TEST_KEY" })
  const progress: string[] = []
  const result = await engine.run({
    ...input(worktree(), (v) => ((v as Record<string, unknown>).why ? null : '"why" is missing')),
    onProgress: (line) => progress.push(line),
  })
  api.close()

  assert.equal(result.status, "ok")
  assert.deepEqual(result.output, { why: "because" })
  assert.deepEqual(
    { turns: result.turns, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    { turns: 3, inputTokens: 30, outputTokens: 15 },
  )
  assert.deepEqual(progress, ["read_file README.md"])

  const [first, second, third] = api.requests
  assert.equal(first.authorization, "Bearer secret")
  assert.equal(first.body.model, "any-model")
  assert.ok(first.body.tools && first.body.tools.length === 4)
  assert.match(first.body.messages[0].content ?? "", /match this JSON Schema/)
  const toolReply = second.body.messages.find((m) => m.role === "tool")
  assert.equal(toolReply?.tool_call_id, "call_1")
  assert.match(toolReply?.content ?? "", /hello from the checkout/)
  assert.match(third.body.messages.at(-1)?.content ?? "", /That answer cannot be used: "why" is missing/)
})

test("an answer that never fits ends as schema_failed with the raw text", async () => {
  const api = await fakeApi([say("not json at all")])
  const engine = new OpenAiCompatEngine({ baseUrl: api.baseUrl, model: "m" })
  const result = await engine.run(input(worktree()))
  api.close()
  assert.equal(result.status, "schema_failed")
  assert.equal(result.rawText, "not json at all")
  assert.equal(api.requests.length, 3) // the answer, then two requests to fix it
  assert.equal(api.requests[0].authorization, undefined) // a local endpoint needs no key
})

test("when the tool budget runs out, the tools are withdrawn and an answer is asked for", async () => {
  const api = await fakeApi([callTool("list_files", { pattern: "**/*" }), callTool("list_files", { pattern: "**/*" }), say('{"why": "x"}')])
  const engine = new OpenAiCompatEngine({ baseUrl: api.baseUrl, model: "m", maxSteps: 1 })
  const result = await engine.run(input(worktree()))
  api.close()
  assert.equal(result.status, "ok")
  // The second request is the one past the budget: no tools, and a request for the answer.
  // The fake model ignores it and asks for a tool again, which counts as no answer.
  const pastBudget = api.requests[1].body
  assert.equal(pastBudget.tools, undefined)
  assert.match(pastBudget.messages.at(-1)?.content ?? "", /used all your tool calls/)
  assert.equal(api.requests[2].body.tools, undefined)
})

test("a missing key is reported before any request", async () => {
  delete process.env.PRLENSE_MISSING_KEY
  const engine = new OpenAiCompatEngine({ baseUrl: "http://127.0.0.1:9/v1", model: "m", apiKeyEnv: "PRLENSE_MISSING_KEY" })
  assert.equal(engine.doctor().ok, false)
  const result = await engine.run(input(worktree()))
  assert.equal(result.status, "error")
  assert.match(result.message ?? "", /PRLENSE_MISSING_KEY is not set/)
})

test("parseJsonAnswer tolerates fences and surrounding prose", () => {
  assert.deepEqual(parseJsonAnswer('```json\n{"a": 1}\n```'), { ok: true, value: { a: 1 } })
  assert.deepEqual(parseJsonAnswer('Sure. {"a": {"b": 2}} Done.'), { ok: true, value: { a: { b: 2 } } })
  assert.equal(parseJsonAnswer("no object here").ok, false)
  assert.equal(parseJsonAnswer("{broken").ok, false)
})
