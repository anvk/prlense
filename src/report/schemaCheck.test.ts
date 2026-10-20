import { test } from "node:test"
import assert from "node:assert/strict"
import { checkSchema, keepDeclared, type Schema } from "./schemaCheck.js"

const schema: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "tags"],
  properties: {
    name: { type: "string" },
    size: { type: "integer" },
    kind: { type: "string", enum: ["a", "b"] },
    tags: { type: "array", items: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  },
}

test("checkSchema accepts a fitting value and names every problem in one that does not", () => {
  assert.deepEqual(checkSchema(schema, { name: "x", tags: [{ id: "1" }], kind: "a", size: 3 }), [])
  assert.deepEqual(checkSchema(schema, { tags: [{}, 5], kind: "c", size: 1.5, extra: true }), [
    "output.name: missing",
    "output.size: expected an integer",
    "output.kind: expected one of a, b",
    "output.tags[0].id: missing",
    "output.tags[1]: expected an object",
    "output.extra: not part of the schema",
  ])
})

test("keepDeclared drops fields the schema does not declare, at every level", () => {
  const value = { name: "x", tags: [{ id: "1", note: "stray" }], extra: true }
  assert.deepEqual(keepDeclared(schema, value), { name: "x", tags: [{ id: "1" }] })
})
