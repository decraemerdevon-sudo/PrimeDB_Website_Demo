"use client";

import { useState, useTransition } from "react";
import { createChangeOrderAction, parseAction } from "@/lib/actions";
import {
  APPROVAL_STATUSES,
  CO_STATUSES,
  type ApprovalStatus,
  type CoStatus,
  type Project,
} from "@/lib/types";

const EXAMPLE =
  "Client wants to upgrade the windows on the east side of the Maple Ridge Warehouse. We quoted 28 grand. They approved it verbally on the phone yesterday.";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-[#0F2942] focus:outline-none focus:ring-1 focus:ring-[#0F2942]";
const labelClass = "block text-sm font-medium text-zinc-700";

export function NewChangeOrderForm({ projects }: { projects: Project[] }) {
  const [rawInput, setRawInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reviewed/editable fields.
  const [projectId, setProjectId] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("None");
  const [initiator, setInitiator] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const [status, setStatus] = useState<CoStatus>("Pending Client Signature");

  const [isParsing, startParse] = useTransition();
  const [isCreating, startCreate] = useTransition();

  function matchProject(name: string): Project | undefined {
    const n = name.trim().toLowerCase();
    if (!n) return undefined;
    return projects.find(
      (p) =>
        p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()),
    );
  }

  function handleParse() {
    setParseError(null);
    startParse(async () => {
      const result = await parseAction(rawInput);
      if (!result.ok) {
        setParseError(result.error);
        setShowReview(true); // let them fill it in manually
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
      setShowReview(true);
    });
  }

  function handleProjectChange(value: string) {
    setProjectId(value);
    if (value) {
      const p = projects.find((proj) => String(proj.id) === value);
      if (p) setProjectName(p.name);
    }
  }

  function handleCreate() {
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
    startCreate(async () => {
      await createChangeOrderAction({
        projectId: projectId ? Number(projectId) : null,
        projectName: projectName.trim(),
        scopeDescription: scopeDescription.trim(),
        costAmount: cost,
        approvalStatus,
        initiator: initiator.trim() || null,
        requestDate: requestDate || null,
        status,
        rawInput: rawInput.trim() || null,
      });
    });
  }

  return (
    <div className="space-y-6">
      {/* Step 1: raw input */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <label htmlFor="raw" className={labelClass}>
          Describe the change order
        </label>
        <textarea
          id="raw"
          rows={4}
          className={inputClass}
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

      {/* Step 2: review */}
      {showReview && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Review &amp; edit
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="project" className={labelClass}>
                Project
              </label>
              <select
                id="project"
                className={inputClass}
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
                className={inputClass}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="scope" className={labelClass}>
              Scope of work
            </label>
            <textarea
              id="scope"
              rows={3}
              className={inputClass}
              value={scopeDescription}
              onChange={(e) => setScopeDescription(e.target.value)}
            />
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
                className={inputClass}
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="initiator" className={labelClass}>
                Requested by
              </label>
              <input
                id="initiator"
                className={inputClass}
                value={initiator}
                onChange={(e) => setInitiator(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="approval" className={labelClass}>
                Approval status
              </label>
              <select
                id="approval"
                className={inputClass}
                value={approvalStatus}
                onChange={(e) => setApprovalStatus(e.target.value as ApprovalStatus)}
              >
                {APPROVAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="requestDate" className={labelClass}>
                Request date
              </label>
              <input
                id="requestDate"
                type="date"
                className={inputClass}
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="status" className={labelClass}>
                Change order status
              </label>
              <select
                id="status"
                className={inputClass}
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
              onClick={handleCreate}
              disabled={isCreating}
              className="rounded-md bg-[#B45309] px-4 py-2 text-sm font-medium text-white hover:bg-[#92400e] disabled:opacity-50"
            >
              {isCreating ? "Creating…" : "Create Change Order"}
            </button>
            <span className="text-xs text-zinc-400">
              Saved as “Pending Client Signature” by default.
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
