#!/bin/bash
# SessionStart hook for Claude Code on the web: installs everything needed so
# `npm test` and `npm run test:e2e` (mobile-chrome + mobile-safari) work.
set -euo pipefail

# Web sessions only — local machines manage their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install

# The sandbox ships a system Chromium; point Playwright's chromium project at
# it (see playwright.config.js) instead of downloading one.
if [ -x /opt/pw-browsers/chromium ]; then
  echo 'export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# WebKit (mobile Safari surface) must be downloaded + needs system libraries.
# Both steps are idempotent and cached with the container. Downloads require
# cdn.playwright.dev and playwright.download.prss.microsoft.com in the
# environment's network allowlist — warn instead of failing if they're absent.
if PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= npx playwright install webkit; then
  npx playwright install-deps webkit ||
    echo "WARN: webkit system deps failed to install; mobile-safari e2e may not run" >&2
else
  echo "WARN: webkit download failed (network allowlist?); mobile-safari e2e will not run" >&2
fi
