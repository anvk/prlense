import { createHash } from "node:crypto"
import type { FileRef, PrHeader, Report } from "./types.js"

// GitHub anchors a file in the "Files changed" tab by the sha256 of its path.
export function diffAnchor(repoPath: string): string {
  return createHash("sha256").update(repoPath).digest("hex")
}

export function diffUrl(pr: PrHeader, ref: FileRef): string {
  const base = `https://github.com/${pr.slug}/pull/${pr.number}/files#diff-${diffAnchor(ref.path)}`
  if (ref.line !== undefined) return `${base}R${ref.line}`
  if (ref.oldLine !== undefined) return `${base}L${ref.oldLine}`
  return base
}

export function blobUrl(pr: PrHeader, ref: FileRef): string {
  const sha = ref.line === undefined && ref.oldLine !== undefined ? pr.baseSha : pr.headSha
  const line = ref.line ?? ref.oldLine
  return `https://github.com/${pr.slug}/blob/${sha}/${ref.path}${line !== undefined ? `#L${line}` : ""}`
}

function decorate(pr: PrHeader, ref: FileRef): void {
  if ((ref as FileRef & { unlinked?: boolean }).unlinked) return
  ref.diffUrl = diffUrl(pr, ref)
  ref.blobUrl = blobUrl(pr, ref)
}

export function decorateLinks(report: Report): Report {
  const pr = report.pr
  report.model.changes.forEach((m) => m.locations.forEach((l) => decorate(pr, l)))
  report.functions.groups.forEach((g) => g.items.forEach((it) => decorate(pr, it.location)))
  report.details.changes.forEach((d) => {
    d.files.forEach((f) => decorate(pr, f))
    d.tests?.forEach((f) => decorate(pr, f))
  })
  return report
}
