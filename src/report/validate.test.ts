import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { applySemanticChecks, parseAgentOutput, ValidationError } from "./validate.js"

const good = {
  why: { paragraphs: ["a"], references: [{ label: "ABC-1", kind: "ticket" }] },
  what: { lead: "b", sections: [{ kind: "ui", title: "UI", summary: "s", points: ["h"] }, { kind: "architecture", title: "A", summary: "", points: [] }] },
  model: { summary: "none", changes: [{ group: "storage", kind: "table", name: "t1", change: "added", description: "d", locations: [], attention: true, risk: "irreversible" }] },
  functions: { groups: [{ area: "go", items: [{ name: "F", kind: "function", change: "modified", summary: "s", location: { path: "go/a.go", line: 3 }, detailIds: ["x9", "x2"] }] }] },
  details: { changes: [{ id: "x9", title: "t", files: [{ path: "go/a.go", line: 3 }, { path: "go/missing.go", line: 1 }], after: "after", explanation: ["e"] }] },
  review: {
    risks: [{ kind: "deploy", title: "flag", consequence: "off by default", source: { detailId: "x9" } }],
    questions: [{ question: "why?", context: "ctx", source: { modelChange: "nope" } }],
    glossary: [{ term: "Tenant", meaning: "b" }, { term: "tenant", meaning: "dup" }, { term: "Agent", meaning: "a" }],
  },
  coverage: { filesTraced: ["go/a.go"], filesSkippedGenerated: [], filesSkippedTests: [], filesUntraced: [] },
}

test("parseAgentOutput accepts a valid object and rejects bad enums with paths", () => {
  const out = parseAgentOutput(good)
  assert.equal(out.details.changes[0].id, "x9")
  const bad = JSON.parse(JSON.stringify(good)) as typeof good
  bad.model.changes.push({ group: "storage", kind: "spaceship", name: "n", change: "added", description: "d", locations: [] } as never)
  try {
    parseAgentOutput(bad)
    assert.fail("expected a ValidationError")
  } catch (e) {
    assert.ok(e instanceof ValidationError)
    assert.match(e.errors.join("\n"), /model\.changes\[1\]\.kind/)
  }
})

test("applySemanticChecks renumbers ids, remaps references and unlinks unknown paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-val-"))
  const out = parseAgentOutput(good)
  const { output, notes } = applySemanticChecks(out, { changedPaths: new Set(["go/a.go"]), worktreePath: dir })
  assert.equal(output.details.changes[0].id, "d1")
  assert.deepEqual(output.functions.groups[0].items[0].detailIds, ["d1"])
  assert.equal(output.details.changes[0].files[1].line, undefined)
  assert.ok(notes.some((n) => n.includes("go/missing.go")))
  assert.ok(notes.some((n) => n.includes("Dropped unknown detail references")))
  // Empty sections are dropped and the rest are put in canonical order.
  assert.deepEqual(output.what.sections.map((s) => s.kind), ["ui"])
  // Review: detail ids remapped, unknown model change dropped, flagged step-3 change rolled up, glossary deduped and sorted.
  assert.equal(output.review.risks[0].source?.detailId, "d1")
  assert.equal(output.review.questions[0].source, undefined)
  assert.ok(output.review.risks.some((r) => r.source?.modelChange === "t1" && r.consequence === "irreversible"))
  assert.deepEqual(output.review.glossary.map((g) => g.term), ["Agent", "Tenant"])
})
