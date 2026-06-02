"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmChangeOrder, createChangeOrder } from "./db";
import { runEmailIngest, type IngestResult } from "./email-ingest";
import { generateEstimate } from "./estimate";
import { MissingApiKeyError, parseChangeOrder } from "./parse";
import type { Estimate, NewChangeOrderInput, ParsedChangeOrder } from "./types";

export type EstimateResult =
  | { ok: true; estimate: Estimate }
  | { ok: false; error: string };

export async function generateEstimateAction(
  scope: string,
): Promise<EstimateResult> {
  const text = scope?.trim();
  if (!text) {
    return { ok: false, error: "Add a scope of work first, then generate an estimate." };
  }
  try {
    const estimate = await generateEstimate(text);
    return { ok: true, estimate };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return {
        ok: false,
        error: "AI isn't configured yet (set ANTHROPIC_API_KEY). You can enter an estimate manually.",
      };
    }
    console.error("generateEstimateAction failed:", err);
    return { ok: false, error: "Couldn't generate an estimate. Please try again." };
  }
}

export type ParseResult =
  | { ok: true; data: ParsedChangeOrder }
  | { ok: false; error: string };

export async function parseAction(rawInput: string): Promise<ParseResult> {
  const text = rawInput?.trim();
  if (!text) {
    return { ok: false, error: "Please enter a description of the change order." };
  }
  try {
    const data = await parseChangeOrder(text);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return {
        ok: false,
        error:
          "AI parsing isn't configured yet. Set the ANTHROPIC_API_KEY environment variable in your Vercel project settings, then redeploy. You can still fill in the fields manually below.",
      };
    }
    console.error("parseAction failed:", err);
    return {
      ok: false,
      error: "Couldn't parse that input. Please try again, or fill in the fields manually below.",
    };
  }
}

export async function createChangeOrderAction(
  input: NewChangeOrderInput,
): Promise<void> {
  const created = await createChangeOrder(input);
  revalidatePath("/");
  redirect(`/?created=${created.id}`);
}

export async function approveChangeOrderAction(
  id: number,
  input: NewChangeOrderInput,
): Promise<void> {
  const confirmed = await confirmChangeOrder(id, input);
  revalidatePath("/");
  redirect(`/?created=${confirmed.id}`);
}

export async function checkEmailNowAction(): Promise<IngestResult> {
  const result = await runEmailIngest();
  if (result.created > 0) revalidatePath("/");
  return result;
}
