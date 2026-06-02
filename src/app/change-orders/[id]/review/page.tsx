import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeOrderForm } from "@/app/change-orders/_components/change-order-form";
import { getChangeOrder, listProjects } from "@/lib/db";
import type { CoStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [co, projects] = await Promise.all([
    getChangeOrder(numericId),
    listProjects(),
  ]);
  if (!co) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F2942]">
          Review {co.coNumber}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Confirm the details below. Highlighted fields need your attention before
          this becomes an active change order.
        </p>
      </div>

      <ChangeOrderForm
        projects={projects}
        mode="review"
        coId={co.id}
        initial={{
          projectId: co.projectId,
          projectName: co.projectName,
          scopeDescription: co.scopeDescription,
          costAmount: co.costAmount,
          approvalStatus: co.approvalStatus,
          initiator: co.initiator,
          requestDate: co.requestDate,
          status: (co.status as CoStatus) ?? "Pending Client Signature",
        }}
        initialFlags={co.reviewFlags}
        source={{
          source: co.source,
          sourceUrl: co.sourceUrl,
          sourceReceivedAt: co.sourceReceivedAt,
        }}
      />
    </main>
  );
}
