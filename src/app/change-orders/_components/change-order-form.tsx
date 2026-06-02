"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveChangeOrderAction,
  createChangeOrderAction,
  generateEstimateAction,
  parseAction,
} from "@/lib/actions";
import { formatCurrency } from "@/lib/format";
import {
  APPROVAL_STATUSES,
  CO_STATUSES,
  type ApprovalStatus,
  type CoStatus,
  type Estimate,
  type FlaggableField,
  type Project,
  type ReviewFlag,
} from "@/lib/types";

const EXAMPLE =
  "Client wants to upgrade the windows on the east side of the Maple Ridge Warehouse. We quoted 28 grand. They approved it verbally on the phone yesterday.";

const inputBase =
  "mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1";
const inputNormal =
  "border-zinc-300 focus:border-[#0F2942] focus:ring-[#0F2942]";
const inputFlagged =
  "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500";
const labelClass = "block text-sm font-medium text-zinc-700";

export interface FormInitial {
  projectId: number | null;
  projectName: string;
  scopeDescription: string;
  costAmount: number | null;
  clientQuotedAmount: number | null;
  estimatedAmount: number | null;
  estimatedBreakdown: Estimate | null;
  markupPct: number | null;
  approvalStatus: ApprovalStatus;
  initiator: string | null;
  requestDate: string | null;
  status: CoStatus;
}

interface Props {
  projects: Project[];
  mode: "create" | "review";
  coId?: number;
  initial?: FormInitial;
  initialFlags?: ReviewFlag[];
  source?: {
    source: string;
    sourceUrl: string | null;
    sourceReceivedAt: string | null;
  };
  rawInput?: string | null;
}

