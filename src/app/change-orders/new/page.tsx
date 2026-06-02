import Link from "next/link";
import { ChangeOrderForm } from "@/app/change-orders/_components/change-order-form";
import { hasDatabase, listProjects } from "@/lib/db";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewChangeOrderPage() {
  let projects: Project[] = [];
  if (hasDatabase()) {
    projects = await listProjects().catch(() => []);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F2942]">
          New Change Order
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Paste a messy request — voice transcription, email, or text — and let AI
          structure it. Review, then generate a formal change order.
        </p>
      </div>

      <ChangeOrderForm projects={projects} mode="create" />
    </main>
  );
}
