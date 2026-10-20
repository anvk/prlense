import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { run } from "../core/process.js"
import { findStalePrlenseWorktrees, withPrWorktree } from "./worktree.js"
import type { PrMeta } from "./pr.js"

// Builds a bare "GitHub" with refs/pull/1/head and a clone of it, so the fetch path is real.
function makeRepos(): { clone: string; headSha: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-wt-"))
  const src = path.join(root, "src")
  fs.mkdirSync(src)
  const g = (args: string[], cwd = src) => run("git", args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } })
  g(["init", "-q", "-b", "main"])
  fs.writeFileSync(path.join(src, "a.txt"), "base\n")
  g(["add", "."]); g(["commit", "-qm", "base"])
  g(["checkout", "-qb", "feature"])
  fs.writeFileSync(path.join(src, "a.txt"), "changed\n")
  g(["commit", "-qam", "change"])
  const headSha = g(["rev-parse", "HEAD"]).stdout
  g(["update-ref", "refs/pull/1/head", headSha])
  g(["checkout", "-q", "main"])
  const bare = path.join(root, "remote.git")
  run("git", ["clone", "-q", "--bare", src, bare])
  run("git", ["update-ref", "refs/pull/1/head", headSha], { cwd: bare })
  const clone = path.join(root, "clone")
  run("git", ["clone", "-q", bare, clone])
  return { clone, headSha }
}

const pr = (headSha: string): PrMeta => ({
  number: 1, slug: "o/r", url: "", title: "t", body: "", author: "a", state: "OPEN", isDraft: false,
  baseRefName: "main", headRefName: "feature", headRefOid: headSha, headRepoSlug: null,
  additions: 1, deletions: 1, changedFiles: 1, createdAt: "", mergedAt: null,
})

test("withPrWorktree checks out the PR head, computes the merge base, and cleans up even when fn throws", async () => {
  const { clone, headSha } = makeRepos()
  const remote = { name: "origin", url: "", slug: "o/r" }
  let seenPath = ""
  await assert.rejects(
    withPrWorktree({ repoRoot: clone, remote, pr: pr(headSha) }, async (wt) => {
      seenPath = wt.path
      assert.equal(wt.headSha, headSha)
      assert.equal(fs.readFileSync(path.join(wt.path, "a.txt"), "utf8"), "changed\n")
      assert.notEqual(wt.baseSha, headSha)
      throw new Error("boom")
    }),
    /boom/,
  )
  assert.equal(fs.existsSync(seenPath), false)
  assert.deepEqual(findStalePrlenseWorktrees(clone), [])
  assert.equal(run("git", ["for-each-ref", "refs/prlense/"], { cwd: clone }).stdout, "")
})

test("withPrWorktree keeps the worktree when asked", async () => {
  const { clone, headSha } = makeRepos()
  const remote = { name: "origin", url: "", slug: "o/r" }
  const kept = await withPrWorktree({ repoRoot: clone, remote, pr: pr(headSha), keep: true }, async (wt) => wt.path)
  assert.equal(fs.existsSync(kept), true)
  assert.equal(findStalePrlenseWorktrees(clone).length, 1)
  run("git", ["worktree", "remove", "--force", kept], { cwd: clone })
})
