import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  createChangeOrder,
  getChangeOrderBySourceId,
  listProjects,
} from "./db";
import { parseChangeOrder } from "./parse";
import type { NewChangeOrderInput, Project } from "./types";

const HOST = process.env.GMAIL_IMAP_HOST || "imap.gmail.com";
const PORT = Number(process.env.GMAIL_IMAP_PORT || 993);
const USER = process.env.GMAIL_IMAP_USER;
const PASS = process.env.GMAIL_IMAP_APP_PASSWORD;
const INGEST_LABEL = process.env.GMAIL_INGEST_LABEL || "ChangeOrders/Inbox";
const PROCESSED_LABEL = process.env.GMAIL_PROCESSED_LABEL || "ChangeOrders/Processed";

const MAX_PER_RUN = 20;

export function isEmailIngestConfigured(): boolean {
  return Boolean(USER && PASS);
}

export interface IngestResult {
  ok: boolean;
  configured: boolean;
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
  message?: string;
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

export async function runEmailIngest(): Promise<IngestResult> {
  const result: IngestResult = {
    ok: false,
    configured: isEmailIngestConfigured(),
    processed: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

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
    // Make sure the "processed" label exists so we can move handled mail into it.
    try {
      await client.mailboxCreate(PROCESSED_LABEL);
    } catch {
      // Already exists — that's fine.
    }

    const lock = await client.getMailboxLock(INGEST_LABEL);
    try {
      const projects = await listProjects();
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      const batch = uids.slice(0, MAX_PER_RUN);

      for (const uid of batch) {
        result.processed += 1;
        try {
          const msg = await client.fetchOne(
            String(uid),
            { source: true },
            { uid: true },
          );
          if (!msg || !msg.source) {
            result.errors.push(`Could not read message ${uid}`);
            continue;
          }

          const mail = await simpleParser(msg.source as Buffer);
          const messageId = mail.messageId || `imap-${USER}-${uid}`;

          // Idempotency: never create two change orders for the same email.
          const existing = await getChangeOrderBySourceId("email", messageId);
          if (existing) {
            result.skipped += 1;
            await moveToProcessed(client, uid);
            continue;
          }

          const fromText = mail.from?.text ?? "";
          const subject = mail.subject ?? "(no subject)";
          const htmlText =
            typeof mail.html === "string" ? mail.html.replace(/<[^>]+>/g, " ") : "";
          const body = mail.text ?? htmlText;
          const content = `Subject: ${subject}\nFrom: ${fromText}\n\n${body}`.trim();

          const parsed = await parseChangeOrder(content);
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
            rawInput: content,
            source: "email",
            sourceUrl: gmailLink(messageId),
            sourceReceivedAt: mail.date ? mail.date.toISOString() : null,
            sourceExternalId: messageId,
            reviewStatus: "needs_review",
            reviewFlags: parsed.reviewFlags,
          };

          await createChangeOrder(input);
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
  } catch (err) {
    // Most likely the ingest label doesn't exist yet.
    result.message = `Couldn't read the "${INGEST_LABEL}" Gmail label. Create it and add a filter that labels change-order emails into it. (${err instanceof Error ? err.message : String(err)})`;
    return result;
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

async function moveToProcessed(client: ImapFlow, uid: number): Promise<void> {
  try {
    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    await client.messageMove(String(uid), PROCESSED_LABEL, { uid: true });
  } catch {
    // If the move fails, the message-ID dedupe still prevents duplicates.
  }
}
