<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PR workflow

After pushing changes, automatically open a pull request and merge it (squash)
once CI passes — don't wait for manual approval on routine PRs. Prefer GitHub's
native auto-merge; if the repo doesn't have "Allow auto-merge" enabled, just
merge the PR directly yourself once CI is green. Either way, if CI fails,
diagnose and fix it (or report back if it's out of scope) rather than merging a
red PR.
