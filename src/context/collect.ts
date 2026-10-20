import type { ContextBundle, ContextDoc, ContextProvider, ContextRequest } from "./provider.js"
import { RepoFilesContextProvider } from "./repoFiles.js"

export function createProviders(): ContextProvider[] {
  return [new RepoFilesContextProvider()]
}

export async function collectContext(
  providers: ContextProvider[],
  req: ContextRequest,
  maxBytes: number,
): Promise<ContextBundle> {
  const all: ContextDoc[] = []
  for (const p of providers) all.push(...(await p.collect(req)))
  all.sort((a, b) => a.priority - b.priority || a.source.localeCompare(b.source))

  const docs: ContextDoc[] = []
  const truncated: string[] = []
  let total = 0
  for (const d of all) {
    const size = Buffer.byteLength(d.content, "utf8")
    if (total + size <= maxBytes) {
      docs.push(d)
      total += size
      continue
    }
    const room = maxBytes - total
    if (room > 2000) {
      // The budget is in bytes, so the cut is too; a character split at the edge is dropped.
      const cut = Buffer.from(d.content, "utf8").subarray(0, room).toString("utf8").replace(/\uFFFD$/, "")
      docs.push({ ...d, content: cut + "\n[... truncated to fit the context budget]" })
      total = maxBytes
    }
    truncated.push(d.source)
  }
  return { docs, truncated, totalBytes: total }
}
