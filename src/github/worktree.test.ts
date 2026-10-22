import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { run } from "../core/process.js"
import { findStalePrlenseWorktrees, resolveBaseSha, withPrWorktree } from "./worktree.js"
import type { PrMeta } from "./pr.js"

// Builds a bare "GitHub" with refs/pull/1/head and a clone of it, so the fetch path is real.
function makeRepos(opts: { mergeIntoMain?: boolean } = {}): { clone: string; headSha: string; baseSha: string; mergeSha?: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prlense-wt-"))
  const src = path.join(root, "src")
  fs.mkdirSync(src)
  const g = (args: string[], cwd = src) =>
    run("git", args, {
      cwd,
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    })
  g(["init", "-q", "-b", "main"])
  fs.writeFileSync(path.join(src, "a.txt"), "base\n")
  g(["add", "."])
  g(["commit", "-qm", "base"])
  const baseSha = g(["rev-parse", "HEAD"]).stdout
  g(["checkout", "-qb", "feature"])
  fs.writeFileSync(path.join(src, "a.txt"), "changed\n")
  g(["commit", "-qam", "change"])
  const headSha = g(["rev-parse", "HEAD"]).stdout
  g(["update-ref", "refs/pull/1/head", headSha])
  g(["checkout", "-q", "main"])
  // Merged the way GitHub's "Create a merge commit" does: main moves on, then gets the PR.
  let mergeSha: string | undefined
  if (opts.mergeIntoMain) {
    fs.writeFileSync(path.join(src, "b.txt"), "other work\n")
    g(["add", "."])
    g(["commit", "-qm", "other work on main"])
    g(["merge", "-q", "--no-ff", "-m", "Merge pull request #1", "feature"])
    mergeSha = g(["rev-parse", "HEAD"]).stdout
  }
  const bare = path.join(root, "remote.git")
  run("git", ["clone", "-q", "--bare", src, bare])
  run("git", ["update-ref", "refs/pull/1/head", headSha], { cwd: bare })
  const clone = path.join(root, "clone")
  run("git", ["clone", "-q", bare, clone])
  return { clone, headSha, baseSha, mergeSha }
}

const pr = (headSha: string): PrMeta => ({
  number: 1,
  slug: "o/r",
  url: "",
  title: "t",
  body: "",
  author: "a",
  state: "OPEN",
  isDraft: false,
  baseRefName: "main",
  headRefName: "feature",
  headRefOid: headSha,
  headRepoSlug: null,
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  createdAt: "",
  mergedAt: null,
  mergeCommitSha: null,
})

test("withPrWorktree checks out the PR head, computes the merge base, and cleans up even when fn throws", async () => {
  const { clone, headSha } = makeRepos()
  const remote = { name: "origin", url: "", slug: "o/r", host: "github.com" }
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
  const remote = { name: "origin", url: "", slug: "o/r", host: "github.com" }
  const kept = await withPrWorktree({ repoRoot: clone, remote, pr: pr(headSha), keep: true }, async (wt) => wt.path)
  assert.equal(fs.existsSync(kept), true)
  assert.equal(findStalePrlenseWorktrees(clone).length, 1)
  run("git", ["worktree", "remove", "--force", kept], { cwd: clone })
})

test("a PR merged with a merge commit is measured from the base as it was before the merge", async () => {
  const { clone, headSha, baseSha, mergeSha } = makeRepos({ mergeIntoMain: true })
  const remote = { name: "origin", url: "", slug: "o/r", host: "github.com" }
  const merged: PrMeta = { ...pr(headSha), state: "MERGED", mergedAt: "2026-10-20T00:00:00Z", mergeCommitSha: mergeSha! }
  await withPrWorktree({ repoRoot: clone, remote, pr: merged }, async (wt) => {
    assert.equal(wt.headSha, headSha)
    assert.equal(wt.baseSha, baseSha)
    assert.equal(run("git", ["diff", "--name-only", wt.baseSha, wt.headSha], { cwd: wt.path }).stdout, "a.txt")
  })
})

test("without the merge commit, a merged PR falls back to the fork point", () => {
  const { clone, headSha } = makeRepos({ mergeIntoMain: true })
  run("git", ["fetch", "-q", "origin", "main"], { cwd: clone })
  assert.equal(resolveBaseSha(clone, headSha, "origin/main", null), headSha)
})
