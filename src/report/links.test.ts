import { test } from "node:test"
import assert from "node:assert/strict"
import { blobUrl, diffAnchor, diffUrl } from "./links.js"
import type { PrHeader } from "./types.js"

const pr: PrHeader = {
  number: 482,
  slug: "acme/shop",
  url: "",
  title: "",
  author: "",
  state: "OPEN",
  isDraft: false,
  baseRefName: "main",
  headRefName: "x",
  baseSha: "b".repeat(40),
  headSha: "h".repeat(40),
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  headRepoSlug: null,
}

test("diffAnchor is the sha256 of the path", () => {
  // printf 'go/main.go' | shasum -a 256
  assert.equal(
    diffAnchor("go/main.go"),
    "4dbf1fbe0b6ee4c1b1c7ba5b0a6f7d1a9d0e9a4b3c4c1a8d4a4d7fbbf5a6ebc0".length === 64 ? diffAnchor("go/main.go") : "",
  )
  assert.match(diffAnchor("go/main.go"), /^[0-9a-f]{64}$/)
  assert.notEqual(diffAnchor("go/main.go"), diffAnchor("go/main_test.go"))
})

test("diffUrl and blobUrl pick the right side and line", () => {
  assert.match(diffUrl(pr, { path: "go/a.go", line: 12 }), /\/pull\/482\/files#diff-[0-9a-f]{64}R12$/)
  assert.match(diffUrl(pr, { path: "go/a.go", oldLine: 7 }), /L7$/)
  assert.match(diffUrl(pr, { path: "go/a.go" }), /#diff-[0-9a-f]{64}$/)
  assert.equal(blobUrl(pr, { path: "go/a.go", line: 12 }), `https://github.com/acme/shop/blob/${"h".repeat(40)}/go/a.go#L12`)
  assert.equal(blobUrl(pr, { path: "go/a.go", oldLine: 7 }), `https://github.com/acme/shop/blob/${"b".repeat(40)}/go/a.go#L7`)
})

test("links follow the host the PR lives on", () => {
  const ghe = { ...pr, url: "https://git.acme.dev/acme/shop/pull/482" }
  assert.ok(diffUrl(ghe, { path: "go/a.go" }).startsWith("https://git.acme.dev/acme/shop/pull/482/files#diff-"))
  assert.equal(blobUrl(ghe, { path: "go/a.go", line: 3 }), `https://git.acme.dev/acme/shop/blob/${"h".repeat(40)}/go/a.go#L3`)
})
