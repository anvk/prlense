import { test } from "node:test"
import assert from "node:assert/strict"
import { extractTicketRefs, tryParsePrRef } from "./pr.js"

test("tryParsePrRef accepts numbers and #numbers", () => {
  assert.deepEqual(tryParsePrRef("482"), { number: 482 })
  assert.deepEqual(tryParsePrRef("#482"), { number: 482 })
  assert.deepEqual(tryParsePrRef("  482 "), { number: 482 })
})

test("tryParsePrRef accepts GitHub PR URLs with suffixes", () => {
  const want = { number: 482, owner: "acme", repo: "shop", host: "github.com" }
  assert.deepEqual(tryParsePrRef("https://github.com/acme/shop/pull/482"), want)
  assert.deepEqual(tryParsePrRef("https://github.com/acme/shop/pull/482/files"), want)
  assert.deepEqual(tryParsePrRef("https://github.com/acme/shop/pull/482#issuecomment-1"), want)
  assert.deepEqual(tryParsePrRef("http://github.com/acme/shop/pull/482?diff=split"), want)
})

test("tryParsePrRef rejects other inputs", () => {
  assert.equal(tryParsePrRef("https://github.com/acme/shop/issues/482"), null)
  assert.equal(tryParsePrRef("https://gitlab.com/o/r/-/merge_requests/1"), null)
  assert.equal(tryParsePrRef("abc"), null)
})

const prWith = (body: string, title = "Tidy up", headRefName = "someone/tidy", url = "https://github.com/acme/shop/pull/1") => ({ body, title, headRefName, slug: "acme/shop", url })

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

test("GitHub Enterprise PR URLs and issue references keep their host", () => {
  assert.deepEqual(tryParsePrRef("https://git.acme.dev/shop/web/pull/7/files"), { number: 7, owner: "shop", repo: "web", host: "git.acme.dev" })
  const pr = prWith("Fixes #3. Also https://git.acme.dev/shop/web/issues/4 and https://github.com/x/y/issues/5.", "t", "b", "https://git.acme.dev/shop/web/pull/7")
  assert.deepEqual(extractTicketRefs({ ...pr, slug: "shop/web" }), [
    { key: "shop/web#4", url: "https://git.acme.dev/shop/web/issues/4" },
    { key: "#3", url: "https://git.acme.dev/shop/web/issues/3" },
  ])
})
