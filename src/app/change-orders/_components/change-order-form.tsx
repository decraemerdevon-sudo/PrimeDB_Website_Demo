"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveChangeOrderAction,
  createChangeOrderAction,
  parseAction,
} from "@/lib/actions";
import {
  APPROVAL_STATUSES,
  CO_STATUSES,
  type ApprovalStatus,
  type CoStatus,
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
      setCostAmount(d.costAmount == null ? "" : String(d.costAmount));
      setApprovalStatus(d.approvalStatus);
      setInitiator(d.initiator ?? "");
      setRequestDate(d.requestDate ?? "");
      setStatus("Pending Client Signature");
      setFlags(Object.fromEntries(d.reviewFlags.map((f) => [f.field, f.note])));
      setShowReview(true);
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
    if (cost != null && Number.isNaN(cost)) {
      setFormError("Cost must be a number.");
      return;
    }
    const input = {
      projectId: projectId ? Number(projectId) : null,
      projectName: projectName.trim(),
      scopeDescription: scopeDescription.trim(),
      costAmount: cost,
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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cost" className={labelClass}>
                Cost amount (CAD)
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
