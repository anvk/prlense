import { test } from "node:test"
import assert from "node:assert/strict"
import { matchesAnyGlob } from "./glob.js"
import { assignArea, isTestFile } from "../github/diff.js"

test("globs match generated files anywhere in the tree", () => {
  const globs = ["**/*_gen.go", "**/openapi.yaml", "**/*.generated.ts"]
  assert.equal(matchesAnyGlob("go/internal/x/models_gen.go", globs), true)
  assert.equal(matchesAnyGlob("models_gen.go", globs), true)
  assert.equal(matchesAnyGlob("go/internal/api/docs/openapi.yaml", globs), true)
  assert.equal(matchesAnyGlob("ui/src/services/api/client.generated.ts", globs), true)
  assert.equal(matchesAnyGlob("ui/src/services/api/client.ts", globs), false)
  assert.equal(matchesAnyGlob("go/internal/x/models.go", globs), false)
})

test("test files are detected", () => {
  assert.equal(isTestFile("go/internal/api/tests/order_search_test.go"), true)
  assert.equal(isTestFile("go/internal/api/testutil/api/x.go"), true)
  assert.equal(isTestFile("ui/src/utils/order.utils.test.ts"), true)
  assert.equal(isTestFile("ui/src/utils/order.utils.ts"), false)
})

test("area is the first path segment", () => {
  assert.equal(assignArea("go/internal/x.go"), "go")
  assert.equal(assignArea("ui/src/a.tsx"), "ui")
  assert.equal(assignArea("docs/readme.md"), "docs")
  assert.equal(assignArea("Makefile"), undefined)
})
