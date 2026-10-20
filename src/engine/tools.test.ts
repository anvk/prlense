import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveInside, runWorkspaceTool } from "./tools.js"

// A small git checkout with one committed file, plus a file outside it to try to reach.
function checkout(): { root: string; outside: string } {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-tools-"))
  const root = path.join(parent, "repo")
  fs.mkdirSync(path.join(root, "src"), { recursive: true })
  fs.writeFileSync(path.join(root, "src", "orders.ts"), "export function placeOrder() {\n  return 1\n}\n")
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }
  for (const args of [["init", "-q"], ["add", "."], ["commit", "-qm", "one"]]) spawnSync("git", args, { cwd: root, env })
  const outside = path.join(parent, "secret.txt")
  fs.writeFileSync(outside, "do not read")
  return { root, outside }
}

test("paths cannot leave the checkout, not even through a symlink", () => {
  const { root, outside } = checkout()
  assert.throws(() => resolveInside(root, "../secret.txt"), /outside the checkout/)
  assert.throws(() => resolveInside(root, outside), /outside the checkout/)
  fs.symlinkSync(outside, path.join(root, "link.txt"))
  assert.throws(() => resolveInside(root, "link.txt"), /outside the checkout/)
  assert.match(runWorkspaceTool(root, "read_file", { path: "../secret.txt" }), /^Error: .*outside the checkout/)
})

test("read_file numbers lines and pages through long files", () => {
  const { root } = checkout()
  assert.equal(runWorkspaceTool(root, "read_file", { path: "src/orders.ts", limit: 1 }).split("\n")[0], "     1\texport function placeOrder() {")
  assert.match(runWorkspaceTool(root, "read_file", { path: "src/orders.ts", limit: 1 }), /read on with offset 2/)
  assert.equal(runWorkspaceTool(root, "read_file", { path: "src/orders.ts", offset: 2, limit: 1 }), "     2\t  return 1\n… 1 more line(s); read on with offset 3")
  assert.equal(runWorkspaceTool(root, "read_file", { path: "src/orders.ts", offset: 3 }), "     3\t}")
})

test("list_files and search find what is in the checkout", () => {
  const { root } = checkout()
  assert.equal(runWorkspaceTool(root, "list_files", { pattern: "**/*.ts" }), "src/orders.ts")
  assert.equal(runWorkspaceTool(root, "list_files", { pattern: "**/*.go" }), "No files match.")
  assert.equal(runWorkspaceTool(root, "search", { pattern: "placeOrder" }), "src/orders.ts:1:export function placeOrder() {")
  assert.equal(runWorkspaceTool(root, "search", { pattern: "placeOrder", glob: "*.go" }), "No matches.")
})

test("run_command runs read-only commands and refuses the rest", () => {
  const { root } = checkout()
  assert.match(runWorkspaceTool(root, "run_command", { command: "git log --oneline" }), /one$/)
  assert.match(runWorkspaceTool(root, "run_command", { command: "git commit --allow-empty -m x" }), /^Refused/)
  assert.match(runWorkspaceTool(root, "run_command", { command: "rm -rf src" }), /^Refused/)
  assert.ok(fs.existsSync(path.join(root, "src", "orders.ts")))
})

test("an unknown tool says which ones exist", () => {
  const { root } = checkout()
  assert.match(runWorkspaceTool(root, "write_file", {}), /unknown tool "write_file". Available: read_file, list_files, search, run_command/)
})
