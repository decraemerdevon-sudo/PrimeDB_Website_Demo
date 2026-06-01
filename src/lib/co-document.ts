import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ChangeOrder } from "./types";

const COMPANY = {
  name: "Prime Design Build Corporation",
  address: "241 Applewood Crescent, Unit 10, Vaughan, ON L4K 4E6",
  phone: "905-532-0650",
};

const NAVY = "0F2942";
const AMBER = "B45309";
const GREY = "64748B";
const LIGHT = "F1F5F9";

const FONT = "Calibri";

function currency(amount: number | null): string {
  if (amount == null) return "TBD";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function run(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text, font: FONT, ...opts });
}

function labelCell(text: string) {
  return new TableCell({
    width: { size: 28, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [run(text, { bold: true, size: 19, color: NAVY })] })],
  });
}

function valueCell(text: string) {
  return new TableCell({
    width: { size: 72, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [run(text, { size: 19 })] })],
  });
}

function detailRow(label: string, value: string) {
  return new TableRow({ children: [labelCell(label), valueCell(value)] });
}

const STANDARD_TERMS = [
  "This Change Order modifies the original contract for the project named above. All other terms and conditions of the original contract remain in full force and effect.",
  "The Change Order Amount stated above is valid for thirty (30) days from the date of issue.",
  "Work described in this Change Order will not proceed until this document is signed and returned by the Client.",
  "Any impact to the project schedule resulting from this change will be communicated separately and is not waived by execution of this Change Order.",
  "The Change Order Amount is in addition to the original contract value and any previously approved change orders.",
];

function signatureBlock(role: string) {
  return [
    new Paragraph({ spacing: { before: 360 }, children: [run("X ______________________________", { color: GREY })] }),
    new Paragraph({ spacing: { before: 20 }, children: [run(role, { bold: true, size: 18, color: NAVY })] }),
    new Paragraph({ children: [run("Name: ______________________________", { size: 18 })] }),
    new Paragraph({ children: [run("Date: ______________________________", { size: 18 })] }),
  ];
}

export async function buildChangeOrderDocx(co: ChangeOrder): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21, color: "1F2937" } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children: [
          // Company header
          new Paragraph({
            spacing: { after: 20 },
            children: [run(COMPANY.name, { bold: true, size: 30, color: NAVY })],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [run(`${COMPANY.address}  •  Tel: ${COMPANY.phone}`, { size: 16, color: GREY })],
          }),

          // Title
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            border: { bottom: { color: AMBER, style: BorderStyle.SINGLE, size: 12, space: 4 } },
            spacing: { after: 160 },
            children: [
              run("CHANGE ORDER", { bold: true, size: 32, color: NAVY }),
              run(`     ${co.coNumber ?? ""}`, { bold: true, size: 24, color: AMBER }),
            ],
          }),

          // Detail table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              detailRow("Project", co.projectName),
              detailRow("Change Order No.", co.coNumber ?? "—"),
              detailRow("Date Issued", formatDate(co.createdAt)),
              detailRow("Requested By", co.initiator ?? "—"),
              detailRow("Request Date", formatDate(co.requestDate)),
              detailRow("Status", co.status),
            ],
          }),

          // Scope of work
          new Paragraph({
            spacing: { before: 280, after: 80 },
            children: [run("Scope of Work", { bold: true, size: 24, color: NAVY })],
          }),
          new Paragraph({ children: [run(co.scopeDescription)] }),

          // Cost
          new Paragraph({
            spacing: { before: 240, after: 80 },
            children: [run("Change Order Amount", { bold: true, size: 24, color: NAVY })],
          }),
          new Paragraph({
            children: [
              run("Total: ", { bold: true, size: 24 }),
              run(currency(co.costAmount), { bold: true, size: 24, color: AMBER }),
              run("  (excluding applicable taxes)", { size: 16, color: GREY }),
            ],
          }),

          // Standard terms
          new Paragraph({
            spacing: { before: 280, after: 80 },
            children: [run("Standard Terms", { bold: true, size: 24, color: NAVY })],
          }),
          ...STANDARD_TERMS.map(
            (t, i) =>
              new Paragraph({
                spacing: { after: 60 },
                children: [run(`${i + 1}. `, { bold: true }), run(t, { size: 19 })],
              }),
          ),

          // Acceptance
          new Paragraph({
            spacing: { before: 320, after: 40 },
            children: [run("Acceptance", { bold: true, size: 24, color: NAVY })],
          }),
          new Paragraph({
            children: [
              run(
                "By signing below, the parties agree to the scope and amount set out in this Change Order.",
                { size: 19 },
              ),
            ],
          }),
          ...signatureBlock("Client"),
          ...signatureBlock(`Contractor — ${COMPANY.name}`),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
