import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MissingApiKeyError } from "./parse";

// Triage is a cheap, high-volume task (one call per inbound email), so use Haiku.
const MODEL = "claude-haiku-4-5";

// Three-way decision so we can keep the main "Change Orders" label high-confidence
// and route anything ambiguous to a "Maybe" label for a human to confirm.
export const CLASSIFY_DECISIONS = ["yes", "maybe", "no"] as const;
export type ClassifyDecision = (typeof CLASSIFY_DECISIONS)[number];

export interface EmailClassification {
  decision: ClassifyDecision;
  reason: string;
}

const SYSTEM_PROMPT = `You triage a construction contractor's incoming email and decide whether it concerns a CHANGE ORDER — a request for, approval of, or discussion about extra or changed work on a project beyond the original contracted scope. This includes added work, deletions, substitutions, scope changes, "can you also…" requests, field changes that affect price, and time-and-materials / extra-work authorizations.

Return exactly one decision:
- "yes": the email is clearly about a change order or extra/changed work on a project.
- "maybe": it might be change-order related but is ambiguous, incomplete, or you are not sure — a human should confirm.
- "no": it is unrelated (newsletters, marketing, generic scheduling, routine invoices unrelated to scope changes, internal admin, personal mail, spam, etc.).

Be conservative: only answer "yes" when you are confident. When genuinely on the fence, answer "maybe" rather than forcing a "yes" or "no". Give a one-sentence reason for your decision.`;

// Structured-output schema (no min/max constraints — unsupported).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: CLASSIFY_DECISIONS },
    reason: { type: "string" },
  },
  required: ["decision", "reason"],
} as const;

const ClassificationSchema = z.object({
  decision: z.enum(CLASSIFY_DECISIONS),
  reason: z.string(),
});

// Decide whether an email is change-order related. `content` should be a compact
// "Subject / From / body" string — the body can be truncated by the caller.
export async function classifyEmail(
  content: string,
): Promise<EmailClassification> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    thinking: { type: "disabled" },
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return ClassificationSchema.parse(JSON.parse(text));
}
