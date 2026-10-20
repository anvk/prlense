import { test } from "node:test"
import assert from "node:assert/strict"
import { isAllowedBash, parseCommand } from "./bashGuard.js"

test("read-only git, gh and search commands are allowed", () => {
  for (const cmd of [
    "git diff abc def -- go/x.go",
    "git show abc:go/x.go | head -50",
    "git log --oneline -5 && git status",
    "git --no-pager log -p -- go/x.go",
    "git grep -n placeOrder -- '*.go'",
    "rg -n 'CreateProductPrice\\(' go/ --type go",
    "grep -rn foo ui/src | wc -l",
    "gh pr view 482 --json title",
    "gh api repos/o/r/pulls/482/files",
    "gh api -X GET repos/o/r/issues",
    "echo done >&2",
    "git log 2>&1 | head",
    "git show HEAD:missing 2>/dev/null || echo none",
    "cat go/x.go | head -40",
    "sort a.txt | uniq -c",
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
    "gh api repos/o/r/issues -f title=x",
    "rm -rf go",
    "echo x > file.txt",
    "cat a >> b",
    "npm install",
    "go test ./...",
    "git diff $(cat x)",
    "ls; curl http://evil",
  ]) {
    assert.equal(isAllowedBash(cmd).allowed, false, cmd)
  }
})

test("commands that write or run programs through an allowed tool are denied", () => {
  for (const cmd of [
    "find . -name '*.tmp' -delete",
    "find . -exec rm {} +",
    "sed -n 'w /tmp/out' src/a.ts",
    "awk 'BEGIN { system(\"touch /tmp/x\") }'",
    "git diff --output=/tmp/patch",
    "git -c core.pager='touch /tmp/x' log",
    "git grep -O'touch /tmp/x' foo",
    "git log --ext-diff",
    "rg --pre 'touch /tmp/x' foo",
    "sort -o /tmp/x a.txt",
    "uniq a.txt b.txt",
    "GIT_PAGER='touch /tmp/x' git log",
    "git log & touch /tmp/x",
    "cat <(touch /tmp/x)",
    "(touch /tmp/x)",
    'git log "$(touch /tmp/x)"',
    "git log `touch /tmp/x`",
    "gh pr view 1 --web",
  ]) {
    assert.equal(isAllowedBash(cmd).allowed, false, cmd)
  }
})

test("parseCommand splits programs and keeps quoted text whole", () => {
  assert.deepEqual(parseCommand(`git log --format='%h %s' | head -3 && echo "a b"`), {
    segments: [["git", "log", "--format=%h %s"], ["head", "-3"], ["echo", "a b"]],
  })
  assert.deepEqual(parseCommand("git log 2>&1 | head"), { segments: [["git", "log"], ["head"]] })
  assert.deepEqual(parseCommand("rg 'a(b)' src"), { segments: [["rg", "a(b)", "src"]] })
  assert.ok("error" in parseCommand("echo 'unbalanced"))
})
