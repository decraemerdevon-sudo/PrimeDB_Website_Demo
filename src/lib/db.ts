import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import costData from "./cost-data.json";
import type {
  ChangeOrder,
  CostEquipment,
  CostLabour,
  CostMaterial,
  Estimate,
  HistoricalChangeOrder,
  NewChangeOrderInput,
  Project,
  ReviewFlag,
} from "./types";

// Vercel Postgres / Neon sets DATABASE_URL; the older integration uses POSTGRES_URL.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export function hasDatabase(): boolean {
  return Boolean(connectionString);
}

let sqlClient: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!connectionString) {
    throw new Error(
      "No database configured. Set DATABASE_URL (connect Vercel Postgres / Neon in the project's Storage tab).",
    );
  }
  if (!sqlClient) sqlClient = neon(connectionString);
  return sqlClient;
}

// Lazily create/upgrade the schema (and seed sample projects) once per runtime.
let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        client_name   TEXT,
        client_email  TEXT,
        location      TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS change_orders (
        id                   SERIAL PRIMARY KEY,
        co_number            TEXT UNIQUE,
        project_id           INTEGER REFERENCES projects(id),
        project_name         TEXT NOT NULL,
        scope_description    TEXT NOT NULL,
        cost_amount          NUMERIC,
        status               TEXT NOT NULL DEFAULT 'Pending Client Signature',
        approval_status      TEXT,
        initiator            TEXT,
        request_date         DATE,
        raw_input            TEXT,
        client_approval_date DATE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        source               TEXT NOT NULL DEFAULT 'manual',
        source_url           TEXT,
        source_received_at   TIMESTAMPTZ,
        source_external_id   TEXT,
        review_status        TEXT NOT NULL DEFAULT 'confirmed',
        review_flags         JSONB NOT NULL DEFAULT '[]'::jsonb,
        client_quoted_amount NUMERIC,
        estimated_amount     NUMERIC,
        estimated_breakdown  JSONB,
        markup_pct           NUMERIC
      )
    `;
    // Upgrade existing tables created before these columns existed.
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS approval_status TEXT`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS source_url TEXT`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS source_received_at TIMESTAMPTZ`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS source_external_id TEXT`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'confirmed'`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS review_flags JSONB NOT NULL DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_quoted_amount NUMERIC`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS estimated_amount NUMERIC`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS estimated_breakdown JSONB`;
    await sql`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS markup_pct NUMERIC`;

    // Cost database: rate catalog + historical reference for the estimator.
    await sql`
      CREATE TABLE IF NOT EXISTS cost_materials (
        id           SERIAL PRIMARY KEY,
        item_id      TEXT,
        category     TEXT,
        sub_category TEXT,
        description  TEXT NOT NULL,
        unit         TEXT,
        unit_cost    NUMERIC,
        notes        TEXT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS cost_labour (
        id             SERIAL PRIMARY KEY,
        trade_id       TEXT,
        trade          TEXT,
        classification TEXT,
        rate_type      TEXT,
        rate           NUMERIC,
        ot_rate        NUMERIC,
        notes          TEXT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS cost_equipment (
        id          SERIAL PRIMARY KEY,
        equip_id    TEXT,
        category    TEXT,
        description TEXT NOT NULL,
        rate_type   TEXT,
        rate        NUMERIC,
        notes       TEXT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS historical_change_orders (
        id             SERIAL PRIMARY KEY,
        co_ref         TEXT,
        project        TEXT,
        description    TEXT NOT NULL,
        category       TEXT,
        labour_hours   NUMERIC,
        labour_cost    NUMERIC,
        material_cost  NUMERIC,
        equipment_cost NUMERIC,
        markup_pct     NUMERIC,
        total_value    NUMERIC,
        status         TEXT,
        notes          TEXT
      )
    `;

    await seedCostDatabase(sql);

    const [{ n }] = (await sql`SELECT count(*)::int AS n FROM projects`) as {
      n: number;
    }[];
    if (n === 0) {
      // Seed a small "project master list" so the demo works out of the box.
      await sql`
        INSERT INTO projects (name, client_name, client_email, location) VALUES
          ('Maple Ridge Warehouse', 'Northgate Logistics Inc.', 'pm@northgate-logistics.example', 'Vaughan, ON'),
          ('Riverside Medical Clinic', 'Riverside Health Partners', 'facilities@riversidehealth.example', 'Markham, ON'),
          ('Oakwood Office Retrofit', 'Oakwood Capital', 'projects@oakwoodcapital.example', 'Toronto, ON'),
          ('Lakeshore Residence', 'D. & M. Bianchi', 'bianchi.family@example', 'Mississauga, ON')
      `;
    }
  })();
  return schemaReady;
}

type Row = Record<string, unknown>;

function toProject(r: Row): Project {
  return {
    id: Number(r.id),
    name: String(r.name),
    clientName: (r.client_name as string) ?? null,
    clientEmail: (r.client_email as string) ?? null,
    location: (r.location as string) ?? null,
  };
}

function parseFlags(value: unknown): ReviewFlag[] {
  if (!value) return [];
  // The driver may return jsonb already-parsed or as a string.
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(raw) ? (raw as ReviewFlag[]) : [];
}

function parseBreakdown(value: unknown): Estimate | null {
  if (!value) return null;
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  return raw && typeof raw === "object" ? (raw as Estimate) : null;
}

function toChangeOrder(r: Row): ChangeOrder {
  return {
    id: Number(r.id),
    coNumber: (r.co_number as string) ?? null,
    projectId: r.project_id == null ? null : Number(r.project_id),
    projectName: String(r.project_name),
    scopeDescription: String(r.scope_description),
    // NUMERIC comes back as a string from the driver — coerce to number.
    costAmount: r.cost_amount == null ? null : Number(r.cost_amount),
    clientQuotedAmount:
      r.client_quoted_amount == null ? null : Number(r.client_quoted_amount),
    estimatedAmount:
      r.estimated_amount == null ? null : Number(r.estimated_amount),
    estimatedBreakdown: parseBreakdown(r.estimated_breakdown),
    markupPct: r.markup_pct == null ? null : Number(r.markup_pct),
    status: String(r.status),
    approvalStatus: (r.approval_status as ChangeOrder["approvalStatus"]) ?? "None",
    initiator: (r.initiator as string) ?? null,
    requestDate: (r.request_date as string) ?? null,
    rawInput: (r.raw_input as string) ?? null,
    clientApprovalDate: (r.client_approval_date as string) ?? null,
    createdAt: String(r.created_at),
    source: (r.source as ChangeOrder["source"]) ?? "manual",
    sourceUrl: (r.source_url as string) ?? null,
    sourceReceivedAt: (r.source_received_at as string) ?? null,
    sourceExternalId: (r.source_external_id as string) ?? null,
    reviewStatus: (r.review_status as ChangeOrder["reviewStatus"]) ?? "confirmed",
    reviewFlags: parseFlags(r.review_flags),
  };
}

export async function listProjects(): Promise<Project[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM projects ORDER BY name`) as Row[];
  return rows.map(toProject);
}

// Confirmed change orders for the main dashboard table (optionally per-project).
export async function listConfirmedChangeOrders(
  projectId?: number,
): Promise<ChangeOrder[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (
    projectId
      ? await sql`SELECT * FROM change_orders WHERE review_status = 'confirmed' AND project_id = ${projectId} ORDER BY id DESC`
      : await sql`SELECT * FROM change_orders WHERE review_status = 'confirmed' ORDER BY id DESC`
  ) as Row[];
  return rows.map(toChangeOrder);
}

// Change orders awaiting human review (the "needs review" queue).
export async function listNeedsReviewChangeOrders(): Promise<ChangeOrder[]> {
  await ensureSchema();
  const sql = getSql();
  const rows =
    (await sql`SELECT * FROM change_orders WHERE review_status = 'needs_review' ORDER BY id DESC`) as Row[];
  return rows.map(toChangeOrder);
}

export async function getChangeOrder(id: number): Promise<ChangeOrder | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM change_orders WHERE id = ${id}`) as Row[];
  return rows.length ? toChangeOrder(rows[0]) : null;
}

// Used by the email ingester to avoid processing the same message twice.
export async function getChangeOrderBySourceId(
  source: string,
  externalId: string,
): Promise<ChangeOrder | null> {
  await ensureSchema();
  const sql = getSql();
  const rows =
    (await sql`SELECT * FROM change_orders WHERE source = ${source} AND source_external_id = ${externalId} LIMIT 1`) as Row[];
  return rows.length ? toChangeOrder(rows[0]) : null;
}

export async function createChangeOrder(
  input: NewChangeOrderInput,
): Promise<ChangeOrder> {
  await ensureSchema();
  const sql = getSql();

  const status = input.status;
  const approvalDate =
    status === "Signed" ? new Date().toISOString().slice(0, 10) : null;
  const source = input.source ?? "manual";
  const reviewStatus = input.reviewStatus ?? "confirmed";
  const flags = JSON.stringify(input.reviewFlags ?? []);
  const breakdown = input.estimatedBreakdown
    ? JSON.stringify(input.estimatedBreakdown)
    : null;

  const [{ id }] = (await sql`
    INSERT INTO change_orders
      (project_id, project_name, scope_description, cost_amount, status,
       approval_status, initiator, request_date, raw_input, client_approval_date,
       source, source_url, source_received_at, source_external_id,
       review_status, review_flags,
       client_quoted_amount, estimated_amount, estimated_breakdown, markup_pct)
    VALUES
      (${input.projectId}, ${input.projectName}, ${input.scopeDescription},
       ${input.costAmount}, ${status}, ${input.approvalStatus},
       ${input.initiator}, ${input.requestDate}, ${input.rawInput}, ${approvalDate},
       ${source}, ${input.sourceUrl ?? null}, ${input.sourceReceivedAt ?? null},
       ${input.sourceExternalId ?? null}, ${reviewStatus}, ${flags}::jsonb,
       ${input.clientQuotedAmount ?? null}, ${input.estimatedAmount ?? null},
       ${breakdown}::jsonb, ${input.markupPct ?? null})
    RETURNING id
  `) as { id: number }[];

  // Derive a human-readable CO number from the row id, e.g. CO-0001.
  const coNumber = `CO-${String(id).padStart(4, "0")}`;
  await sql`UPDATE change_orders SET co_number = ${coNumber} WHERE id = ${id}`;

  const created = await getChangeOrder(id);
  if (!created) throw new Error("Failed to load the change order after creation.");
  return created;
}

// Apply a reviewer's edits and mark the change order confirmed (clears flags).
export async function confirmChangeOrder(
  id: number,
  input: NewChangeOrderInput,
): Promise<ChangeOrder> {
  await ensureSchema();
  const sql = getSql();

  const status = input.status;
  const approvalDate =
    status === "Signed" ? new Date().toISOString().slice(0, 10) : null;
  const breakdown = input.estimatedBreakdown
    ? JSON.stringify(input.estimatedBreakdown)
    : null;

  await sql`
    UPDATE change_orders SET
      project_id = ${input.projectId},
      project_name = ${input.projectName},
      scope_description = ${input.scopeDescription},
      cost_amount = ${input.costAmount},
      client_quoted_amount = ${input.clientQuotedAmount ?? null},
      estimated_amount = ${input.estimatedAmount ?? null},
      estimated_breakdown = ${breakdown}::jsonb,
      markup_pct = ${input.markupPct ?? null},
      status = ${status},
      approval_status = ${input.approvalStatus},
      initiator = ${input.initiator},
      request_date = ${input.requestDate},
      client_approval_date = ${approvalDate},
      review_status = 'confirmed',
      review_flags = '[]'::jsonb
    WHERE id = ${id}
  `;

  const updated = await getChangeOrder(id);
  if (!updated) throw new Error("Change order not found after confirmation.");
  return updated;
}

// ---- Cost database seeding + reads ----

async function seedCostDatabase(
  sql: NeonQueryFunction<false, false>,
): Promise<void> {
  const [{ n: nm }] = (await sql`SELECT count(*)::int AS n FROM cost_materials`) as {
    n: number;
  }[];
  if (nm === 0) {
    await sql`
      INSERT INTO cost_materials (item_id, category, sub_category, description, unit, unit_cost, notes)
      SELECT "itemId", "category", "subCategory", "description", "unit", "unitCost", "notes"
      FROM jsonb_to_recordset(${JSON.stringify(costData.materials)}::jsonb) AS x(
        "itemId" text, "category" text, "subCategory" text, "description" text,
        "unit" text, "unitCost" numeric, "notes" text
      )
    `;
  }

  const [{ n: nl }] = (await sql`SELECT count(*)::int AS n FROM cost_labour`) as {
    n: number;
  }[];
  if (nl === 0) {
    await sql`
      INSERT INTO cost_labour (trade_id, trade, classification, rate_type, rate, ot_rate, notes)
      SELECT "tradeId", "trade", "classification", "rateType", "rate", "otRate", "notes"
      FROM jsonb_to_recordset(${JSON.stringify(costData.labour)}::jsonb) AS x(
        "tradeId" text, "trade" text, "classification" text, "rateType" text,
        "rate" numeric, "otRate" numeric, "notes" text
      )
    `;
  }

  const [{ n: ne }] = (await sql`SELECT count(*)::int AS n FROM cost_equipment`) as {
    n: number;
  }[];
  if (ne === 0) {
    await sql`
      INSERT INTO cost_equipment (equip_id, category, description, rate_type, rate, notes)
      SELECT "equipId", "category", "description", "rateType", "rate", "notes"
      FROM jsonb_to_recordset(${JSON.stringify(costData.equipment)}::jsonb) AS x(
        "equipId" text, "category" text, "description" text, "rateType" text,
        "rate" numeric, "notes" text
      )
    `;
  }

  const [{ n: nh }] =
    (await sql`SELECT count(*)::int AS n FROM historical_change_orders`) as {
      n: number;
    }[];
  if (nh === 0) {
    await sql`
      INSERT INTO historical_change_orders
        (co_ref, project, description, category, labour_hours, labour_cost,
         material_cost, equipment_cost, markup_pct, total_value, status, notes)
      SELECT "coRef", "project", "description", "category", "labourHours", "labourCost",
             "materialCost", "equipmentCost", "markupPct", "totalValue", "status", "notes"
      FROM jsonb_to_recordset(${JSON.stringify(costData.historical)}::jsonb) AS x(
        "coRef" text, "project" text, "description" text, "category" text,
        "labourHours" numeric, "labourCost" numeric, "materialCost" numeric,
        "equipmentCost" numeric, "markupPct" numeric, "totalValue" numeric,
        "status" text, "notes" text
      )
    `;
  }
}

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));

export async function listCostMaterials(): Promise<CostMaterial[]> {
  await ensureSchema();
  const rows = (await getSql()`SELECT * FROM cost_materials ORDER BY item_id`) as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    itemId: strOrNull(r.item_id),
    category: strOrNull(r.category),
    subCategory: strOrNull(r.sub_category),
    description: String(r.description),
    unit: strOrNull(r.unit),
    unitCost: numOrNull(r.unit_cost),
    notes: strOrNull(r.notes),
  }));
}

export async function listCostLabour(): Promise<CostLabour[]> {
  await ensureSchema();
  const rows = (await getSql()`SELECT * FROM cost_labour ORDER BY trade_id`) as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    tradeId: strOrNull(r.trade_id),
    trade: strOrNull(r.trade),
    classification: strOrNull(r.classification),
    rateType: strOrNull(r.rate_type),
    rate: numOrNull(r.rate),
    otRate: numOrNull(r.ot_rate),
    notes: strOrNull(r.notes),
  }));
}

export async function listCostEquipment(): Promise<CostEquipment[]> {
  await ensureSchema();
  const rows = (await getSql()`SELECT * FROM cost_equipment ORDER BY equip_id`) as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    equipId: strOrNull(r.equip_id),
    category: strOrNull(r.category),
    description: String(r.description),
    rateType: strOrNull(r.rate_type),
    rate: numOrNull(r.rate),
    notes: strOrNull(r.notes),
  }));
}

export async function listHistoricalChangeOrders(): Promise<
  HistoricalChangeOrder[]
> {
  await ensureSchema();
  const rows =
    (await getSql()`SELECT * FROM historical_change_orders ORDER BY co_ref`) as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    coRef: strOrNull(r.co_ref),
    project: strOrNull(r.project),
    description: String(r.description),
    category: strOrNull(r.category),
    labourHours: numOrNull(r.labour_hours),
    labourCost: numOrNull(r.labour_cost),
    materialCost: numOrNull(r.material_cost),
    equipmentCost: numOrNull(r.equipment_cost),
    markupPct: numOrNull(r.markup_pct),
    totalValue: numOrNull(r.total_value),
    status: strOrNull(r.status),
    notes: strOrNull(r.notes),
  }));
}
