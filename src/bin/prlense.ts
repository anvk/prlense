#!/usr/bin/env node

import path from "node:path"
import { fileURLToPath } from "node:url"
import { Command } from "commander"
import pc from "picocolors"
import { runBashGuardCommand, runCleanCommand, runRenderCommand } from "../cli/commands.js"
import { runDoctorCommand } from "../cli/doctor.js"
import { runExplainCommand, type ExplainOptions } from "../cli/explain.js"
import { describeVersion, packageVersion, resolveInstall } from "../update/install.js"
import { maybeAutoUpdate } from "../update/index.js"
import { runUpdateCommand } from "../update/update.js"
import { isOfflineInvocation } from "../github/target.js"
import { errorMessage } from "../core/util.js"
import { cleanupAllWorktrees } from "../github/worktree.js"

const thisFile = fileURLToPath(import.meta.url)
const packageRoot = path.resolve(path.dirname(thisFile), "../..")

// The commit date and sha of the installed checkout. package.json's number has never been
// bumped, so it is only the fallback for a checkout that is no longer a git repo.
function describeInstalledVersion(): string {
  try {
    return describeVersion(resolveInstall())
  } catch {
    return packageVersion(packageRoot)
  }
}

// Commander wants a plain string when the flag is registered, so the git lookup happens
// only when the flag is actually there.
function versionForFlag(): string {
  const asked = process.argv.includes("-v") || process.argv.includes("--version")
  return asked ? describeInstalledVersion() : packageVersion(packageRoot)
}

function fail(error: unknown): never {
  console.error(pc.red(errorMessage(error)))
  process.exit(1)
}

process.on("uncaughtException", (error) => {
  cleanupAllWorktrees()
  fail(error)
})
process.on("unhandledRejection", (error) => {
  cleanupAllWorktrees()
  fail(error)
})

const program = new Command()
program
  .name("prlense")
  .description("Explain a GitHub pull request as a six-step HTML walkthrough")
  .version(versionForFlag(), "-v, --version", "Show CLI version")
  .showHelpAfterError("(add --help for additional information)")

// Commander hands options over under their flag names, which already match ExplainOptions.
type ExplainFlags = Omit<ExplainOptions, "version" | "cliScriptPath">

program
  .command("explain", { isDefault: true })
  .description("Explain a PR, or open a report JSON from a path or a URL")
  .argument("<target>", "PR number or URL, a prlense report JSON, or a link to one")
  .option("-C, --repo <path>", "Local checkout of the target repo (default: current directory)")
  .option("--remote <name>", "Which git remote owns the PR (needed when a bare number is ambiguous)")
  .option("--context <glob...>", "Extra repo docs to hand the model, on top of the AGENTS.md and CLAUDE.md files")
  .option("--with-rules", "Also load agent rule files (.claude/rules, .cursor/rules) from the directories above changed files")
  .option("--skip <glob...>", "Treat these paths as generated, on top of the built-in list")
  .option("--out <dir>", "Reports directory (default ~/.prlense/reports)")
  .option("--no-open", "Write the report without opening a browser")
  .option("--engine <name>", "Engine preset from ~/.prlense/config.json, or claude-cli (default: the config's engine)")
  .option("--model <id>", "Model id for the engine")
  .option("--keep-worktree", "Leave the temporary worktree in place for inspection")
  .option("--timestamp", "Add a timestamp to the report file names instead of overwriting")
  .option("--yes", "Run even when the PR is very large")
  .option("--verbose", "Print one line per tool call while the model works")
  .action((target: string, flags: ExplainFlags) =>
    runExplainCommand(target, { ...flags, version: describeInstalledVersion(), cliScriptPath: thisFile }),
  )

program
  .command("render")
  .description("Re-render the HTML page from a saved report JSON, without running the model")
  .argument("<report.json>", "Path to a prlense report JSON")
  .option("--out <file>", "Where to write the HTML (default: next to the JSON)")
  .option("--no-open", "Do not open a browser")
  .action((jsonPath: string, opts: { out?: string; open: boolean }) => runRenderCommand(path.resolve(jsonPath), opts))

program
  .command("clean")
  .description("Remove leftover prlense worktrees and refs from interrupted runs")
  .option("-C, --repo <path>", "Local checkout of the target repo")
  .action((opts: { repo?: string }) => runCleanCommand(opts))

program
  .command("update")
  .description("Update prlense now instead of waiting for the next run")
  .option("--check", "Only report whether an update is available")
  .action((opts: { check?: boolean }) => runUpdateCommand(opts))

program
  .command("doctor")
  .description("Check git, gh, the repo, config files and the engine login")
  .option("-C, --repo <path>", "Local checkout of the target repo")
  .option("--engine <name>", "Engine preset or kind to check")
  .option("--model <id>", "Model id for the engine")
  .action((opts: { repo?: string; engine?: string; model?: string }) => runDoctorCommand({ ...opts, cliScriptPath: thisFile }))

program
  .command("bash-guard", { hidden: true })
  .description("PreToolUse hook target: allows read-only shell commands only")
  .action(() => runBashGuardCommand())

// Before commander, so a run always generates with the newest report format and an update
// can re-exec the command rather than run it on stale code.
if (!isOfflineInvocation(process.argv)) maybeAutoUpdate(process.argv)

program.parseAsync(process.argv).catch(fail)
