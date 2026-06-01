import { buildChangeOrderDocx } from "@/lib/co-document";
import { getChangeOrder } from "@/lib/db";

// Always run at request time (DB access + dynamic id).
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return new Response("Invalid change order id.", { status: 400 });
  }

  const co = await getChangeOrder(numericId);
  if (!co) {
    return new Response("Change order not found.", { status: 404 });
  }

  const buffer = await buildChangeOrderDocx(co);
  const filename = `${co.coNumber ?? `change-order-${co.id}`}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
