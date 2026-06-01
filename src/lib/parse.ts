import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { APPROVAL_STATUSES, type ParsedChangeOrder } from "./types";

// Per the project's Claude API guidance: default to the latest Opus.
// Swap to "claude-sonnet-4-6" or "claude-haiku-4-5" to lower cost if desired.
const MODEL = "claude-opus-4-8";

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
- projectName: the project, building, or site the work relates to, exactly as referenced. If none is identifiable, use an empty string.`;

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
  },
  required: [
    "projectName",
    "scopeDescription",
    "costAmount",
    "approvalStatus",
    "initiator",
    "requestDate",
  ],
} as const;

const ParsedSchema = z.object({
  projectName: z.string(),
  scopeDescription: z.string(),
  costAmount: z.number().nullable(),
  approvalStatus: z.enum(APPROVAL_STATUSES),
  initiator: z.string().nullable(),
  requestDate: z.string().nullable(),
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
    // Extraction is a scoped task — keep thinking off and effort low for speed/cost.
    thinking: { type: "disabled" },
    output_config: {
      effort: "low",
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
