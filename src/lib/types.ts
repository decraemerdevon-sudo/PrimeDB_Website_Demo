// Shared domain types for the Change Order Management System.

export const APPROVAL_STATUSES = ["Verbal", "Written", "Pending", "None"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// Lifecycle status of a change order. V1 keeps this intentionally small.
export const CO_STATUSES = ["Pending Client Signature", "Signed"] as const;
export type CoStatus = (typeof CO_STATUSES)[number];

// The structured object the AI parser extracts from a messy CO description.
export interface ParsedChangeOrder {
  projectName: string;
  scopeDescription: string;
  costAmount: number | null;
  approvalStatus: ApprovalStatus;
  initiator: string | null;
  requestDate: string | null; // ISO yyyy-mm-dd
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
  initiator: string | null;
  requestDate: string | null;
  rawInput: string | null;
  clientApprovalDate: string | null;
  createdAt: string;
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
}
