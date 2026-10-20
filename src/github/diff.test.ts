import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { run } from "../core/process.js"
import { listChangedFiles } from "./diff.js"

const options = { skipGenerated: ["**/*.lock"], testMatch: [], contextFiles: [], includeRules: false, contextMaxBytes: 0, frontendMatch: [] }
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }

test("changed files keep their real names, renames included", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-diff-"))
  const git = (args: string[]) => run("git", args, { cwd: dir, env }).stdout
  git(["init", "-q", "-b", "main"])
  fs.writeFileSync(path.join(dir, "old name.ts"), "a\nb\nc\nd\ne\n")
  fs.writeFileSync(path.join(dir, "keep.lock"), "1\n")
  git(["add", "."])
  git(["commit", "-qm", "base"])
  const baseSha = git(["rev-parse", "HEAD"])
  fs.writeFileSync(path.join(dir, "café.ts"), "x\ny\n")
  git(["mv", "old name.ts", "src => moved.ts"])
  fs.appendFileSync(path.join(dir, "src => moved.ts"), "f\n")
  fs.writeFileSync(path.join(dir, "keep.lock"), "2\n")
  git(["add", "-A"])
  git(["commit", "-qm", "head"])
  const headSha = git(["rev-parse", "HEAD"])

  const files = listChangedFiles({ path: dir, baseSha, headSha, baseRef: "main" }, options)
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
  assert.deepEqual(Object.keys(byPath).sort(), ["café.ts", "keep.lock", "src => moved.ts"])
  assert.deepEqual({ ...byPath["café.ts"] }, { path: "café.ts", oldPath: undefined, status: "A", additions: 2, deletions: 0, generated: false, test: false, area: undefined })
  assert.equal(byPath["src => moved.ts"].status, "R")
  assert.equal(byPath["src => moved.ts"].oldPath, "old name.ts")
  assert.equal(byPath["src => moved.ts"].additions, 1)
  assert.equal(byPath["keep.lock"].generated, true)
})