export function ChangeOrderForm({
  projects,
  mode,
  coId,
  initial,
  initialFlags = [],
  source,
}: Props) {
  const [rawInput, setRawInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(mode === "review");
  const [formError, setFormError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>(
    initial?.projectId != null ? String(initial.projectId) : "",
  );
  const [projectName, setProjectName] = useState(initial?.projectName ?? "");
  const [scopeDescription, setScopeDescription] = useState(
    initial?.scopeDescription ?? "",
  );
  const [costAmount, setCostAmount] = useState(
    initial?.costAmount != null ? String(initial.costAmount) : "",
  );
  const [clientQuoted, setClientQuoted] = useState(
    initial?.clientQuotedAmount != null ? String(initial.clientQuotedAmount) : "",
  );
  const [estimatedAmount, setEstimatedAmount] = useState(
    initial?.estimatedAmount != null ? String(initial.estimatedAmount) : "",
  );
  const [estimate, setEstimate] = useState<Estimate | null>(
    initial?.estimatedBreakdown ?? null,
  );
  const [markupPct, setMarkupPct] = useState<number | null>(
    initial?.markupPct ?? null,
  );
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [isEstimating, startEstimate] = useTransition();
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(
    initial?.approvalStatus ?? "None",
  );
  const [initiator, setInitiator] = useState(initial?.initiator ?? "");
  const [requestDate, setRequestDate] = useState(initial?.requestDate ?? "");
  const [status, setStatus] = useState<CoStatus>(
    initial?.status ?? "Pending Client Signature",
  );

  // field -> note for fields the parser/reviewer flagged.
  const [flags, setFlags] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialFlags.map((f) => [f.field, f.note])),
  );

  const [isParsing, startParse] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const flagList = useMemo(() => Object.entries(flags), [flags]);

  const quotedNum = clientQuoted.trim() === "" ? null : Number(clientQuoted);
  const estNum = estimatedAmount.trim() === "" ? null : Number(estimatedAmount);
  const variance =
    quotedNum != null &&
    estNum != null &&
    !Number.isNaN(quotedNum) &&
    !Number.isNaN(estNum)
      ? quotedNum - estNum
      : null;

  function matchProject(name: string): Project | undefined {
    const n = name.trim().toLowerCase();
    if (!n) return undefined;
    return projects.find(
      (p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()),
    );
  }

  function clearFlag(field: FlaggableField) {
    setFlags((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function fieldClass(field: FlaggableField) {
    return `${inputBase} ${field in flags ? inputFlagged : inputNormal}`;
  }

  function flagNote(field: FlaggableField) {
    if (!(field in flags)) return null;
    return (
      <p className="mt-1 text-xs font-medium text-amber-700">⚠ {flags[field]}</p>
    );
  }

  function handleParse() {
    setParseError(null);
    startParse(async () => {
      const result = await parseAction(rawInput);
      if (!result.ok) {
        setParseError(result.error);
        setShowReview(true);
        return;
      }
      const d = result.data;
      const matched = matchProject(d.projectName);
      setProjectId(matched ? String(matched.id) : "");
      setProjectName(matched ? matched.name : d.projectName);
      setScopeDescription(d.scopeDescription);
      // The parsed number is what the client quoted; default the final value to it too.
      setClientQuoted(d.costAmount == null ? "" : String(d.costAmount));
      setCostAmount(d.costAmount == null ? "" : String(d.costAmount));
      setApprovalStatus(d.approvalStatus);
      setInitiator(d.initiator ?? "");
      setRequestDate(d.requestDate ?? "");
      setStatus("Pending Client Signature");
      setFlags(Object.fromEntries(d.reviewFlags.map((f) => [f.field, f.note])));
      setShowReview(true);
    });
  }

  function handleGenerateEstimate() {
    setEstimateError(null);
    startEstimate(async () => {
      const result = await generateEstimateAction(scopeDescription);
      if (!result.ok) {
        setEstimateError(result.error);
        return;
      }
      setEstimate(result.estimate);
      setEstimatedAmount(String(result.estimate.total));
      setMarkupPct(result.estimate.markupPct);
    });
  }

  function handleProjectChange(value: string) {
    setProjectId(value);
    clearFlag("projectName");
    if (value) {
      const p = projects.find((proj) => String(proj.id) === value);
      if (p) setProjectName(p.name);
    }
  }

  function handleSubmit() {
    setFormError(null);
    if (!projectName.trim()) {
      setFormError("Project name is required.");
      return;
    }
    if (!scopeDescription.trim()) {
      setFormError("Scope of work is required.");
      return;
    }
    const cost = costAmount.trim() === "" ? null : Number(costAmount);
    const quoted = clientQuoted.trim() === "" ? null : Number(clientQuoted);
    const estTotal = estimatedAmount.trim() === "" ? null : Number(estimatedAmount);
    if (
      [cost, quoted, estTotal].some((v) => v != null && Number.isNaN(v))
    ) {
      setFormError("Amounts must be numbers.");
      return;
    }
    const input = {
      projectId: projectId ? Number(projectId) : null,
      projectName: projectName.trim(),
      scopeDescription: scopeDescription.trim(),
      costAmount: cost,
      clientQuotedAmount: quoted,
      estimatedAmount: estTotal,
      estimatedBreakdown: estimate,
      markupPct,
      approvalStatus,
      initiator: initiator.trim() || null,
      requestDate: requestDate || null,
      status,
      rawInput: null,
    };
    startSubmit(async () => {
      if (mode === "review" && coId != null) {
        await approveChangeOrderAction(coId, input);
      } else {
        await createChangeOrderAction(input);
      }
    });
  }

  return (
    <div className="space-y-6">
      {mode === "create" && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <label htmlFor="raw" className={labelClass}>
            Describe the change order
          </label>
          <textarea
            id="raw"
            rows={4}
            className={`${inputBase} ${inputNormal}`}
            placeholder={EXAMPLE}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={isParsing || !rawInput.trim()}
              className="rounded-md bg-[#0F2942] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b3d5e] disabled:opacity-50"
            >
              {isParsing ? "Parsing…" : "Parse with AI"}
            </button>
            <button
              type="button"
              onClick={() => setShowReview(true)}
              className="text-sm text-zinc-500 hover:underline"
            >
              Skip AI — fill in manually
            </button>
            <button
              type="button"
              onClick={() => setRawInput(EXAMPLE)}
              className="text-sm text-zinc-400 hover:underline"
            >
              Use example
            </button>
          </div>
          {parseError && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {parseError}
            </p>
          )}
        </section>
      )}

      {mode === "review" && source && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Imported from <span className="font-semibold">{source.source}</span>
              {source.sourceReceivedAt
                ? ` · received ${new Date(source.sourceReceivedAt).toLocaleString("en-CA")}`
                : ""}
            </span>
            {source.sourceUrl && (
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                View original
              </a>
            )}
          </div>
        </section>
      )}

      {showReview && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Review &amp; edit
          </h2>

          {flagList.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span className="font-semibold">Please confirm:</span>{" "}
              {flagList.map(([, note]) => note).join(" · ")}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="project" className={labelClass}>
                Project
              </label>
              <select
                id="project"
                className={fieldClass("projectName")}
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
              >
                <option value="">— Not in list —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="projectName" className={labelClass}>
                Project name
              </label>
              <input
                id="projectName"
                className={fieldClass("projectName")}
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  if (e.target.value.trim()) clearFlag("projectName");
                }}
              />
              {flagNote("projectName")}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="scope" className={labelClass}>
              Scope of work
            </label>
            <textarea
              id="scope"
              rows={3}
              className={fieldClass("scopeDescription")}
              value={scopeDescription}
              onChange={(e) => {
                setScopeDescription(e.target.value);
                if (e.target.value.trim()) clearFlag("scopeDescription");
              }}
            />
            {flagNote("scopeDescription")}
          </div>

          {/* Pricing & internal estimate */}
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#0F2942]">
                Pricing &amp; estimate
              </h3>
              <button
                type="button"
                onClick={handleGenerateEstimate}
                disabled={isEstimating || !scopeDescription.trim()}
                className="rounded-md bg-[#0F2942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1b3d5e] disabled:opacity-50"
              >
                {isEstimating
                  ? "Estimating…"
                  : estimate
                    ? "Re-generate estimate"
                    : "Generate estimate from cost database"}
              </button>
            </div>
            {estimateError && (
              <p className="mt-2 text-xs text-amber-700">{estimateError}</p>
            )}

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="clientQuoted" className={labelClass}>
                  Client quoted $
                </label>
                <input
                  id="clientQuoted"
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${inputBase} ${inputNormal}`}
                  value={clientQuoted}
                  onChange={(e) => setClientQuoted(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="estimatedAmount" className={labelClass}>
                  Our estimate $
                </label>
                <input
                  id="estimatedAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${inputBase} ${inputNormal}`}
                  value={estimatedAmount}
                  onChange={(e) => setEstimatedAmount(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="cost" className={labelClass}>
                  Final CO amount $
                </label>
                <input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  className={fieldClass("costAmount")}
                  value={costAmount}
                  onChange={(e) => {
                    setCostAmount(e.target.value);
                    if (e.target.value.trim()) clearFlag("costAmount");
                  }}
                />
                {flagNote("costAmount")}
              </div>
            </div>

            {variance != null && (
              <p
                className={`mt-2 text-xs font-medium ${variance < 0 ? "text-red-700" : "text-green-700"}`}
              >
                {variance < 0
                  ? `Estimate exceeds client price by ${formatCurrency(-variance)}`
                  : `Margin vs client price: ${formatCurrency(variance)}`}
              </p>
            )}

            {estimate && (
              <div className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-zinc-50 text-left text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">Item</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                      <th className="px-2 py-1 text-right">Unit $</th>
                      <th className="px-2 py-1 text-right">Line $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {estimate.lineItems.map((li, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 capitalize">{li.type}</td>
                        <td className="px-2 py-1">
                          {li.description}
                          {li.ref ? ` (${li.ref})` : ""}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {li.quantity}
                          {li.unit ? ` ${li.unit}` : ""}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {formatCurrency(li.unitCost)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {formatCurrency(li.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-zinc-200 text-zinc-700">
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-right">
                        Subtotal
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(estimate.subtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-right">
                        Markup ({estimate.markupPct}%)
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(estimate.markupAmount)}
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-2 py-1 text-right">
                        Total
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(estimate.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {estimate.notes && (
                  <p className="px-2 py-2 text-xs text-zinc-500">{estimate.notes}</p>
                )}
              </div>
            )}

            <p className="mt-2 text-xs text-zinc-400">
              The estimate is internal — it isn’t shown on the client change-order
              document.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="initiator" className={labelClass}>
                Requested by
              </label>
              <input
                id="initiator"
                className={fieldClass("initiator")}
                value={initiator}
                onChange={(e) => {
                  setInitiator(e.target.value);
                  if (e.target.value.trim()) clearFlag("initiator");
                }}
              />
              {flagNote("initiator")}
            </div>
            <div>
              <label htmlFor="approval" className={labelClass}>
                Approval status
              </label>
              <select
                id="approval"
                className={fieldClass("approvalStatus")}
                value={approvalStatus}
                onChange={(e) => {
                  setApprovalStatus(e.target.value as ApprovalStatus);
                  clearFlag("approvalStatus");
                }}
              >
                {APPROVAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {flagNote("approvalStatus")}
            </div>
            <div>
              <label htmlFor="requestDate" className={labelClass}>
                Request date
              </label>
              <input
                id="requestDate"
                type="date"
                className={fieldClass("requestDate")}
                value={requestDate}
                onChange={(e) => {
                  setRequestDate(e.target.value);
                  if (e.target.value) clearFlag("requestDate");
                }}
              />
              {flagNote("requestDate")}
            </div>
            <div>
              <label htmlFor="status" className={labelClass}>
                Change order status
              </label>
              <select
                id="status"
                className={`${inputBase} ${inputNormal}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as CoStatus)}
              >
                {CO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-md bg-[#B45309] px-4 py-2 text-sm font-medium text-white hover:bg-[#92400e] disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving…"
                : mode === "review"
                  ? "Approve Change Order"
                  : "Create Change Order"}
            </button>
            <span className="text-xs text-zinc-400">
              {mode === "review"
                ? "Approving confirms the details and clears it from the review queue."
                : "Saved as “Pending Client Signature” by default."}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
