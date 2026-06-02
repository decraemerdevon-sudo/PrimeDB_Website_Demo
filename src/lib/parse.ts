import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  APPROVAL_STATUSES,
  FLAGGABLE_FIELDS,
  type ParsedChangeOrder,
} from "./types";

// Haiku is the cheapest model and is plenty for this scoped extraction task.
// Swap to "claude-sonnet-4-6" or "claude-opus-4-8" for higher-quality parsing.
// Note: if you switch to Sonnet 4.6 / Opus you can also add `effort` back into
// output_config below — Haiku 4.5 does not support the effort parameter.
const MODEL = "claude-haiku-4-5";

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set.");
    this.name = "MissingApiKeyError";
  }
}

const SYSTEM_PROMPT = `You convert messy, informal construction change-order requests (voice transcriptions, emails, texts) into structured data for a formal change order.

Extraction rules:
- scopeDescription: rewrite the requested work into clear, concise, professional construction language suitable for a formal change order. Do not invent specifics that aren't supported by the input.
- costAmount: the dollar figure as a plain number with no symbols, words, or commas. Examples: "28 grand" -> 28000, "$12,500" -> 12500, "twelve hundred" -> 1200. Use null if no cost is stated.
- approvalStatus: "Verbal" if approved verbally/over the phone/in person, "Written" if approved in writing/email/signed, "Pending" if awaiting a decision, "None" if approval is not mentioned.
- initiator: who requested or approved the change (e.g. "Client", a person's name, "Architect"). null if not identifiable.
- requestDate: an ISO date (yyyy-mm-dd) if a specific date is stated; otherwise null. Do not guess.
- projectName: the project, building, or site the work relates to, exactly as referenced. Use an empty string if none is identifiable.

reviewFlags: list every field whose value is MISSING from the input or that you are UNSURE about, so a human reviewer knows what to confirm. For each, give the field name and a short, specific note (e.g. "No cost mentioned", "Approval not stated — please confirm", "No project named"). Only flag genuine gaps or ambiguities; do not flag fields you extracted confidently. Allowed field names: ${FLAGGABLE_FIELDS.join(", ")}.`;

// JSON schema for structured outputs (no min/max constraints — unsupported).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectName: { type: "string" },
    scopeDescription: { type: "string" },
    costAmount: { type: ["number", "null"] },
    approvalStatus: { type: "string", enum: APPROVAL_STATUSES },
    initiator: { type: ["string", "null"] },
    requestDate: { type: ["string", "null"] },
    reviewFlags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string", enum: FLAGGABLE_FIELDS },
          note: { type: "string" },
        },
        required: ["field", "note"],
      },
    },
  },
  required: [
    "projectName",
    "scopeDescription",
    "costAmount",
    "approvalStatus",
    "initiator",
    "requestDate",
    "reviewFlags",
  ],
} as const;

const ParsedSchema = z.object({
  projectName: z.string(),
  scopeDescription: z.string(),
  costAmount: z.number().nullable(),
  approvalStatus: z.enum(APPROVAL_STATUSES),
  initiator: z.string().nullable(),
  requestDate: z.string().nullable(),
  reviewFlags: z.array(
    z.object({ field: z.enum(FLAGGABLE_FIELDS), note: z.string() }),
  ),
});

export async function parseChangeOrder(
  rawInput: string,
): Promise<ParsedChangeOrder> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    // Extraction is a scoped task — keep thinking off for speed/cost.
    thinking: { type: "disabled" },
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: rawInput }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Structured outputs guarantee schema-valid JSON; validate defensively anyway.
  return ParsedSchema.parse(JSON.parse(text));
}
