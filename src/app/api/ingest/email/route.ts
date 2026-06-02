import { runEmailIngest } from "@/lib/email-ingest";

// Runs at request time (called by Vercel Cron or an external scheduler).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // No secret configured — allow (e.g. manual testing).
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runEmailIngest();
  return Response.json(result);
}
