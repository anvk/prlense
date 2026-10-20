import { test } from "node:test"
import assert from "node:assert/strict"
import { escapeHtml, jsonForScriptTag, renderInline, safeHref } from "./escape.js"

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script> & 'q'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;")
})

test("renderInline escapes before converting backticks and marks unverified", () => {
  assert.equal(renderInline("calls `<b>` here"), "calls <code>&lt;b&gt;</code> here")
  assert.match(renderInline("maybe true [UNVERIFIED]"), /^maybe true <span class="unverified"/)
  assert.equal(renderInline("no `unterminated here"), "no `unterminated here")
})

test("jsonForScriptTag cannot close the script tag", () => {
  const out = jsonForScriptTag({ a: "</script><script>alert(1)</script>" })
  assert.equal(out.includes("</script"), false)
  assert.deepEqual(JSON.parse(out), { a: "</script><script>alert(1)</script>" })
})

test("safeHref allows only GitHub and Atlassian https links", () => {
  assert.equal(safeHref("https://github.com/o/r/pull/1"), "https://github.com/o/r/pull/1")
  assert.equal(safeHref("https://acme.atlassian.net/browse/ABC-1"), "https://acme.atlassian.net/browse/ABC-1")
  assert.equal(safeHref("http://github.com/o/r"), undefined)
  assert.equal(safeHref("javascript:alert(1)"), undefined)
  assert.equal(safeHref(undefined), undefined)
})
