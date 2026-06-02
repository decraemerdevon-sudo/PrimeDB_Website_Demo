import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { classifyEmail } from "./classify";
import {
  createChangeOrder,
  getChangeOrderBySourceId,
  hasDatabase,
  listProjects,
} from "./db";
import { parseChangeOrder } from "./parse";
import type { NewChangeOrderInput, Project } from "./types";

const HOST = process.env.GMAIL_IMAP_HOST || "imap.gmail.com";
const PORT = Number(process.env.GMAIL_IMAP_PORT || 993);
const USER = process.env.GMAIL_IMAP_USER;
const PASS = process.env.GMAIL_IMAP_APP_PASSWORD;

// Classification mode (the default): the AI reads the inbox and labels mail itself.
// Set GMAIL_CLASSIFY=false to fall back to the legacy "Gmail filter pre-labels the
// inbox folder, we just parse it" behavior.
const CLASSIFY = (process.env.GMAIL_CLASSIFY ?? "true").toLowerCase() !== "false";

// Mailbox the AI scans when classifying (the real inbox by default).
const SCAN_MAILBOX = process.env.GMAIL_SCAN_MAILBOX || "INBOX";

// Gmail labels the AI applies. Creating a Gmail label over IMAP = creating a folder
// of the same name; "applying" a label = copying the message into that folder.
const CO_LABEL = process.env.GMAIL_CO_LABEL || "Change Orders";
const MAYBE_LABEL = process.env.GMAIL_MAYBE_LABEL || "Change Orders/Maybe";
// Everything the AI has already looked at gets this label so we never re-classify
// (and never re-spend tokens on) the same message.
const SCANNED_LABEL = process.env.GMAIL_SCANNED_LABEL || "Change Orders/Scanned";
// How far back to look for un-scanned mail on each run.
const LOOKBACK = process.env.GMAIL_LOOKBACK || "7d";

// Legacy mode: the pre-labeled folder we read, and where handled mail is moved.
const INGEST_LABEL = process.env.GMAIL_INGEST_LABEL || "ChangeOrders/Inbox";
const PROCESSED_LABEL =
  process.env.GMAIL_PROCESSED_LABEL || "ChangeOrders/Processed";

const MAX_PER_RUN = 25;
const MAX_BODY_CHARS = 4000;

export function isEmailIngestConfigured(): boolean {
  return Boolean(USER && PASS);
}

export interface IngestResult {
  ok: boolean;
  configured: boolean;
  processed: number; // emails examined this run
  created: number; // change orders logged (confident "yes")
  maybe: number; // emails labeled "Maybe" for human review
  unrelated: number; // emails classified as not change-order related
  skipped: number; // already-seen emails
  errors: string[];
  message?: string;
}

function emptyResult(): IngestResult {
  return {
    ok: false,
    configured: isEmailIngestConfigured(),
    processed: 0,
    created: 0,
    maybe: 0,
    unrelated: 0,
    skipped: 0,
    errors: [],
  };
}

function matchProject(name: string, projects: Project[]): Project | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return projects.find(
    (p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()),
  );
}

// Gmail supports opening the exact message via the rfc822msgid search operator.
function gmailLink(messageId: string): string {
  const id = messageId.replace(/^<|>$/g, "");
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(id)}`;
}

// Make sure a Gmail label/folder exists so we can copy messages into it.
async function ensureLabel(client: ImapFlow, label: string): Promise<void> {
  try {
    await client.mailboxCreate(label);
  } catch {
    // Already exists — that's fine.
  }
}

// Apply a Gmail label by copying the message into the matching folder. The original
// stays in the inbox, so labeling is non-destructive.
async function applyLabel(
  client: ImapFlow,
  uid: number,
  label: string,
): Promise<void> {
  try {
    await client.messageCopy(String(uid), label, { uid: true });
  } catch {
    // Best-effort: a failed label doesn't block logging the change order.
  }
}

interface ParsedEmail {
  messageId: string;
  subject: string;
  fromText: string;
  content: string;
  date: Date | null;
}

async function readEmail(
  client: ImapFlow,
  uid: number,
): Promise<ParsedEmail | null> {
  const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
  if (!msg || !msg.source) return null;

  const mail = await simpleParser(msg.source as Buffer);
  const subject = mail.subject ?? "(no subject)";
  const fromText = mail.from?.text ?? "";
  const htmlText =
    typeof mail.html === "string" ? mail.html.replace(/<[^>]+>/g, " ") : "";
  const body = (mail.text ?? htmlText).slice(0, MAX_BODY_CHARS);
  const content = `Subject: ${subject}\nFrom: ${fromText}\n\n${body}`.trim();

  return {
    messageId: mail.messageId || `imap-${USER}-${uid}`,
    subject,
    fromText,
    content,
    date: mail.date ?? null,
  };
}

async function logChangeOrder(
  email: ParsedEmail,
  projects: Project[],
): Promise<void> {
  const parsed = await parseChangeOrder(email.content);
  const matched = matchProject(parsed.projectName, projects);

  const input: NewChangeOrderInput = {
    projectId: matched ? matched.id : null,
    projectName: matched ? matched.name : parsed.projectName,
    scopeDescription: parsed.scopeDescription,
    costAmount: parsed.costAmount,
    clientQuotedAmount: parsed.costAmount,
    approvalStatus: parsed.approvalStatus,
    initiator: parsed.initiator,
    requestDate: parsed.requestDate,
    status: "Pending Client Signature",
    rawInput: email.content,
    source: "email",
    sourceUrl: gmailLink(email.messageId),
    sourceReceivedAt: email.date ? email.date.toISOString() : null,
    sourceExternalId: email.messageId,
    reviewStatus: "needs_review",
    reviewFlags: parsed.reviewFlags,
  };

  await createChangeOrder(input);
}

export async function runEmailIngest(): Promise<IngestResult> {
  const result = emptyResult();

  if (!result.configured) {
    result.message =
      "Gmail is not connected yet. Set GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD in your Vercel environment variables.";
    return result;
  }

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: USER!, pass: PASS! },
    logger: false,
  });

  try {
    await client.connect();
  } catch {
    result.message =
      "Couldn't sign in to Gmail. Double-check the app password and that IMAP is enabled in Gmail settings.";
    return result;
  }

  try {
    return CLASSIFY
      ? await runClassifyMode(client, result)
      : await runLegacyMode(client, result);
  } catch (err) {
    result.message = `Email ingest failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    return result;
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

