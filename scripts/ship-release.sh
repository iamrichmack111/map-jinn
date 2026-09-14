#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-v17.4.2}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required." >&2; exit 1; }; }
need git
need gh

gh auth status >/dev/null

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: Run this inside the cloned map-jinn repository." >&2; exit 1; }

git config user.name "${GIT_AUTHOR_NAME:-Jeremy Franklin}"
git config user.email "${GIT_AUTHOR_EMAIL:-41898282+iamrichmack111@users.noreply.github.com}"

# Keep the approved map itself intact; this commit is pipeline/media/release infrastructure.
git add .github/workflows package.json playwright.config.js tests scripts README.md RELEASE_NOTES.md CHANGELOG.md 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "ci: repair Playwright media, container checks, and releases"
fi

git push origin HEAD:main
CODE_SHA="$(git rev-parse HEAD)"

echo "Pushed pipeline repair: $CODE_SHA"

wait_for_run() {
  local workflow="$1"
  local sha="$2"
  local label="$3"
  local id=""
  for _ in $(seq 1 60); do
    id="$(gh run list --workflow "$workflow" --commit "$sha" --limit 10 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
    if [[ -n "$id" ]]; then break; fi
    sleep 3
  done
  if [[ -z "$id" ]]; then
    echo "ERROR: Could not find $label workflow for $sha" >&2
    return 1
  fi
  echo "$label run: $id"
  if ! gh run watch "$id" --exit-status; then
    echo
    echo "---- $label FAILED LOGS ----" >&2
    gh run view "$id" --log-failed >&2 || true
    return 1
  fi
  printf '%s' "$id" > "/tmp/map-jinn-${label// /_}-run-id"
}

wait_for_run ci.yml "$CODE_SHA" CI
CI_RUN="$(cat /tmp/map-jinn-CI-run-id)"
wait_for_run container.yml "$CODE_SHA" Container
CONTAINER_RUN="$(cat /tmp/map-jinn-Container-run-id)"
wait_for_run media.yml "$CODE_SHA" Media
MEDIA_RUN="$(cat /tmp/map-jinn-Media-run-id)"

# A bot may have committed the generated media already. Sync first.
git pull --rebase origin main

# Always download the exact successful Playwright media artifact as a fallback.
rm -rf .map-jinn-media-download
mkdir -p .map-jinn-media-download
gh run download "$MEDIA_RUN" --name map-jinn-media --dir .map-jinn-media-download
mkdir -p docs/screenshots demo

LOGIN_PNG="$(find .map-jinn-media-download -type f -name '01-login.png' | head -1)"
WORKSPACE_PNG="$(find .map-jinn-media-download -type f -name '02-workspace.png' | head -1)"
MAP_PNG="$(find .map-jinn-media-download -type f -name '03-footprint-map.png' | head -1)"
DEMO_MP4="$(find .map-jinn-media-download -type f -name 'map-jinn-demo.mp4' | head -1)"

cp -f "$LOGIN_PNG" docs/screenshots/01-login.png
cp -f "$WORKSPACE_PNG" docs/screenshots/02-workspace.png
cp -f "$MAP_PNG" docs/screenshots/03-footprint-map.png
cp -f "$DEMO_MP4" demo/map-jinn-demo.mp4
rm -rf .map-jinn-media-download

test -s docs/screenshots/01-login.png
test -s docs/screenshots/02-workspace.png
test -s docs/screenshots/03-footprint-map.png
test -s demo/map-jinn-demo.mp4

git add docs/screenshots/01-login.png docs/screenshots/02-workspace.png docs/screenshots/03-footprint-map.png demo/map-jinn-demo.mp4
if ! git diff --cached --quiet; then
  git commit -m "docs: add Playwright screenshots and demo video"
  git push origin HEAD:main
fi

FINAL_SHA="$(git rev-parse HEAD)"

# Avoid silently moving an existing tag. If the requested tag is already used
# on another commit, create a repair-suffixed tag instead.
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  REMOTE_TAG_SHA="$(git ls-remote origin "refs/tags/$TAG^{}" | awk '{print $1}')"
  if [[ -z "$REMOTE_TAG_SHA" ]]; then
    REMOTE_TAG_SHA="$(git ls-remote origin "refs/tags/$TAG" | awk '{print $1}')"
  fi
  if [[ "$REMOTE_TAG_SHA" != "$FINAL_SHA" ]]; then
    n=1
    while git ls-remote --exit-code --tags origin "refs/tags/${TAG}-r${n}" >/dev/null 2>&1; do n=$((n+1)); done
    TAG="${TAG}-r${n}"
    echo "Requested tag already existed on another commit; using $TAG"
  fi
fi

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag -a "$TAG" -m "Map Jinn ${TAG#v} - GitHub pipeline repair"
fi

if ! git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  git push origin "$TAG"
else
  # Re-run release workflow for an existing tag instead of failing release creation.
  gh workflow run release.yml -f tag="$TAG"
fi

TAG_SHA="$(git rev-list -n 1 "$TAG")"
wait_for_run release.yml "$TAG_SHA" Release
RELEASE_RUN="$(cat /tmp/map-jinn-Release-run-id)"

echo
echo "=============================================="
echo "MAP JINN RELEASE COMPLETE"
echo "CI:        $CI_RUN"
echo "Container: $CONTAINER_RUN"
echo "Media:     $MEDIA_RUN"
echo "Release:   $RELEASE_RUN"
echo "Tag:       $TAG"
gh release view "$TAG" --json url --jq '"URL:       \(.url)"'
echo "=============================================="
