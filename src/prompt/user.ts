import type { ContextBundle } from "../context/provider.js"
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

// Text from the PR or the repo goes inside tags; a closing tag in it would end the block
// early and let the rest read as part of the task.
export function escapeTags(text: string): string {
  return text.replace(/<\/(pr|body|tickets|inventory|context|doc)>/gi, "<\\/$1>")
}

function renderContextBlock(bundle: ContextBundle): string {
  if (bundle.docs.length === 0) return "<context>\n(no repository instruction files found)\n</context>"
  const parts = bundle.docs.map(
    (d) => `<doc source="${d.source.replace(/"/g, "&quot;")}" kind="${d.kind}">\n${escapeTags(d.content.trim())}\n</doc>`,
  )
  return `<context>\n${parts.join("\n\n")}\n</context>`
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
title: ${escapeTags(pr.title)}
author: ${pr.author}
state: ${pr.state}${pr.isDraft ? " (draft)" : ""}
base: ${pr.baseRefName}  head: ${pr.headRefName}${pr.headRepoSlug ? `  (from fork ${pr.headRepoSlug})` : ""}
files: ${pr.changedFiles}  +${pr.additions}/-${pr.deletions}
BASE_SHA: ${worktree.baseSha}
HEAD_SHA: ${worktree.headSha}
<body>
${escapeTags(pr.body.trim()) || "(empty)"}
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
