"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createChangeOrder } from "./db";
import { MissingApiKeyError, parseChangeOrder } from "./parse";
import type { NewChangeOrderInput, ParsedChangeOrder } from "./types";

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
