# Change Order Management System

Turns messy, informal construction change-order requests (voice transcriptions, emails, texts) into formal, tracked change orders. Built for [Prime Design Build](https://www.primedb.ca).

This is **V1 (MVP)**: paste a description → AI extracts the key fields → review/edit → store it → generate a formal Word document → view all change orders by project.

## Features (V1)

1. **Input & parse** — paste a messy description; Claude extracts project, scope, cost, approval status, initiator, and date into structured fields.
2. **Review & edit** — confirm or correct the parsed fields, match to a project, set status.
3. **Store** — change orders are persisted in Postgres with an auto-generated CO number (e.g. `CO-0001`).
4. **Document** — download a professional, formatted `.docx` change order with company details, scope, cost, standard terms, and signature blocks.
5. **Track** — dashboard lists every change order, filterable by project, with status badges.

> Phase 4 (unsigned-CO reminders / workflow automation) is intentionally **not** built yet.

## Tech stack

- **Next.js 16** (App Router, Server Actions) + **React 19** + **Tailwind v4**
- **Postgres** via Vercel Postgres / Neon (`@neondatabase/serverless`)
- **Claude API** (`@anthropic-ai/sdk`, structured outputs) for parsing
- **`docx`** for Word-document generation
- Deployed on **Vercel**

## Setup

Two environment variables are required for the live app:

| Variable | What it's for | How to set it |
|---|---|---|
| `DATABASE_URL` | Postgres connection | In Vercel → **Storage** → create a **Postgres (Neon)** database and connect it to the project. Vercel sets this automatically. (`POSTGRES_URL` also works.) |
| `ANTHROPIC_API_KEY` | AI parsing | Vercel → **Settings → Environment Variables**. Get a key from the [Anthropic Console](https://console.anthropic.com). |

The database schema is created automatically on first use, along with a few sample projects so the dashboard works immediately. Without `DATABASE_URL`, the app shows a setup notice instead of crashing; without `ANTHROPIC_API_KEY`, you can still fill in change-order fields manually.

### Local development

```bash
npm install
# Create .env.local with DATABASE_URL and ANTHROPIC_API_KEY, then:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it's structured

```
src/
  app/
    page.tsx                         Dashboard — list/filter change orders
    change-orders/new/               Create flow (server page + client form)
    api/change-orders/[id]/document/ Route handler: generates & downloads the .docx
  lib/
    parse.ts        Claude API parsing (structured outputs)
    db.ts           Postgres access + lazy schema/seed
    co-document.ts  Word-document builder
    actions.ts      Server Actions (parse, create)
    types.ts        Shared domain types
```

## Notes

- The parser uses `claude-haiku-4-5` (cheapest; plenty for this extraction task). For higher-quality parsing, change the `MODEL` constant in `src/lib/parse.ts` to `claude-sonnet-4-6` or `claude-opus-4-8` (and add `effort` back into `output_config`, which Haiku doesn't support).
- Company details in the generated document live in `src/lib/co-document.ts`.
