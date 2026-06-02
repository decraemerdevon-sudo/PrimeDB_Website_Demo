// Shared domain types for the Change Order Management System.

export const APPROVAL_STATUSES = ["Verbal", "Written", "Pending", "None"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// Lifecycle status of a change order. V1 keeps this intentionally small.
export const CO_STATUSES = ["Pending Client Signature", "Signed"] as const;
export type CoStatus = (typeof CO_STATUSES)[number];

// Where a change order came from.
export const CO_SOURCES = ["manual", "email", "voicemail"] as const;
export type CoSource = (typeof CO_SOURCES)[number];

// Review state. Auto-ingested COs start as "needs_review"; manual ones are confirmed.
export const REVIEW_STATUSES = ["needs_review", "confirmed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// Fields the parser can flag as missing or uncertain, so the UI can highlight them.
export const FLAGGABLE_FIELDS = [
  "projectName",
  "scopeDescription",
  "costAmount",
  "approvalStatus",
  "initiator",
  "requestDate",
] as const;
export type FlaggableField = (typeof FLAGGABLE_FIELDS)[number];

export interface ReviewFlag {
  field: FlaggableField;
  note: string;
}

// The structured object the AI parser extracts from a messy CO description.
export interface ParsedChangeOrder {
  projectName: string;
  scopeDescription: string;
  costAmount: number | null;
  approvalStatus: ApprovalStatus;
  initiator: string | null;
  requestDate: string | null; // ISO yyyy-mm-dd
  reviewFlags: ReviewFlag[];
}

export interface Project {
  id: number;
  name: string;
  clientName: string | null;
  clientEmail: string | null;
  location: string | null;
}

export interface ChangeOrder {
  id: number;
  coNumber: string | null;
  projectId: number | null;
  projectName: string;
  scopeDescription: string;
  costAmount: number | null;
  status: string;
  approvalStatus: ApprovalStatus;
  initiator: string | null;
  requestDate: string | null;
  rawInput: string | null;
  clientApprovalDate: string | null;
  createdAt: string;
  // Provenance + review.
  source: CoSource;
  sourceUrl: string | null;
  sourceReceivedAt: string | null;
  sourceExternalId: string | null;
  reviewStatus: ReviewStatus;
  reviewFlags: ReviewFlag[];
}

// Fields needed to create a change order (after the user reviews the parse).
export interface NewChangeOrderInput {
  projectId: number | null;
  projectName: string;
  scopeDescription: string;
  costAmount: number | null;
  approvalStatus: ApprovalStatus;
  initiator: string | null;
  requestDate: string | null;
  status: CoStatus;
  rawInput: string | null;
  // Optional provenance (defaults to a confirmed manual entry).
  source?: CoSource;
  sourceUrl?: string | null;
  sourceReceivedAt?: string | null;
  sourceExternalId?: string | null;
  reviewStatus?: ReviewStatus;
  reviewFlags?: ReviewFlag[];
}

// ---- Cost database (rate catalog + historical reference) ----

export interface CostMaterial {
  id: number;
  itemId: string | null;
  category: string | null;
  subCategory: string | null;
  description: string;
  unit: string | null;
  unitCost: number | null;
  notes: string | null;
}

export interface CostLabour {
  id: number;
  tradeId: string | null;
  trade: string | null;
  classification: string | null;
  rateType: string | null;
  rate: number | null;
  otRate: number | null;
  notes: string | null;
}

export interface CostEquipment {
  id: number;
  equipId: string | null;
  category: string | null;
  description: string;
  rateType: string | null;
  rate: number | null;
  notes: string | null;
}

export interface HistoricalChangeOrder {
  id: number;
  coRef: string | null;
  project: string | null;
  description: string;
  category: string | null;
  labourHours: number | null;
  labourCost: number | null;
  materialCost: number | null;
  equipmentCost: number | null;
  markupPct: number | null;
  totalValue: number | null;
  status: string | null;
  notes: string | null;
}
