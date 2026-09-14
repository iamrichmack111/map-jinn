#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
chmod +x scripts/*.sh scripts/*.py 2>/dev/null || true
python3 -m py_compile app.py >/dev/null
node --check scripts/record-demo.mjs
bash -n scripts/add-demo-voice.sh
bash -n scripts/ship-everything.sh

git add .
if ! git diff --cached --quiet; then
  git commit -m "media: add narrated Playwright demo"
fi
git push origin HEAD:main
./scripts/ship-everything.sh v17.4.4
