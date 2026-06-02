import Link from "next/link";
import {
  hasDatabase,
  listCostEquipment,
  listCostLabour,
  listCostMaterials,
  listHistoricalChangeOrders,
} from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-semibold">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[#0F2942]">
        {title}
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {count}
        </span>
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          {children}
        </table>
      </div>
    </section>
  );
}

export default async function CostDatabasePage() {
  if (!hasDatabase()) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-[#0F2942]">
          Cost Database
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Connect a database to load the rate catalog.
        </p>
      </main>
    );
  }

  const [materials, labour, equipment, historical] = await Promise.all([
    listCostMaterials(),
    listCostLabour(),
    listCostEquipment(),
    listHistoricalChangeOrders(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F2942]">
          Cost Database
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          The rate catalog and historical change orders used to build estimates.
        </p>
      </div>

      <Section title="Materials" count={materials.length}>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <Th>ID</Th>
            <Th>Category</Th>
            <Th>Description</Th>
            <Th>Unit</Th>
            <Th>Unit cost</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {materials.map((m) => (
            <tr key={m.id}>
              <Td>{m.itemId}</Td>
              <Td>
                {m.category}
                {m.subCategory ? ` · ${m.subCategory}` : ""}
              </Td>
              <Td>{m.description}</Td>
              <Td>{m.unit}</Td>
              <Td>{formatCurrency(m.unitCost)}</Td>
            </tr>
          ))}
        </tbody>
      </Section>

      <Section title="Labour Rates" count={labour.length}>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <Th>ID</Th>
            <Th>Trade</Th>
            <Th>Classification</Th>
            <Th>Rate /hr</Th>
            <Th>OT /hr</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {labour.map((l) => (
            <tr key={l.id}>
              <Td>{l.tradeId}</Td>
              <Td>{l.trade}</Td>
              <Td>{l.classification}</Td>
              <Td>{formatCurrency(l.rate)}</Td>
              <Td>{formatCurrency(l.otRate)}</Td>
            </tr>
          ))}
        </tbody>
      </Section>

      <Section title="Equipment & Rentals" count={equipment.length}>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <Th>ID</Th>
            <Th>Category</Th>
            <Th>Description</Th>
            <Th>Rate type</Th>
            <Th>Rate</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {equipment.map((e) => (
            <tr key={e.id}>
              <Td>{e.equipId}</Td>
              <Td>{e.category}</Td>
              <Td>{e.description}</Td>
              <Td>{e.rateType}</Td>
              <Td>{formatCurrency(e.rate)}</Td>
            </tr>
          ))}
        </tbody>
      </Section>

      <Section title="Historical Change Orders" count={historical.length}>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <Th>Ref</Th>
            <Th>Description</Th>
            <Th>Category</Th>
            <Th>Markup</Th>
            <Th>Total</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {historical.map((h) => (
            <tr key={h.id}>
              <Td>{h.coRef}</Td>
              <Td>{h.description}</Td>
              <Td>{h.category}</Td>
              <Td>{h.markupPct == null ? "—" : `${h.markupPct}%`}</Td>
              <Td>{formatCurrency(h.totalValue)}</Td>
            </tr>
          ))}
        </tbody>
      </Section>
    </main>
  );
}
