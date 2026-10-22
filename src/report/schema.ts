// The JSON schema handed to the engine for structured output. Its own module so the browser
// viewer, which imports the report types, does not carry it.
import {
  FUNCTION_CHANGES,
  FUNCTION_KINDS,
  MODEL_CHANGES,
  MODEL_CHANGE_KINDS,
  MODEL_GROUPS,
  REFERENCE_KINDS,
  RISK_KINDS,
  ROW_CHANGES,
  WHAT_SECTION_KINDS,
} from "./types.js"

const fileRefSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: { type: "string" },
    line: { type: "integer" },
    oldLine: { type: "integer" },
    symbol: { type: "string" },
  },
}

// JSON schema for AgentOutput, handed to the engine for structured output.
export const AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["why", "what", "model", "functions", "details", "review", "coverage"],
  properties: {
    why: {
      type: "object",
      required: ["paragraphs", "references"],
      properties: {
        paragraphs: { type: "array", items: { type: "string" } },
        references: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "kind"],
            properties: {
              label: { type: "string" },
              url: { type: "string" },
              kind: { type: "string", enum: [...REFERENCE_KINDS] },
              note: { type: "string" },
            },
          },
        },
      },
    },
    what: {
      type: "object",
      required: ["lead", "sections"],
      properties: {
        lead: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            required: ["kind", "title", "summary", "points"],
            properties: {
              kind: { type: "string", enum: [...WHAT_SECTION_KINDS] },
              title: { type: "string" },
              summary: { type: "string" },
              points: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    model: {
      type: "object",
      required: ["summary", "changes"],
      properties: {
        summary: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            required: ["group", "kind", "name", "change", "description", "locations"],
            properties: {
              group: { type: "string", enum: [...MODEL_GROUPS] },
              kind: {
                type: "string",
                enum: [...MODEL_CHANGE_KINDS],
              },
              name: { type: "string" },
              change: { type: "string", enum: [...MODEL_CHANGES] },
              description: { type: "string" },
              attention: { type: "boolean" },
              shape: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "type", "change"],
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    keys: { type: "string" },
                    note: { type: "string" },
                    change: { type: "string", enum: [...ROW_CHANGES] },
                  },
                },
              },
              indexes: { type: "array", items: { type: "string" } },
              relations: { type: "array", items: { type: "string" } },
              locations: { type: "array", items: fileRefSchema },
              risk: { type: "string" },
              unverified: { type: "boolean" },
            },
          },
        },
      },
    },
    functions: {
      type: "object",
      required: ["groups"],
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            required: ["area", "items"],
            properties: {
              area: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "kind", "change", "summary", "location"],
                  properties: {
                    name: { type: "string" },
                    kind: {
                      type: "string",
                      enum: [...FUNCTION_KINDS],
                    },
                    change: { type: "string", enum: [...FUNCTION_CHANGES] },
                    summary: { type: "string" },
                    location: fileRefSchema,
                    detailIds: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    details: {
      type: "object",
      required: ["changes"],
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "title", "files", "after", "explanation"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              area: { type: "string" },
              files: { type: "array", items: fileRefSchema },
              before: { type: "string" },
              after: { type: "string" },
              explanation: { type: "array", items: { type: "string" } },
              callers: { type: "array", items: { type: "string" } },
              tests: { type: "array", items: fileRefSchema },
              unverified: { type: "boolean" },
            },
          },
        },
      },
    },
    review: {
      type: "object",
      required: ["risks", "questions", "glossary"],
      properties: {
        risks: {
          type: "array",
          items: {
            type: "object",
            required: ["kind", "title", "consequence"],
            properties: {
              kind: { type: "string", enum: [...RISK_KINDS] },
              title: { type: "string" },
              consequence: { type: "string" },
              source: { type: "object", properties: { modelChange: { type: "string" }, detailId: { type: "string" } } },
              unverified: { type: "boolean" },
            },
          },
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            required: ["question", "context"],
            properties: {
              question: { type: "string" },
              context: { type: "string" },
              source: { type: "object", properties: { modelChange: { type: "string" }, detailId: { type: "string" } } },
            },
          },
        },
        glossary: {
          type: "array",
          items: { type: "object", required: ["term", "meaning"], properties: { term: { type: "string" }, meaning: { type: "string" } } },
        },
      },
    },
    coverage: {
      type: "object",
      required: ["filesTraced", "filesSkippedGenerated", "filesSkippedTests", "filesUntraced"],
      properties: {
        filesTraced: { type: "array", items: { type: "string" } },
        filesSkippedGenerated: { type: "array", items: { type: "string" } },
        filesSkippedTests: { type: "array", items: { type: "string" } },
        filesUntraced: {
          type: "array",
          items: { type: "object", required: ["path", "reason"], properties: { path: { type: "string" }, reason: { type: "string" } } },
        },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const
