import { test } from "node:test"
import assert from "node:assert/strict"
import { renderBody, renderReportHtml } from "./html.js"
import { decorateLinks } from "../report/links.js"
import { reportProblem } from "../report/compat.js"
import type { Report } from "../report/types.js"
import { AGENT_OUTPUT_SCHEMA } from "../report/schema.js"
import { PAGE_SCRIPT } from "./pageScript.js"
import { checkSchema, type Schema } from "../report/schemaCheck.js"

const report: Report = {
  schemaVersion: 4,
  generatedAt: "2026-09-23T10:00:00.000Z",
  tool: { name: "prlense", version: "0.1.0", engine: "claude-cli", model: "claude-opus-5", durationMs: 374000 },
  pr: {
    number: 482,
    slug: "acme/shop",
    url: "https://github.com/acme/shop/pull/482",
    title: "Create <the> order",
    author: "someone",
    state: "MERGED",
    isDraft: false,
    baseRefName: "main",
    headRefName: "someone/x",
    baseSha: "b".repeat(40),
    headSha: "h".repeat(40),
    additions: 211,
    deletions: 199,
    changedFiles: 17,
    headRepoSlug: null,
  },
  why: {
    paragraphs: ["Because `<b>` broke."],
    references: [{ label: "ABC-541", kind: "ticket", url: "https://x.atlassian.net/browse/ABC-541" }],
  },
  what: {
    lead: "Price lookup moved to the server.",
    sections: [
      { kind: "architecture", title: "Architecture", summary: "The screen no longer resolves a `price` first.", points: ["one", "two"] },
      { kind: "ui", title: "UI", summary: "The dialog posts prices.", points: ["three"] },
    ],
  },
  model: {
    summary: "Contract change.",
    changes: [
      {
        group: "contract",
        kind: "api-contract",
        name: "POST /x",
        change: "modified",
        description: "d",
        attention: true,
        risk: "breaking",
        locations: [{ path: "go/a.go", line: 1 }],
        shape: [
          { name: "productId", type: "uuid", change: "removed" },
          { name: "variantId", type: "uuid", keys: "required", change: "added" },
          { name: "price", type: "numeric(12,2)", change: "unchanged" },
        ],
      },
      {
        group: "storage",
        kind: "table",
        name: "order_invoices",
        change: "added",
        description: "new table",
        locations: [{ path: "go/a.go", line: 9 }],
        indexes: ["(org_id, created_at desc)"],
        relations: ["order_id -> orders.id, cascade"],
        shape: [{ name: "id", type: "uuid", keys: "PK", change: "added" }],
      },
    ],
  },
  functions: {
    groups: [
      {
        area: "go",
        items: [
          { name: "F", kind: "function", change: "modified", summary: "s", location: { path: "go/a.go", line: 2 }, detailIds: ["d1"] },
        ],
      },
    ],
  },
  details: {
    changes: [
      {
        id: "d1",
        title: "T",
        files: [{ path: "go/a.go", line: 2 }],
        before: "old",
        after: "new",
        explanation: ["why"],
        callers: ["handler.go:5"],
        unverified: true,
      },
    ],
  },
  review: {
    risks: [
      { kind: "code", title: "Breaking body", consequence: "Old clients get 400.", source: { modelChange: "POST /x" } },
      { kind: "deploy", title: "Run migration first", consequence: "Code reads the new table.", source: { modelChange: "order_invoices" } },
    ],
    questions: [{ question: "Why RESTRICT on file_id?", context: "Every other FK cascades.", source: { detailId: "d1" } }],
    glossary: [{ term: "SKU", meaning: "One sellable product variant, such as a shirt in one size." }],
  },
  coverage: {
    filesTraced: ["go/a.go"],
    filesSkippedGenerated: ["openapi.yaml"],
    filesSkippedTests: [],
    filesUntraced: [{ path: "x", reason: "too big" }],
    notes: ["n"],
  },
  sources: [{ kind: "repo-instructions", source: "CLAUDE.md", title: "CLAUDE.md" }],
  lenses: { frontendMatch: ["ui/**"] },
}

