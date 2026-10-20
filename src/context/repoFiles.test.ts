import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { RepoFilesContextProvider } from "./repoFiles.js"
import type { ContextRequest } from "./provider.js"

function request(root: string, changed: string[], includeRules = false): ContextRequest {
  return {
    repoRoot: root,
    worktreePath: root,
    pr: {} as ContextRequest["pr"],
    changedFiles: changed.map((p) => ({ path: p }) as ContextRequest["changedFiles"][number]),
    ticketRefs: [],
    options: { contextFiles: [], includeRules, skipGenerated: [], testMatch: [], contextMaxBytes: 1e6, frontendMatch: [] } as ContextRequest["options"],
  }
}

test("AGENTS.md and CLAUDE.md are both read, and a symlink between them only once", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-ctx-"))
  fs.mkdirSync(path.join(root, "api"))
  fs.writeFileSync(path.join(root, "AGENTS.md"), "root agents")
  fs.symlinkSync("AGENTS.md", path.join(root, "CLAUDE.md"))
  fs.writeFileSync(path.join(root, "api", "CLAUDE.md"), "api claude")
  const docs = await new RepoFilesContextProvider().collect(request(root, ["api/orders.ts"]))
  assert.deepEqual(docs.map((d) => [d.source, d.content]), [["AGENTS.md", "root agents"], ["api/CLAUDE.md", "api claude"]])
})

test("--with-rules reads both Claude and Cursor rule folders", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-ctx-"))
  fs.mkdirSync(path.join(root, ".claude", "rules"), { recursive: true })
  fs.mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true })
  fs.writeFileSync(path.join(root, ".claude", "rules", "style.md"), "a")
  fs.writeFileSync(path.join(root, ".cursor", "rules", "api.mdc"), "b")
  const docs = await new RepoFilesContextProvider().collect(request(root, ["x.ts"], true))
  assert.deepEqual(docs.map((d) => d.source), [".claude/rules/style.md", ".cursor/rules/api.mdc"])
})
