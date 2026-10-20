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

test("extractTicketRefs finds keys and browse URLs once each", () => {
  const body = "JIRA: [ABC-541](https://acme.atlassian.net/browse/ABC-541) and XYZ-000 again ABC-541."
  assert.deepEqual(extractTicketRefs(body), [
    { key: "ABC-541", url: "https://acme.atlassian.net/browse/ABC-541" },
    { key: "XYZ-000" },
  ])
})
