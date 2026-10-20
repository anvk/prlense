import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { isOfflineInvocation, resolveExplainTarget } from "./target.js"

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-target-"))
const reportFile = path.join(tmp, "pr-482.json")
fs.writeFileSync(reportFile, "{}")

test("a PR reference wins over everything else", () => {
  assert.deepEqual(resolveExplainTarget("482"), { kind: "pr", ref: { number: 482 } })
  assert.deepEqual(resolveExplainTarget("#482"), { kind: "pr", ref: { number: 482 } })
  const url = resolveExplainTarget("https://github.com/acme/shop/pull/482")
  assert.equal(url.kind, "pr")
  // A pull URL is a PR even though it is also a URL.
  assert.equal(resolveExplainTarget("https://github.com/o/r/pull/7/files").kind, "pr")
})

test("an existing file is a report to render", () => {
  assert.deepEqual(resolveExplainTarget(reportFile), { kind: "file", path: reportFile })
})

test("any other http link is a report to fetch", () => {
  assert.deepEqual(resolveExplainTarget("https://example.com/pr-482.json"), {
    kind: "url",
    url: "https://example.com/pr-482.json",
  })
  // Raw GitHub content is a file, not a pull request.
  assert.equal(resolveExplainTarget("https://raw.githubusercontent.com/o/r/main/pr-1.json").kind, "url")
})

test("anything else is refused with advice rather than a stack trace", () => {
  assert.throws(() => resolveExplainTarget("./not-here.json"), /Could not make sense of/)
  assert.throws(() => resolveExplainTarget("ftp://host/x.json"), /Could not make sense of/)
})

test("reading a local report never triggers the network", () => {
  assert.equal(isOfflineInvocation(["node", "prlense", "explain", reportFile]), true)
  assert.equal(isOfflineInvocation(["node", "prlense", reportFile]), true)
  assert.equal(isOfflineInvocation(["node", "prlense", "explain", "482"]), false)
  assert.equal(isOfflineInvocation(["node", "prlense", "explain", "https://example.com/a.json"]), false)
  assert.equal(isOfflineInvocation(["node", "prlense"]), false)
})