// New default: the AI reads recent inbox mail, classifies each message, labels the
// change-order ones (and ambiguous ones as "Maybe"), and logs the confident ones.
async function runClassifyMode(
  client: ImapFlow,
  result: IngestResult,
): Promise<IngestResult> {
  await ensureLabel(client, CO_LABEL);
  await ensureLabel(client, MAYBE_LABEL);
  await ensureLabel(client, SCANNED_LABEL);

  const dbReady = hasDatabase();
  const projects = dbReady ? await listProjects() : [];

  const lock = await client.getMailboxLock(SCAN_MAILBOX);
  try {
    // Only look at mail we haven't already classified (the "Scanned" label), within
    // the lookback window. Gmail's raw search powers the "-label:" exclusion.
    const query = `in:inbox -label:"${SCANNED_LABEL}" newer_than:${LOOKBACK}`;
    const uids =
      (await client.search({ gmailraw: query }, { uid: true })) || [];
    const batch = uids.slice(0, MAX_PER_RUN);

    for (const uid of batch) {
      result.processed += 1;
      try {
        const email = await readEmail(client, uid);
        if (!email) {
          result.errors.push(`Could not read message ${uid}`);
          continue;
        }

        const { decision } = await classifyEmail(email.content);

        if (decision === "yes") {
          await applyLabel(client, uid, CO_LABEL);
          const existing = dbReady
            ? await getChangeOrderBySourceId("email", email.messageId)
            : null;
          if (existing) {
            result.skipped += 1;
          } else if (dbReady) {
            await logChangeOrder(email, projects);
            result.created += 1;
          } else {
            result.errors.push(
              `Labeled "${email.subject}" but couldn't log it (no database configured).`,
            );
          }
        } else if (decision === "maybe") {
          await applyLabel(client, uid, MAYBE_LABEL);
          result.maybe += 1;
        } else {
          result.unrelated += 1;
        }

        // Mark as scanned regardless of decision so we never reprocess it.
        await applyLabel(client, uid, SCANNED_LABEL);
      } catch (err) {
        result.errors.push(
          `Message ${uid}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    lock.release();
  }

  result.ok = true;
  result.message = summarize(result);
  return result;
}

// Legacy mode: a Gmail filter has already labeled change-order mail into a folder;
// we just parse everything there and log it. Kept for backward compatibility.
async function runLegacyMode(
  client: ImapFlow,
  result: IngestResult,
): Promise<IngestResult> {
  await ensureLabel(client, PROCESSED_LABEL);

  const lock = await client.getMailboxLock(INGEST_LABEL);
  try {
    const projects = await listProjects();
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    const batch = uids.slice(0, MAX_PER_RUN);

    for (const uid of batch) {
      result.processed += 1;
      try {
        const email = await readEmail(client, uid);
        if (!email) {
          result.errors.push(`Could not read message ${uid}`);
          continue;
        }

        const existing = await getChangeOrderBySourceId("email", email.messageId);
        if (existing) {
          result.skipped += 1;
          await moveToProcessed(client, uid);
          continue;
        }

        await logChangeOrder(email, projects);
        result.created += 1;
        await moveToProcessed(client, uid);
      } catch (err) {
        result.errors.push(
          `Message ${uid}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    lock.release();
  }

  result.ok = true;
  result.message =
    result.created > 0
      ? `Imported ${result.created} change order${result.created === 1 ? "" : "s"} for review.`
      : "No new change-order emails found.";
  return result;
}

function summarize(r: IngestResult): string {
  if (r.processed === 0) return "No new emails to review.";
  const parts: string[] = [];
  if (r.created > 0)
    parts.push(`logged ${r.created} change order${r.created === 1 ? "" : "s"}`);
  if (r.maybe > 0) parts.push(`flagged ${r.maybe} as "Maybe"`);
  if (r.unrelated > 0) parts.push(`${r.unrelated} unrelated`);
  if (r.skipped > 0) parts.push(`${r.skipped} already seen`);
  const detail = parts.length ? ` — ${parts.join(", ")}.` : ".";
  return `Scanned ${r.processed} email${r.processed === 1 ? "" : "s"}${detail}`;
}

async function moveToProcessed(client: ImapFlow, uid: number): Promise<void> {
  try {
    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    await client.messageMove(String(uid), PROCESSED_LABEL, { uid: true });
  } catch {
    // If the move fails, the message-ID dedupe still prevents duplicates.
  }
}
