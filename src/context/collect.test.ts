import { test } from "node:test"
import assert from "node:assert/strict"
import { collectContext } from "./collect.js"
import type { ContextDoc, ContextRequest } from "./provider.js"

const doc = (source: string, content: string, priority = 0): ContextDoc => ({ id: source, kind: "doc", title: source, source, content, priority })
const provider = (docs: ContextDoc[]) => ({ name: "fixed", collect: async () => docs })

test("the context budget is kept in bytes, cutting cleanly through multi-byte text", async () => {
  const big = "é".repeat(3000) // 6000 bytes
  const bundle = await collectContext([provider([doc("a.md", "x".repeat(1000)), doc("b.md", big, 1)])], {} as ContextRequest, 4001)
  assert.deepEqual(bundle.truncated, ["b.md"])
  const cut = bundle.docs[1].content.replace(/\n\[\.\.\. truncated to fit the context budget\]$/, "")
  assert.ok(Buffer.byteLength(cut, "utf8") <= 3001)
  assert.ok(!cut.includes("�"))
})
