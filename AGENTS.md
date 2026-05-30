<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PR workflow

After pushing changes, automatically open a pull request and enable auto-merge
(squash) so it merges itself once CI passes. If CI fails, diagnose and fix it (or
report back if it's out of scope) rather than merging a red PR. Don't wait for
manual approval to create or merge routine PRs.
