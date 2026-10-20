import { test } from "node:test"
import assert from "node:assert/strict"
import { extractTicketRefs, parsePrRef } from "./pr.js"

test("parsePrRef accepts numbers and #numbers", () => {
  assert.deepEqual(parsePrRef("482"), { number: 482 })
  assert.deepEqual(parsePrRef("#482"), { number: 482 })
  assert.deepEqual(parsePrRef("  482 "), { number: 482 })
})

test("parsePrRef accepts GitHub PR URLs with suffixes", () => {
  const want = { number: 482, owner: "acme", repo: "shop" }
  assert.deepEqual(parsePrRef("https://github.com/acme/shop/pull/482"), want)
  assert.deepEqual(parsePrRef("https://github.com/acme/shop/pull/482/files"), want)
  assert.deepEqual(parsePrRef("https://github.com/acme/shop/pull/482#issuecomment-1"), want)
  assert.deepEqual(parsePrRef("http://github.com/acme/shop/pull/482?diff=split"), want)
})

test("parsePrRef rejects other inputs", () => {
  assert.throws(() => parsePrRef("https://github.com/acme/shop/issues/482"), /Unrecognized/)
  assert.throws(() => parsePrRef("https://gitlab.com/o/r/-/merge_requests/1"), /Unrecognized/)
  assert.throws(() => parsePrRef("abc"), /Unrecognized/)
})

const prWith = (body: string, title = "Tidy up", headRefName = "someone/tidy") => ({ body, title, headRefName, slug: "acme/shop" })

test("extractTicketRefs finds tracker links and closing references once each", () => {
  const body =
    "JIRA: [ABC-541](https://acme.atlassian.net/browse/ABC-541) and again ABC-541. " +
    "Linear: https://linear.app/acme/issue/WEB-12/fix-login. Fixes #34, closes acme/api#5. " +
    "See https://github.com/acme/shop/issues/9."
  assert.deepEqual(extractTicketRefs(prWith(body)), [
    { key: "ABC-541", url: "https://acme.atlassian.net/browse/ABC-541" },
    { key: "WEB-12", url: "https://linear.app/acme/issue/WEB-12/fix-login" },
    { key: "acme/shop#9", url: "https://github.com/acme/shop/issues/9" },
    { key: "#34", url: "https://github.com/acme/shop/issues/34" },
    { key: "acme/api#5", url: "https://github.com/acme/api/issues/5" },
  ])
})

test("a bare key counts only when the branch or the title's start declares it", () => {
  const body = "Switch the export to UTF-8 and hash with SHA-256 per ISO-8601. Part of ABC-77."
  assert.deepEqual(extractTicketRefs(prWith(body)), [])
  assert.deepEqual(extractTicketRefs(prWith(body, "Tidy", "someone/abc-77-export")), [{ key: "ABC-77", url: undefined }])
  assert.deepEqual(extractTicketRefs(prWith(body, "[ABC-77] Export as UTF-8")), [{ key: "ABC-77", url: undefined }])
})
