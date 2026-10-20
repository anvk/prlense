// The model may run shell commands to read git history and search. This is the list of
// what it may run; everything else is denied by the PreToolUse hook (prlense bash-guard).

const ALLOWED_FIRST_TOKENS = new Set([
  "git", "gh", "rg", "grep", "egrep", "fgrep", "find", "ls", "cat", "head", "tail", "wc", "sed", "awk",
  "sort", "uniq", "cut", "tr", "jq", "echo", "printf", "diff", "file", "stat", "basename", "dirname", "pwd", "true",
])

const DENY_PATTERNS: RegExp[] = [
  /\bgit\s+(push|commit|reset|checkout|switch|rebase|merge|cherry-pick|revert|worktree|clean|stash|tag|am|apply|mv|rm|add|restore)\b/,
  /\bgit\s+branch\s+.*-[dDmM]\b/,
  /\bgit\s+remote\s+(add|remove|rm|set-url|rename)\b/,
  /\bgit\s+config\b/,
  /\bgh\s+(pr\s+(merge|close|comment|review|edit|ready|checkout|create|reopen|lock|unlock)|issue\s+(create|comment|close|edit|delete)|repo\s+(delete|edit|create|fork|clone)|release\s+(create|delete|edit|upload)|api\s+.*(-X|--method)\s*(POST|PUT|PATCH|DELETE)|api\s+.*(-f|-F|--field|--input)\b|secret|auth\s+(logout|login|setup-git)|gist\s+(create|delete|edit))\b/,
  /(^|[^<>])>{1,2}(?!&2\b)/, // stdout redirects to files (allows ">&2")
  /\bsed\s+(-[a-zA-Z]*i|--in-place)\b/,
  /\bawk\b.*\s>\s*"/,
]

export interface GuardDecision {
  allowed: boolean
  reason?: string
}

function splitSegments(cmd: string): string[] {
  // Split on ; && || | but keep it simple: quotes are not parsed, we err on the side of denying.
  return cmd
    .split(/\s*(?:;|&&|\|\||\|)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isAllowedBash(command: string): GuardDecision {
  const cmd = command.trim()
  if (!cmd) return { allowed: true }
  if (/\$\(|`/.test(cmd)) return { allowed: false, reason: "command substitution is not allowed" }
  for (const seg of splitSegments(cmd)) {
    const first = seg.replace(/^(\w+=\S+\s+)+/, "").split(/\s+/)[0]
    if (!ALLOWED_FIRST_TOKENS.has(first)) {
      return { allowed: false, reason: `"${first}" is not on the read-only command list` }
    }
  }
  for (const re of DENY_PATTERNS) {
    if (re.test(cmd)) return { allowed: false, reason: `matches a write pattern (${re.source.slice(0, 40)}…)` }
  }
  return { allowed: true }
}

// Claude Code hook protocol: JSON on stdin; exit 0 allows, exit 2 denies with stderr as the reason.
export async function runBashGuardHook(stdin: NodeJS.ReadableStream, stderr: NodeJS.WritableStream): Promise<number> {
  let raw = ""
  for await (const chunk of stdin) raw += chunk
  let command = ""
  try {
    const parsed = JSON.parse(raw) as { tool_input?: { command?: string } }
    command = parsed.tool_input?.command ?? ""
  } catch {
    stderr.write("prlense bash-guard: could not parse hook input; denying.\n")
    return 2
  }
  const decision = isAllowedBash(command)
  if (decision.allowed) return 0
  stderr.write(`prlense is read-only: ${decision.reason}. Use git/gh/rg read commands only.\n`)
  return 2
}
