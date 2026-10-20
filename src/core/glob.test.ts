import { test } from "node:test"
import assert from "node:assert/strict"
import { matchesAnyGlob } from "./glob.js"
import { assignArea, isTestFile } from "../github/diff.js"
import { DEFAULT_TEST_MATCH } from "./config.js"

const tests = { testMatch: DEFAULT_TEST_MATCH }

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
  assert.equal(isTestFile("go/internal/api/tests/order_search_test.go", tests), true)
  assert.equal(isTestFile("go/internal/api/testutil/api/x.go", tests), true)
  assert.equal(isTestFile("ui/src/utils/order.utils.test.ts", tests), true)
  assert.equal(isTestFile("ui/src/utils/order.utils.ts", tests), false)
  for (const p of ["app/test_orders.py", "lib/orders_spec.rb", "src/test/java/OrderTest.java", "web/order.spec.jsx"]) {
    assert.equal(isTestFile(p, tests), true, p)
  }
  assert.equal(isTestFile("src/main/java/Order.java", tests), false)
})

test("area is the first path segment", () => {
  assert.equal(assignArea("go/internal/x.go"), "go")
  assert.equal(assignArea("ui/src/a.tsx"), "ui")
  assert.equal(assignArea("docs/readme.md"), "docs")
  assert.equal(assignArea("Makefile"), undefined)
})
