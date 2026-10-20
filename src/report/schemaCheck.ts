// A small JSON Schema checker for the subset the report schema uses: type, enum, required,
// properties, items and additionalProperties: false. The schema handed to the model is
// then the one definition of the report's shape; nothing restates it field by field.

export interface Schema {
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean"
  enum?: readonly unknown[]
  required?: readonly string[]
  properties?: Record<string, Schema>
  additionalProperties?: boolean
  items?: Schema
}

const MAX_ERRORS = 25

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function typeMatches(type: NonNullable<Schema["type"]>, value: unknown): boolean {
  switch (type) {
    case "object":
      return isRecord(value)
    case "array":
      return Array.isArray(value)
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    default:
      return typeof value === type
  }
}

// Every way `value` breaks `schema`, as "path: problem" lines; empty when it fits.
export function checkSchema(schema: Schema, value: unknown, at = "output"): string[] {
  const errors: string[] = []
  const visit = (s: Schema, v: unknown, path: string): void => {
    if (errors.length >= MAX_ERRORS) return
    if (s.type && !typeMatches(s.type, v)) {
      errors.push(`${path}: expected ${/^[aeiou]/.test(s.type) ? "an" : "a"} ${s.type}`)
      return
    }
    if (s.enum && !s.enum.includes(v)) errors.push(`${path}: expected one of ${s.enum.join(", ")}`)
    if (isRecord(v)) {
      for (const key of s.required ?? []) if (v[key] === undefined) errors.push(`${path}.${key}: missing`)
      for (const [key, child] of Object.entries(s.properties ?? {})) if (v[key] !== undefined) visit(child, v[key], `${path}.${key}`)
      if (s.additionalProperties === false) {
        for (const key of Object.keys(v)) if (!s.properties?.[key]) errors.push(`${path}.${key}: not part of the schema`)
      }
    }
    if (Array.isArray(v) && s.items) v.forEach((item, i) => visit(s.items!, item, `${path}[${i}]`))
  }
  visit(schema, value, at)
  return errors
}

// A copy of `value` holding only what `schema` declares, so stray fields a model adds never
// reach the report. Assumes `value` already passed checkSchema.
export function keepDeclared<T>(schema: Schema, value: unknown): T {
  const visit = (s: Schema, v: unknown): unknown => {
    if (Array.isArray(v)) return s.items ? v.map((item) => visit(s.items!, item)) : v
    if (!isRecord(v) || !s.properties) return v
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(s.properties)) if (v[key] !== undefined) out[key] = visit(child, v[key])
    return out
  }
  return visit(schema, value) as T
}
