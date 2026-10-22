// Type checks for parsed JSON, shared by config parsing, report checks and the browser
// viewer. No Node imports, so the viewer bundle can use them.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Optional fields of a config object, with an error naming where the value came from.
export function optString(obj: Record<string, unknown>, key: string, where: string): string | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (typeof v !== "string") throw new Error(`${where}: "${key}" must be a string`)
  return v
}

export function optNumber(obj: Record<string, unknown>, key: string, where: string): number | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (typeof v !== "number" || Number.isNaN(v)) throw new Error(`${where}: "${key}" must be a number`)
  return v
}

export function optStringArray(obj: Record<string, unknown>, key: string, where: string): string[] | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`${where}: "${key}" must be an array of strings`)
  return v as string[]
}
