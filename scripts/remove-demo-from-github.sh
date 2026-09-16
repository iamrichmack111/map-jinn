#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf demo
rm -f .github/workflows/media.yml
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git rm -r --cached --ignore-unmatch demo >/dev/null 2>&1 || true
  git rm --cached --ignore-unmatch .github/workflows/media.yml >/dev/null 2>&1 || true
fi
echo "Old GitHub demo media removed from tracking; the new rendered demo stays local-demo/."
