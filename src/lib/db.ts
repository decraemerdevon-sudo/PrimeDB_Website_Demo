import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ChangeOrder, NewChangeOrderInput, Project } from "./types";

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

// Lazily create the schema (and seed sample projects) once per runtime.
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
        initiator            TEXT,
        request_date         DATE,
        raw_input            TEXT,
        client_approval_date DATE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
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

function toChangeOrder(r: Row): ChangeOrder {
  return {
    id: Number(r.id),
    coNumber: (r.co_number as string) ?? null,
    projectId: r.project_id == null ? null : Number(r.project_id),
    projectName: String(r.project_name),
    scopeDescription: String(r.scope_description),
    // NUMERIC comes back as a string from the driver — coerce to number.
    costAmount: r.cost_amount == null ? null : Number(r.cost_amount),
    status: String(r.status),
    initiator: (r.initiator as string) ?? null,
    requestDate: (r.request_date as string) ?? null,
    rawInput: (r.raw_input as string) ?? null,
    clientApprovalDate: (r.client_approval_date as string) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function listProjects(): Promise<Project[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM projects ORDER BY name`) as Row[];
  return rows.map(toProject);
}

export async function listChangeOrders(
  projectId?: number,
): Promise<ChangeOrder[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (
    projectId
      ? await sql`SELECT * FROM change_orders WHERE project_id = ${projectId} ORDER BY id DESC`
      : await sql`SELECT * FROM change_orders ORDER BY id DESC`
  ) as Row[];
  return rows.map(toChangeOrder);
}

export async function getChangeOrder(id: number): Promise<ChangeOrder | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM change_orders WHERE id = ${id}`) as Row[];
  return rows.length ? toChangeOrder(rows[0]) : null;
}

export async function createChangeOrder(
  input: NewChangeOrderInput,
): Promise<ChangeOrder> {
  await ensureSchema();
  const sql = getSql();
  const approvalDate =
    input.status === "Signed" ? new Date().toISOString().slice(0, 10) : null;

  const [{ id }] = (await sql`
    INSERT INTO change_orders
      (project_id, project_name, scope_description, cost_amount, status,
       initiator, request_date, raw_input, client_approval_date)
    VALUES
      (${input.projectId}, ${input.projectName}, ${input.scopeDescription},
       ${input.costAmount}, ${input.status}, ${input.initiator},
       ${input.requestDate}, ${input.rawInput}, ${approvalDate})
    RETURNING id
  `) as { id: number }[];

  // Derive a human-readable CO number from the row id, e.g. CO-0001.
  const coNumber = `CO-${String(id).padStart(4, "0")}`;
  await sql`UPDATE change_orders SET co_number = ${coNumber} WHERE id = ${id}`;

  const created = await getChangeOrder(id);
  if (!created) throw new Error("Failed to load the change order after creation.");
  return created;
}
