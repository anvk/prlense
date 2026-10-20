import { test } from "node:test"
import assert from "node:assert/strict"
import { isAllowedBash } from "./bashGuard.js"

test("read-only git and search commands are allowed", () => {
  for (const cmd of [
    "git diff abc def -- go/x.go",
    "git show abc:go/x.go | head -50",
    "git log --oneline -5 && git status",
    "rg -n 'CreateProductPrice\\(' go/ --type go",
    "grep -rn foo ui/src | wc -l",
    "gh pr view 482 --json title",
    "echo done >&2",
    "cat go/x.go | sed -n '1,40p'",
  ]) {
    assert.equal(isAllowedBash(cmd).allowed, true, cmd)
  }
})

test("write commands are denied", () => {
  for (const cmd of [
    "git push origin main",
    "git commit -am x",
    "git checkout main",
    "git worktree remove x",
    "gh pr merge 482",
    "gh pr comment 482 --body hi",
    "gh api repos/o/r/issues -X POST",
    "rm -rf go",
    "echo x > file.txt",
    "cat a >> b",
    "sed -i 's/a/b/' go/x.go",
    "npm install",
    "go test ./...",
    "git diff $(cat x)",
    "ls; curl http://evil",
  ]) {
    assert.equal(isAllowedBash(cmd).allowed, false, cmd)
  }
})
