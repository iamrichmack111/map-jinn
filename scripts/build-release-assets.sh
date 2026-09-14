#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs/screenshots demo
npm run screenshots
if command -v ffmpeg >/dev/null 2>&1; then
  npm run demo
else
  echo "ffmpeg not found; screenshots created, demo video skipped." >&2
fi
