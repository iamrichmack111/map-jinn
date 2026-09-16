#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-v17.4.5}"
for c in git gh; do command -v "$c" >/dev/null || exit 1; done
gh auth status >/dev/null
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
BRANCH="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"; [[ -n "$BRANCH" ]] || BRANCH=main
./scripts/remove-demo-from-github.sh
git add -A
if ! git diff --cached --quiet; then git commit -m "release: repair CI/CD and keep demo local"; fi
git push origin "HEAD:$BRANCH"
run(){ wf="$1"; label="$2"; sha="$(git rev-parse HEAD)"; gh workflow enable "$wf" --repo "$REPO" >/dev/null 2>&1 || true; gh workflow run "$wf" --repo "$REPO" --ref "$BRANCH"; id=""; for _ in $(seq 1 45); do id="$(gh run list --repo "$REPO" --workflow "$wf" --event workflow_dispatch --branch "$BRANCH" --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$sha\") | .databaseId" | head -1)"; [[ -n "$id" ]] && break; sleep 2; done; [[ -n "$id" ]] || exit 1; echo "$label run: $id"; gh run watch "$id" --repo "$REPO" --exit-status || { gh run view "$id" --repo "$REPO" --log-failed || true; exit 1; }; }
run ci.yml CI
run container.yml Container
run docker-publish.yml Docker-Publish
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then n=1; while git ls-remote --exit-code --tags origin "refs/tags/${TAG}-r${n}" >/dev/null 2>&1; do n=$((n+1)); done; TAG="${TAG}-r${n}"; fi
git tag -a "$TAG" -m "Map Jinn ${TAG#v}"
git push origin "$TAG"
echo "GitHub delivery complete. Demo was not uploaded."
