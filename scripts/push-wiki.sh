#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo "gh CLI is required."; exit 1; }
REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
URL="https://github.com/${REPO}.wiki.git"
if ! git clone "$URL" "$TMP/wiki"; then
  echo "Could not clone $URL"
  echo "Enable the repository Wiki in GitHub Settings, create the first page once, then rerun this script."
  exit 2
fi
rm -f "$TMP/wiki"/*.md
cp wiki/*.md "$TMP/wiki"/
cd "$TMP/wiki"
git add .
if git diff --cached --quiet; then
  echo "Wiki already up to date."
  exit 0
fi
git -c user.name='Map Jinn Release Bot' -c user.email='actions@users.noreply.github.com' commit -m 'docs: publish Map Jinn wiki'
git push origin HEAD:master
echo "Wiki published: https://github.com/${REPO}/wiki"
