import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  listCostEquipment,
  listCostLabour,
  listCostMaterials,
  listHistoricalChangeOrders,
} from "./db";
import { MissingApiKeyError } from "./parse";
import { ESTIMATE_LINE_TYPES, type Estimate } from "./types";

// Estimation is more reasoning-heavy than the email parsing, so it defaults to
// Sonnet. Change to "claude-haiku-4-5" (cheaper) or "claude-opus-4-8" (sharper).
const MODEL = "claude-sonnet-4-6";
const DEFAULT_MARKUP_PCT = 15;

const SYSTEM_INSTRUCTIONS = `You are a senior construction estimator at Prime Design Build. Given a change-order scope, produce a realistic, itemized cost estimate.

Rules:
- Use the provided rate catalog wherever an item applies; reference its catalog id in "ref" (e.g. "MAT-001", "LAB-004", "EQ-002") and use its unit cost.
- For labour, estimate the hours required and use the trade's hourly rate as unitCost (unit = "hr").
- For materials, estimate the quantity in the item's unit.
- For equipment, use the appropriate rental rate and duration.
- If something genuinely isn't in the catalog, use type "other", set ref to null, and give your best realistic unit cost.
- Do NOT include markup in the line items — set markupPct (use ${DEFAULT_MARKUP_PCT} unless the scope clearly calls for different) and the system computes the markup and totals.
- Keep quantities and hours grounded and consistent with the historical change orders provided.
- "notes" should briefly state key assumptions (1-2 sentences).`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ESTIMATE_LINE_TYPES },
          ref: { type: ["string", "null"] },
          description: { type: "string" },
          unit: { type: ["string", "null"] },
          quantity: { type: "number" },
          unitCost: { type: "number" },
        },
        required: ["type", "ref", "description", "unit", "quantity", "unitCost"],
      },
    },
    markupPct: { type: "number" },
    notes: { type: ["string", "null"] },
  },
  required: ["lineItems", "markupPct", "notes"],
} as const;

const EstimateModelSchema = z.object({
  lineItems: z.array(
    z.object({
      type: z.enum(ESTIMATE_LINE_TYPES),
      ref: z.string().nullable(),
      description: z.string(),
      unit: z.string().nullable(),
      quantity: z.number(),
      unitCost: z.number(),
    }),
  ),
  markupPct: z.number(),
  notes: z.string().nullable(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

async function buildCatalogText(): Promise<string> {
  const [materials, labour, equipment, historical] = await Promise.all([
    listCostMaterials(),
    listCostLabour(),
    listCostEquipment(),
    listHistoricalChangeOrders(),
  ]);

  const mat = materials
    .map(
      (m) =>
        `${m.itemId} | ${m.category ?? ""}/${m.subCategory ?? ""} | ${m.description} | ${m.unit ?? ""} | $${m.unitCost ?? "?"}`,
    )
    .join("\n");
  const lab = labour
    .map(
      (l) =>
        `${l.tradeId} | ${l.trade ?? ""} – ${l.classification ?? ""} | $${l.rate ?? "?"}/hr (OT $${l.otRate ?? "?"})`,
    )
    .join("\n");
  const eq = equipment
    .map(
      (e) =>
        `${e.equipId} | ${e.category ?? ""} | ${e.description} | ${e.rateType ?? ""} $${e.rate ?? "?"}`,
    )
    .join("\n");
  const hist = historical
    .map(
      (h) =>
        `${h.description} | ${h.category ?? ""} | labour ${h.labourHours ?? "?"}h $${h.labourCost ?? "?"} | materials $${h.materialCost ?? "?"} | equip $${h.equipmentCost ?? "?"} | markup ${h.markupPct ?? "?"}% | total $${h.totalValue ?? "?"}`,
    )
    .join("\n");

  return `RATE CATALOG\n\n# Materials (id | category | description | unit | unit cost)\n${mat}\n\n# Labour (id | trade – classification | rate)\n${lab}\n\n# Equipment (id | category | description | rate)\n${eq}\n\n# Historical change orders (for grounding)\n${hist}`;
}

export async function generateEstimate(scope: string): Promise<Estimate> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const catalog = await buildCatalogText();
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      { type: "text", text: SYSTEM_INSTRUCTIONS },
      // Catalog is stable across requests — cache it.
      { type: "text", text: catalog, cache_control: { type: "ephemeral" } },
    ],
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Produce an itemized estimate for this change order:\n\n${scope}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = EstimateModelSchema.parse(JSON.parse(text));

  // Compute all money fields deterministically so the totals always reconcile.
  const lineItems = parsed.lineItems.map((li) => ({
    ...li,
    lineTotal: round2(li.quantity * li.unitCost),
  }));
  const subtotal = round2(lineItems.reduce((s, li) => s + li.lineTotal, 0));
  const markupPct = parsed.markupPct ?? DEFAULT_MARKUP_PCT;
  const markupAmount = round2((subtotal * markupPct) / 100);
  const total = round2(subtotal + markupAmount);

  return { lineItems, subtotal, markupPct, markupAmount, total, notes: parsed.notes };
}
