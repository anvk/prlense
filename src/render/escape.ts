export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

export function escapeAttr(s: string): string {
  return escapeHtml(s)
}

const SAFE_HREF = /^https:\/\/(github\.com\/|[\w-]+\.atlassian\.net\/)/

export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined
  return SAFE_HREF.test(url) ? url : undefined
}

// Plain text in, HTML out. Escapes first, then the only two bits of inline markup the
// report allows: `code` spans and a trailing [UNVERIFIED] marker.
export function renderInline(s: string): string {
  let html = escapeHtml(s)
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>")
  html = html.replace(/\s*\[UNVERIFIED\]\s*$/, ' <span class="unverified" title="Not confirmed from the code">unverified</span>')
  return html
}

// JSON inside a <script> tag must not contain "</" sequences, and the two Unicode line
// separators are invalid in JS source before ES2019, so they are escaped too.
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

export function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(LS, "\\u2028")
    .replaceAll(PS, "\\u2029")
}
