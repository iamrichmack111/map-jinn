#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-v17.4.3}"
need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required" >&2; exit 1; }; }
need git
need gh
need python3

gh auth status >/dev/null
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
BRANCH="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"
[[ -n "$BRANCH" ]] || BRANCH=main

git config user.name "${GIT_AUTHOR_NAME:-Jeremy Franklin}"
git config user.email "${GIT_AUTHOR_EMAIL:-41898282+iamrichmack111@users.noreply.github.com}"

git add .
if ! git diff --cached --quiet; then
  git commit -m "release: add Playwright media, GHCR, issues, and D2 architecture"
fi
git push origin "HEAD:$BRANCH"

gh api --method PUT "repos/$REPO/actions/permissions" -F enabled=true -f allowed_actions=all >/dev/null 2>&1 || true

wait_workflow_visible(){
  local wf="$1"
  for _ in $(seq 1 30); do
    if gh workflow view "$wf" --repo "$REPO" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "ERROR: workflow $wf not visible on GitHub" >&2
  exit 1
}

for wf in ci.yml container.yml media.yml docker-publish.yml release.yml; do
  wait_workflow_visible "$wf"
  gh workflow enable "$wf" --repo "$REPO" >/dev/null 2>&1 || true
done

./scripts/bootstrap-issues.sh "$REPO"
./scripts/publish-topics.sh "$REPO"

LAST_RUN_ID=""
run_dispatch(){
  local wf="$1" label="$2" sha id=""
  sha="$(git rev-parse HEAD)"
  gh workflow run "$wf" --repo "$REPO" --ref "$BRANCH"
  for _ in $(seq 1 40); do
    id="$(gh run list --repo "$REPO" --workflow "$wf" --event workflow_dispatch --branch "$BRANCH" --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$sha\") | .databaseId" | head -1)"
    [[ -n "$id" ]] && break
    sleep 2
  done
  [[ -n "$id" ]] || { echo "ERROR: no $label run found" >&2; exit 1; }
  echo "$label run: $id"
  if ! gh run watch "$id" --repo "$REPO" --exit-status; then
    gh run view "$id" --repo "$REPO" --log-failed || true
    exit 1
  fi
  LAST_RUN_ID="$id"
}

run_dispatch ci.yml CI; CI_RUN="$LAST_RUN_ID"
run_dispatch container.yml Container; CONTAINER_RUN="$LAST_RUN_ID"
run_dispatch media.yml Media; MEDIA_RUN="$LAST_RUN_ID"
run_dispatch docker-publish.yml Docker-Publish; DOCKER_RUN="$LAST_RUN_ID"

rm -rf .map-jinn-media-download
mkdir -p .map-jinn-media-download docs/screenshots demo
gh run download "$MEDIA_RUN" --repo "$REPO" --name map-jinn-media --dir .map-jinn-media-download
for f in 01-login.png 02-workspace.png 03-footprint-map.png; do
  src="$(find .map-jinn-media-download -name "$f" -type f | head -1)"
  [[ -n "$src" ]] || { echo "ERROR: missing $f" >&2; exit 1; }
  cp -f "$src" "docs/screenshots/$f"
done
src="$(find .map-jinn-media-download -name map-jinn-demo.mp4 -type f | head -1)"
[[ -n "$src" ]] || { echo "ERROR: missing map-jinn-demo.mp4" >&2; exit 1; }
cp -f "$src" demo/map-jinn-demo.mp4
rm -rf .map-jinn-media-download

test -s docs/screenshots/01-login.png
test -s docs/screenshots/02-workspace.png
test -s docs/screenshots/03-footprint-map.png
test -s demo/map-jinn-demo.mp4
test -s docs/architecture.d2
test -s docs/architecture.svg

git add docs/screenshots demo/map-jinn-demo.mp4 docs/architecture.d2 docs/architecture.svg docs/icons
if ! git diff --cached --quiet; then
  git commit -m "docs: publish Playwright screenshots, demo, and D2 architecture"
  git push origin "HEAD:$BRANCH"
fi

FINAL_SHA="$(git rev-parse HEAD)"
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  n=1
  while git ls-remote --exit-code --tags origin "refs/tags/${TAG}-r${n}" >/dev/null 2>&1; do n=$((n+1)); done
  TAG="${TAG}-r${n}"
fi
git tag -a "$TAG" -m "Map Jinn ${TAG#v}"
git push origin "$TAG"

RELEASE_RUN=""
for _ in $(seq 1 50); do
  RELEASE_RUN="$(gh run list --repo "$REPO" --workflow release.yml --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$FINAL_SHA\") | .databaseId" | head -1)"
  [[ -n "$RELEASE_RUN" ]] && break
  sleep 2
done
[[ -n "$RELEASE_RUN" ]] || { echo "ERROR: Release workflow not found" >&2; exit 1; }
if ! gh run watch "$RELEASE_RUN" --repo "$REPO" --exit-status; then
  gh run view "$RELEASE_RUN" --repo "$REPO" --log-failed || true
  exit 1
fi

echo "CI=$CI_RUN"
echo "CONTAINER=$CONTAINER_RUN"
echo "MEDIA=$MEDIA_RUN"
echo "DOCKER=$DOCKER_RUN"
echo "RELEASE=$RELEASE_RUN"
echo "ISSUES=https://github.com/$REPO/issues"
echo "PACKAGE=https://github.com/$REPO/pkgs/container/$(basename "$REPO")"
gh release view "$TAG" --repo "$REPO" --json url --jq '.url'
