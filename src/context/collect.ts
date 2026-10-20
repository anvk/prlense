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
      docs.push({ ...d, content: d.content.slice(0, room) + "\n[... truncated to fit the context budget]" })
      total = maxBytes
    }
    truncated.push(d.source)
  }
  return { docs, truncated, totalBytes: total }
}

export function renderContextBlock(bundle: ContextBundle): string {
  if (bundle.docs.length === 0) return "<context>\n(no repository instruction files found)\n</context>"
  const parts = bundle.docs.map(
    (d) => `<doc source="${d.source}" kind="${d.kind}">\n${d.content.trim()}\n</doc>`,
  )
  return `<context>\n${parts.join("\n\n")}\n</context>`
}
