import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8")) as Record<string, unknown>

// The installer and self-update run `npm ci`, which fails when the lockfile does not
// match package.json. Catch that here, before it reaches an install.
test("package-lock.json matches package.json", () => {
  const pkg = read("package.json")
  const lock = read("package-lock.json")
  const locked = (lock.packages as Record<string, Record<string, unknown>>)[""]
  // npm stores bin paths without a leading "./".
  const bin = Object.fromEntries(Object.entries(pkg.bin as Record<string, string>).map(([k, v]) => [k, v.replace(/^\.\//, "")]))
  assert.deepEqual(locked.bin, bin, `"bin" differs; run npm install --package-lock-only`)
  for (const key of ["name", "version", "license", "engines", "dependencies", "devDependencies"]) {
    assert.deepEqual(locked[key], pkg[key], `"${key}" differs; run npm install --package-lock-only`)
  }
})
