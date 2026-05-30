#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions, where the container
# is a fresh clone with no installed dependencies. Local sessions skip this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install Node dependencies so build/lint work for the session.
# `npm install` (not `npm ci`) so the cached container layer is reused.
cd "$CLAUDE_PROJECT_DIR"
npm install