test("renderReportHtml produces a self-contained six-step page with escaped content", () => {
  const html = renderReportHtml(decorateLinks(JSON.parse(JSON.stringify(report)) as Report))
  assert.equal((html.match(/<section class="step"/g) ?? []).length, 6)
  assert.equal(/<script\s+src=/.test(html), false)
  // Only the inlined tab icon may be a <link>; anything else would be fetched.
  assert.equal(/<link\s+[^>]*href="(?!data:)/.test(html), false)
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,'))
  assert.ok(html.includes("Create &lt;the&gt; order"))
  assert.ok(html.includes("<code>&lt;b&gt;</code>"))
  assert.ok(html.includes(`https://github.com/acme/shop/pull/482/files#diff-`))
  assert.ok(html.includes(`class="unverified"`))
  assert.ok(html.includes(`id="detail-d1"`))
  assert.equal((html.match(/class="sec" data-kind=/g) ?? []).length, 2)
  assert.ok(html.includes('data-kind="architecture"'))
  assert.ok(html.includes('<svg viewBox="0 0 24 24"'))
  // Model step: grouped, storage before contract, with shape diagrams and an attention callout.
  assert.ok(html.indexOf('data-group="storage"') < html.indexOf('data-group="contract"'))
  assert.equal((html.match(/<dl class="cols">/g) ?? []).length, 2)
  assert.ok(html.includes('class="attention-box"'))
  assert.ok(html.includes('<dt class="removed">'))
  assert.ok(html.includes("(org_id, created_at desc)"))
  // Step 6 and lenses.
  assert.ok(html.includes("Review notes"))
  assert.ok(html.includes("In the code") && html.includes("At deploy"))
  assert.ok(html.includes("Why RESTRICT on file_id?"))
  assert.ok(html.includes('<dl class="glossary">'))
  assert.equal((html.match(/data-lens-pick=/g) ?? []).length, 4)
  assert.equal(html.includes("Operations"), false)
  assert.ok(html.includes('data-kind="ui" data-lens="product frontend"'))
  assert.ok(html.includes('data-group="storage" data-lens="backend"'))
  assert.ok(/<div class="card" id="detail-d1" data-lens="backend">/.test(html))
  assert.equal(html.includes("</script><script>alert"), false)
  const externalHttp = html.match(/https?:\/\/[^"'\s<]+/g) ?? []
  assert.ok(
    externalHttp.every((u) => u.startsWith("https://github.com/") || u.includes(".atlassian.net/")),
    externalHttp.join("\n"),
  )
})

// The path the in-page viewer takes when someone drops a shared JSON on it: parse, accept,
// render. It runs in a browser, so it must not need anything from node.
test("a saved report round-trips through the viewer's load path", () => {
  const onDisk = JSON.parse(JSON.stringify(decorateLinks(JSON.parse(JSON.stringify(report)) as Report))) as unknown
  assert.equal(reportProblem(onDisk), null)
  const body = renderBody(onDisk as Report)
  assert.equal((body.match(/<section class="step"/g) ?? []).length, 6)
  assert.ok(body.includes("Create &lt;the&gt; order"))
  assert.ok(body.includes("Download JSON") && body.includes("Load JSON"))
})

test("the viewer's load path rejects anything that is not a prlense report", () => {
  assert.notEqual(reportProblem({}), null)
  assert.notEqual(reportProblem({ schemaVersion: 99, pr: {}, why: {}, details: {} }), null)
  assert.notEqual(reportProblem(null), null)
  assert.notEqual(reportProblem([1, 2, 3]), null)
})

test("a report from another version says which way to go", () => {
  const shell = { pr: {}, why: {}, details: {} }
  assert.match(reportProblem({ ...shell, schemaVersion: 3 }) ?? "", /older prlense.*prlense explain/)
  assert.match(reportProblem({ ...shell, schemaVersion: 99 }) ?? "", /newer prlense.*prlense update/)
  assert.equal(reportProblem({ ...shell, schemaVersion: 4 }), null)
})

test("the sample report's model output fits the schema the model is given", () => {
  const { why, what, model, functions, details, review, coverage } = report
  assert.deepEqual(
    checkSchema(AGENT_OUTPUT_SCHEMA as Schema, JSON.parse(JSON.stringify({ why, what, model, functions, details, review, coverage }))),
    [],
  )
})

test("the page script is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(PAGE_SCRIPT))
})
