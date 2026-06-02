import Link from "next/link";
import { CheckEmailButton } from "@/app/_components/check-email-button";
import {
  hasDatabase,
  listConfirmedChangeOrders,
  listNeedsReviewChangeOrders,
  listProjects,
} from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ChangeOrder, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const signed = status.toLowerCase().includes("signed");
  const cls = signed
    ? "bg-green-100 text-green-800 ring-green-600/20"
    : "bg-amber-100 text-amber-800 ring-amber-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}

function SourceLabel({ source }: { source: string }) {
  if (source === "manual") return <span className="text-zinc-400">Manual</span>;
  return <span className="capitalize text-zinc-600">{source}</span>;
}

function SetupNotice() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
      <h2 className="text-lg font-semibold">Connect a database to get started</h2>
      <p className="mt-2 text-sm leading-6">
        No database is configured yet. In your Vercel project, open the{" "}
        <span className="font-medium">Storage</span> tab, create a{" "}
        <span className="font-medium">Postgres (Neon)</span> database, and connect
        it to this project. Vercel will set the{" "}
        <code className="rounded bg-amber-100 px-1">DATABASE_URL</code> environment
        variable automatically.
      </p>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; created?: string }>;
}) {
  const sp = await searchParams;

  if (!hasDatabase()) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader />
        <SetupNotice />
      </main>
    );
  }

  const projectId = sp.project ? Number(sp.project) : undefined;

  let projects: Project[] = [];
  let confirmed: ChangeOrder[] = [];
  let needsReview: ChangeOrder[] = [];
  let loadError: string | null = null;
  try {
    [projects, confirmed, needsReview] = await Promise.all([
      listProjects(),
      listConfirmedChangeOrders(Number.isInteger(projectId) ? projectId : undefined),
      listNeedsReviewChangeOrders(),
    ]);
  } catch (err) {
    console.error("Failed to load dashboard:", err);
    loadError =
      "Couldn't reach the database. Check that DATABASE_URL is set correctly and the database is reachable.";
  }

  const created = sp.created
    ? confirmed.find((c) => c.id === Number(sp.created))
    : undefined;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader />

      {created && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          <span>
            Saved <span className="font-semibold">{created.coNumber}</span> —{" "}
            {created.projectName}.
          </span>
          <a
            href={`/api/change-orders/${created.id}/document`}
            className="rounded-md bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800"
          >
            Download .docx
          </a>
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-800">
          {loadError}
        </div>
      ) : (
        <>
          {/* Needs Review queue */}
          {needsReview.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
                Needs Review
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white">
                  {needsReview.length}
                </span>
              </h2>
              <div className="space-y-3">
                {needsReview.map((co) => (
                  <div
                    key={co.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-medium text-[#0F2942]">
                          {co.coNumber}
                        </span>
                        <span className="text-zinc-700">{co.projectName}</span>
                        <span className="text-zinc-400">·</span>
                        <SourceLabel source={co.source} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-zinc-600">
                        {co.scopeDescription}
                      </p>
                      {co.reviewFlags.length > 0 && (
                        <p className="mt-0.5 text-xs font-medium text-amber-700">
                          {co.reviewFlags.length} field
                          {co.reviewFlags.length === 1 ? "" : "s"} to confirm
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {formatCurrency(co.costAmount)}
                      </span>
                      <Link
                        href={`/change-orders/${co.id}/review`}
                        className="rounded-md bg-[#B45309] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#92400e]"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Project filter */}
          <div className="mb-5 flex flex-wrap gap-2">
            <FilterPill label="All projects" href="/" active={!projectId} />
            {projects.map((p) => (
              <FilterPill
                key={p.id}
                label={p.name}
                href={`/?project=${p.id}`}
                active={projectId === p.id}
              />
            ))}
          </div>

          {confirmed.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
              <p className="text-zinc-600">No change orders yet.</p>
              <Link
                href="/change-orders/new"
                className="mt-3 inline-block rounded-md bg-[#0F2942] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b3d5e]"
              >
                Create your first change order
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">CO #</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {confirmed.map((co) => (
                    <tr key={co.id} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-[#0F2942]">
                        {co.coNumber}
                      </td>
                      <td className="px-4 py-3">{co.projectName}</td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-zinc-600"
                        title={co.scopeDescription}
                      >
                        {co.scopeDescription}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        {formatCurrency(co.costAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={co.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <SourceLabel source={co.source} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                        {formatDate(co.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <a
                          href={`/api/change-orders/${co.id}/document`}
                          className="font-medium text-[#B45309] hover:underline"
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function PageHeader() {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F2942]">
          Change Orders
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Turn messy requests into formal, tracked change orders.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <CheckEmailButton />
        <Link
          href="/change-orders/new"
          className="rounded-md bg-[#0F2942] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b3d5e]"
        >
          + New Change Order
        </Link>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
        active
          ? "bg-[#0F2942] text-white ring-[#0F2942]"
          : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {label}
    </Link>
  );
}
