#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-v17.4.5}"
for c in git gh; do command -v "$c" >/dev/null || exit 1; done
gh auth status >/dev/null
./scripts/remove-demo-from-github.sh
git add -A
if ! git diff --cached --quiet; then git commit -m "ci: repair pipeline and keep demo local"; fi
git push origin HEAD:main
SHA="$(git rev-parse HEAD)"
wait_run(){ wf="$1"; label="$2"; id=""; for _ in $(seq 1 60); do id="$(gh run list --workflow "$wf" --commit "$SHA" --limit 10 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"; [[ -n "$id" ]] && break; sleep 3; done; [[ -n "$id" ]] || exit 1; echo "$label run: $id"; gh run watch "$id" --exit-status || { gh run view "$id" --log-failed || true; exit 1; }; }
wait_run ci.yml CI
wait_run container.yml Container
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then n=1; while git ls-remote --exit-code --tags origin "refs/tags/${TAG}-r${n}" >/dev/null 2>&1; do n=$((n+1)); done; TAG="${TAG}-r${n}"; fi
git tag -a "$TAG" -m "Map Jinn ${TAG#v}"
git push origin "$TAG"
