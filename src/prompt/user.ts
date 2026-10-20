import type { ContextBundle } from "../context/provider.js"
import { renderContextBlock } from "../context/collect.js"
import { formatInventory, type ChangedFile } from "../github/diff.js"
import type { PrMeta, TicketRef } from "../github/pr.js"
import type { PrWorktree } from "../github/worktree.js"

export interface UserPromptInput {
  pr: PrMeta
  worktree: PrWorktree
  changedFiles: ChangedFile[]
  ticketRefs: TicketRef[]
  context: ContextBundle
}

export function buildUserPrompt(input: UserPromptInput): string {
  const { pr, worktree, changedFiles, ticketRefs, context } = input
  const traceable = changedFiles.filter((f) => !f.generated && !f.test)
  const lines = traceable.reduce((n, f) => n + f.additions + f.deletions, 0)
  const tickets = ticketRefs.length
    ? ticketRefs.map((t) => (t.url ? `${t.key} ${t.url}` : t.key)).join("\n")
    : "(none found in the PR body)"
  return `<pr>
number: ${pr.number}
repo: ${pr.slug}
url: ${pr.url}
title: ${pr.title}
author: ${pr.author}
state: ${pr.state}${pr.isDraft ? " (draft)" : ""}
base: ${pr.baseRefName}  head: ${pr.headRefName}${pr.headRepoSlug ? `  (from fork ${pr.headRepoSlug})` : ""}
files: ${pr.changedFiles}  +${pr.additions}/-${pr.deletions}
BASE_SHA: ${worktree.baseSha}
HEAD_SHA: ${worktree.headSha}
<body>
${pr.body.trim() || "(empty)"}
</body>
</pr>

<tickets>
${tickets}
</tickets>

<inventory>
${formatInventory(changedFiles)}
</inventory>
Traceable: ${traceable.length} files, ${lines} changed lines (generated and test files excluded).

${renderContextBlock(context)}

Trace the change against the checkout, then answer with the JSON object.`
}
