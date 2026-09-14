#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo "git is required."; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required."; exit 1; }
gh auth status >/dev/null

REPO_NAME="${1:-map-jinn}"
VISIBILITY="${2:-public}"
OWNER="$(gh api user -q .login)"
FULL="$OWNER/$REPO_NAME"

if [[ ! -d .git ]]; then
  git init -b main
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "release: Map Jinn 17.4 clean streets and apparel labels"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$FULL" >/dev/null 2>&1; then
    git remote add origin "git@github.com:${FULL}.git"
  else
    gh repo create "$REPO_NAME" "--$VISIBILITY" --source=. --remote=origin
  fi
fi

git branch -M main
git push -u origin main
./scripts/publish-topics.sh "$FULL"
gh repo edit "$FULL" --description "Building-footprint-first map workspace for apparel design, clean street context, and print-ready labels." --enable-issues=true --enable-wiki=true

cat <<MSG

Pushed: https://github.com/$FULL
Next:
  1. GitHub Wiki: create the first page once if GitHub asks, then run ./scripts/push-wiki.sh
  2. Media: npm install --no-audit --no-fund && npm run assets
  3. Release: git tag -a v17.4.0 -m 'Map Jinn 17.4' && git push origin v17.4.0
MSG
