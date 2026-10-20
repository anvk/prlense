// The viewer, bundled into every page. It exists so a JSON someone shares can be opened by
// anyone, whether or not they have prlense installed: drop the file on the page and it
// re-renders in place.
//
// This is the same renderer the CLI uses. It can run here because nothing in it touches
// Node — the GitHub links are already baked into the report before it is saved, so even the
// sha256 anchoring has happened by now.
import { reportProblem } from "../report/compat.js"
import type { Report } from "../report/types.js"
import { pageTitle, renderBody } from "./html.js"

declare global {
  interface Window {
    prlenseViewer?: {
      render(report: Report): void
      loadFile(file: File): Promise<void>
    }
    prlenseInit?: () => void
  }
}

function currentReport(): Report | null {
  const el = document.getElementById("prlense-report")
  if (!el?.textContent) return null
  try {
    return JSON.parse(el.textContent) as Report
  } catch {
    return null
  }
}

function render(report: Report): void {
  const wrap = document.querySelector(".wrap")
  if (!wrap) return
  wrap.innerHTML = renderBody(report)

  // Keep the embedded copy in step, so Download hands back what is on screen.
  const el = document.getElementById("prlense-report")
  if (el) el.textContent = JSON.stringify(report).replace(/</g, "\\u003c")

  document.title = `${pageTitle(report)} · prlense`
  // Re-wire the per-element handlers against the markup that just replaced them.
  window.prlenseInit?.()
}

function announce(message: string, tone: "ok" | "bad"): void {
  const existing = document.querySelector(".toast")
  if (existing) existing.remove()
  const node = document.createElement("div")
  node.className = `toast ${tone}`
  node.textContent = message
  document.body.appendChild(node)
  setTimeout(() => node.remove(), 4000)
}

async function loadFile(file: File): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    announce(`${file.name} is not valid JSON`, "bad")
    return
  }
  const problem = reportProblem(parsed)
  if (problem) {
    announce(`Cannot open ${file.name}: ${problem}.`, "bad")
    return
  }
  render(parsed as Report)
  window.scrollTo({ top: 0 })
  announce(`Loaded ${file.name}`, "ok")
}

function download(): void {
  const report = currentReport()
  if (!report) return
  const name = `pr-${report.pr.number}.json`
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
  announce(`Saved ${name}`, "ok")
}

// Dropping a file anywhere on the page loads it. The overlay only appears once something is
// actually being dragged over the window.
function wireDragAndDrop(): void {
  const zone = document.querySelector(".dropzone")
  let depth = 0
  const show = (on: boolean) => {
    if (on) zone?.removeAttribute("hidden")
    else zone?.setAttribute("hidden", "")
  }
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return
    e.preventDefault()
    depth++
    show(true)
  })
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault()
  })
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) show(false)
  })
  window.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    e.preventDefault()
    depth = 0
    show(false)
    void loadFile(file)
  })
}

// Delegated, so it survives the body being replaced by a load.
function wireButtons(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest("#download-json")) {
      download()
      return
    }
    if (target?.closest("#load-json")) {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "application/json,.json"
      input.addEventListener("change", () => {
        const file = input.files?.[0]
        if (file) void loadFile(file)
      })
      input.click()
    }
  })
}

window.prlenseViewer = { render, loadFile }
wireDragAndDrop()
wireButtons()
