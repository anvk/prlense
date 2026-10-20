// The model may run shell commands to read git history and search. This decides which ones:
// a command is split into its programs and arguments, and each program must be on the list
// below with arguments that only read. Anything the parser cannot judge (command
// substitution, subshells, background jobs, redirects to files, variable assignments) is
// refused rather than guessed at.

export interface GuardDecision {
  allowed: boolean
  reason?: string
}

// Commands of git that only read the repository. The subcommand has to come right after
// `git` (optionally after --no-pager), so global options such as `-c core.pager=…`, which
// can run any program, never get in.
const GIT_READ_COMMANDS = new Set([
  "log", "show", "diff", "grep", "blame", "annotate", "ls-files", "ls-tree", "rev-parse", "rev-list", "cat-file",
  "status", "shortlog", "describe", "merge-base", "for-each-ref", "show-ref", "name-rev", "diff-tree", "range-diff",
])
// Options of those commands that write a file or run another program.
const GIT_WRITING_OPTIONS = /^(--output(=.*)?|-O.*|--open-files-in-pager(=.*)?|--ext-diff)$/

// gh subcommands that only read, by command group.
const GH_READ_COMMANDS: Record<string, Set<string>> = {
  pr: new Set(["view", "diff", "list", "checks", "status"]),
  issue: new Set(["view", "list", "status"]),
  repo: new Set(["view"]),
  release: new Set(["view", "list"]),
  run: new Set(["view", "list"]),
}

type ArgCheck = (args: string[]) => string | null

// Every program the model may run, with what its arguments may not do.
const PROGRAMS: Record<string, ArgCheck> = {
  git: checkGit,
  gh: checkGh,
  rg: (args) => (args.some((a) => a.startsWith("--pre")) ? "rg --pre runs another program" : null),
  sort: (args) => (args.some((a) => a === "--output" || a.startsWith("--output=") || /^-[a-zA-Z]*o/.test(a)) ? "sort -o writes a file" : null),
  uniq: (args) => (args.filter((a) => !a.startsWith("-")).length > 1 ? "uniq with two files writes the second" : null),
  grep: none, egrep: none, fgrep: none, ls: none, cat: none, head: none, tail: none, wc: none, cut: none, tr: none,
  jq: none, echo: none, printf: none, diff: none, file: none, stat: none, basename: none, dirname: none, pwd: none, true: none,
}

function none(): null {
  return null
}

function checkGit(args: string[]): string | null {
  const rest = args[0] === "--no-pager" ? args.slice(1) : args
  const sub = rest[0]
  if (!sub || !GIT_READ_COMMANDS.has(sub)) return `git ${sub ?? ""} is not a read-only git command`.replace(/\s+is/, " is")
  const writing = rest.find((a) => GIT_WRITING_OPTIONS.test(a))
  return writing ? `git ${sub} ${writing} writes a file or runs another program` : null
}

function checkGh(args: string[]): string | null {
  const [group, sub] = args
  if (group === "api") {
    const method = args.find((a, i) => /^(-X|--method)$/.test(args[i - 1] ?? "") || /^--method=/.test(a) || /^-X\S/.test(a))
    const verb = method?.replace(/^(--method=|-X)/, "")
    if (verb && verb.toUpperCase() !== "GET") return `gh api ${verb} changes GitHub`
    if (args.some((a) => /^(-f|-F|--field|--raw-field|--input)/.test(a))) return "gh api with fields sends data to GitHub"
    return null
  }
  if (!group || !GH_READ_COMMANDS[group]?.has(sub ?? "")) return `gh ${[group, sub].filter(Boolean).join(" ")} is not a read-only gh command`
  if (args.some((a) => a === "--web" || a === "-w")) return "gh --web opens a browser"
  return null
}

export function isAllowedBash(command: string): GuardDecision {
  const parsed = parseCommand(command)
  if ("error" in parsed) return { allowed: false, reason: parsed.error }
  for (const words of parsed.segments) {
    const [program, ...args] = words
    if (/^\w+=/.test(program)) return { allowed: false, reason: "setting variables before a command is not allowed" }
    const check = PROGRAMS[program]
    if (!check) return { allowed: false, reason: `"${program}" is not on the read-only command list` }
    const problem = check(args)
    if (problem) return { allowed: false, reason: problem }
  }
  return { allowed: true }
}

// Splits a command line into the word lists of its programs, the way a POSIX shell would
// for the simple forms the model writes: quotes, backslashes, and the separators ; && ||
// and |. The only redirections let through send stderr to stdout or anything to /dev/null.
export function parseCommand(command: string): { segments: string[][] } | { error: string } {
  const segments: string[][] = []
  let words: string[] = []
  let word = ""
  let inWord = false
  const endWord = () => {
    if (inWord) words.push(word)
    word = ""
    inWord = false
  }
  const endSegment = () => {
    endWord()
    if (words.length) segments.push(words)
    words = []
  }

  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    const next = command[i + 1]
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      if (end === -1) return { error: "unbalanced quote" }
      word += command.slice(i + 1, end)
      inWord = true
      i = end
    } else if (c === '"') {
      let j = i + 1
      for (; j < command.length && command[j] !== '"'; j++) {
        if (command[j] === "`" || (command[j] === "$" && command[j + 1] === "(")) return { error: "command substitution is not allowed" }
        if (command[j] === "\\" && j + 1 < command.length) j++
        word += command[j]
      }
      if (j >= command.length) return { error: "unbalanced quote" }
      inWord = true
      i = j
    } else if (c === "\\") {
      if (next === "\n") {
        i++
        continue
      }
      word += next ?? ""
      inWord = true
      i++
    } else if (c === "`" || (c === "$" && next === "(")) {
      return { error: "command substitution is not allowed" }
    } else if (c === "(" || c === ")" || c === "{" || c === "}") {
      if (inWord) {
        word += c
      } else {
        return { error: "subshells and groups are not allowed" }
      }
    } else if (c === ";" || c === "\n") {
      endSegment()
    } else if (c === "|") {
      endSegment()
      if (next === "|") i++
    } else if (c === "&") {
      if (next === "&") {
        endSegment()
        i++
      } else {
        return { error: "background jobs are not allowed" }
      }
    } else if (c === "<") {
      return { error: next === "(" ? "process substitution is not allowed" : "redirecting from files is not allowed" }
    } else if (c === ">") {
      // `2>&1`, `>&2` and `2>/dev/null` move output between streams and touch no file.
      const redirect = /^>(&[12]|\s*\/dev\/null)(?=$|[\s;|&])/.exec(command.slice(i))
      if (!redirect) return { error: "redirecting to files is not allowed" }
      if (inWord && /^\d$/.test(word)) {
        word = "" // the "2" in 2>&1 is the stream number, not an argument
        inWord = false
      }
      i += redirect[0].length - 1
    } else if (/\s/.test(c)) {
      endWord()
    } else {
      word += c
      inWord = true
    }
  }
  endSegment()
  return { segments }
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
  stderr.write(`prlense is read-only: ${decision.reason}. Use git, gh and search commands that only read.\n`)
  return 2
}
