// Small glob matcher so we do not depend on the experimental path.matchesGlob.
// Supports **, *, ? and character classes. Paths use forward slashes.
export function globToRegExp(glob: string): RegExp {
  let re = "^"
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" matches zero or more directories; a trailing "**" matches the rest.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?"
          i += 2
        } else {
          re += ".*"
          i += 1
        }
      } else {
        re += "[^/]*"
      }
    } else if (c === "?") {
      re += "[^/]"
    } else if (c === "[") {
      const end = glob.indexOf("]", i)
      if (end === -1) {
        re += "\\["
      } else {
        re += glob.slice(i, end + 1)
        i = end
      }
    } else if (/[.+^${}()|\\]/.test(c)) {
      re += "\\" + c
    } else {
      re += c
    }
  }
  return new RegExp(re + "$")
}

export function matchesAnyGlob(filePath: string, globs: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/")
  return globs.some((g) => globToRegExp(g).test(normalized))
}
