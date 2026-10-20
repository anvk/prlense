// The read-only tools an API-driven engine hands the model, run by prlense itself. Paths
// are resolved inside the worktree and anything that lands outside it (`..`, an absolute
// path, a symlink pointing out) is refused. Commands go through the same read-only guard
// as the Claude Code hook.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { globToRegExp } from "../core/glob.js"
import { isAllowedBash } from "./bashGuard.js"
import type { ToolNames } from "./types.js"

const MAX_OUTPUT_CHARS = 30_000
const DEFAULT_READ_LINES = 2000
const MAX_LISTED_FILES = 500
const COMMAND_TIMEOUT_MS = 60_000
const SKIPPED_DIRS = new Set([".git", "node_modules"])

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// What the prompt calls these tools, so it reads the same as for any other engine.
export const WORKSPACE_TOOL_NAMES: ToolNames = {
  read: "read_file",
  search: "search",
  diff: "run_command with `git diff BASE_SHA HEAD_SHA -- <path>`",
  showBase: "run_command with `git show BASE_SHA:<path>`",
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a file in the checkout, with line numbers. Use offset and limit for long files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the checkout root" },
        offset: { type: "integer", description: "First line to return, starting at 1" },
        limit: { type: "integer", description: `Number of lines to return (default ${DEFAULT_READ_LINES})` },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "List files in the checkout whose path matches a glob, such as **/*.ts or src/api/**.",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string", description: "Glob relative to the checkout root" } },
      required: ["pattern"],
    },
  },
  {
    name: "search",
    description: "Search tracked files for a regular expression (git grep). Returns path:line:text for each match.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Extended regular expression" },
        path: { type: "string", description: "Only search under this directory or file" },
        glob: { type: "string", description: "Only search files matching this glob, such as *.go" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_command",
    description:
      "Run one read-only shell command in the checkout, such as git log, git diff, git show or gh pr view. " +
      "Anything that writes files, changes git state or posts to GitHub is refused.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
]

// A short line for --verbose: the tool and its main argument.
export function describeToolCall(name: string, args: Record<string, unknown>): string {
  const detail = ["command", "pattern", "path"].map((k) => args[k]).find((v) => typeof v === "string")
  return `${name} ${detail ?? ""}`.trim().slice(0, 160)
}

// Runs one tool call. Errors come back as text, so the model can read them and adjust.
export function runWorkspaceTool(root: string, name: string, args: Record<string, unknown>): string {
  try {
    switch (name) {
      case "read_file":
        return readFile(root, requireString(args, "path"), optInt(args, "offset"), optInt(args, "limit"))
      case "list_files":
        return listFiles(root, requireString(args, "pattern"))
      case "search":
        return search(root, requireString(args, "pattern"), optString(args, "path"), optString(args, "glob"))
      case "run_command":
        return runCommand(root, requireString(args, "command"))
      default:
        return `Error: unknown tool "${name}". Available: ${WORKSPACE_TOOLS.map((t) => t.name).join(", ")}.`
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}

// The real path of `relative` inside the checkout, or an error when it would leave it.
export function resolveInside(root: string, relative: string): string {
  const rootReal = fs.realpathSync(root)
  const target = path.resolve(rootReal, relative)
  const real = fs.existsSync(target) ? fs.realpathSync(target) : target
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
    throw new Error(`${relative} is outside the checkout`)
  }
  return real
}

function readFile(root: string, relative: string, offset = 1, limit = DEFAULT_READ_LINES): string {
  const file = resolveInside(root, relative)
  if (!fs.existsSync(file)) throw new Error(`${relative} does not exist`)
  if (fs.statSync(file).isDirectory()) throw new Error(`${relative} is a directory; use list_files`)
  const lines = fs.readFileSync(file, "utf8").split("\n")
  if (lines.length > 1 && lines.at(-1) === "") lines.pop() // the newline that ends the file is not a line
  const start = Math.max(1, offset)
  const shown = lines.slice(start - 1, start - 1 + Math.max(1, limit))
  const body = shown.map((line, i) => `${String(start + i).padStart(6)}\t${line}`).join("\n")
  const end = start + shown.length - 1
  const more = end < lines.length ? `\n… ${lines.length - end} more line(s); read on with offset ${end + 1}` : ""
  return cap(body + more)
}

function listFiles(root: string, pattern: string): string {
  const matcher = globToRegExp(pattern.replace(/^\.\//, ""))
  const rootReal = fs.realpathSync(root)
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (found.length > MAX_LISTED_FILES) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(full)
      } else if (entry.isFile()) {
        const rel = path.relative(rootReal, full).split(path.sep).join("/")
        if (matcher.test(rel)) found.push(rel)
      }
    }
  }
  walk(rootReal)
  if (found.length === 0) return "No files match."
  const shown = found.slice(0, MAX_LISTED_FILES).sort()
  const more = found.length > MAX_LISTED_FILES ? `\n… more than ${MAX_LISTED_FILES} files; narrow the pattern` : ""
  return cap(shown.join("\n") + more)
}

function search(root: string, pattern: string, under?: string, glob?: string): string {
  const pathspecs: string[] = []
  if (under) pathspecs.push(path.relative(fs.realpathSync(root), resolveInside(root, under)) || ".")
  if (glob) pathspecs.push(`:(glob)${glob.includes("/") ? glob : `**/${glob}`}`)
  const result = spawnSync("git", ["grep", "-n", "-I", "-E", "-e", pattern, "--", ...pathspecs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.status === 1) return "No matches."
  if (result.status !== 0) throw new Error((result.stderr || "git grep failed").trim())
  return cap(result.stdout.trimEnd())
}

function runCommand(root: string, command: string): string {
  const decision = isAllowedBash(command)
  if (!decision.allowed) {
    return `Refused: prlense is read-only (${decision.reason}). Use git, gh and search commands that only read.`
  }
  const result = spawnSync("sh", ["-c", command], {
    cwd: root,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw new Error(`could not run the command: ${result.error.message}`)
  const output = [result.stdout, result.stderr].filter((s) => s && s.trim()).join("\n").trimEnd()
  const status = result.status === 0 ? "" : `\n(exit status ${result.status ?? "killed after timeout"})`
  return cap((output || "(no output)") + status)
}

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return text.slice(0, MAX_OUTPUT_CHARS) + `\n… output cut at ${MAX_OUTPUT_CHARS} characters; ask for less`
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== "string" || !value.trim()) throw new Error(`"${key}" is required`)
  return value
}

function optString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function optInt(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined
}
