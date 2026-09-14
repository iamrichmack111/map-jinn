#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

mklabel() {
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" 2>/dev/null || \
  gh label edit "$1" --repo "$REPO" --color "$2" --description "$3" >/dev/null
}
mklabel "bug" "D73A4A" "Something is not working"
mklabel "enhancement" "A2EEEF" "New feature or improvement"
mklabel "apparel" "7C3AED" "Apparel and print-on-demand workflow"
mklabel "gis" "0E8A16" "Mapping and geospatial data"
mklabel "playwright" "2EAD33" "Playwright tests, screenshots, or video"
mklabel "docker" "2496ED" "Docker and container publishing"
mklabel "release" "FBCA04" "Release packaging and distribution"
mklabel "documentation" "0075CA" "README, D2, wiki, or docs"

ensure_issue() {
  local title="$1" labels="$2" body="$3"
  if [[ -z "$(gh issue list --repo "$REPO" --state all --search "in:title \"$title\"" --json title --jq ".[] | select(.title == \"$title\") | .title" | head -1)" ]]; then
    gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body" >/dev/null
  fi
}

ensure_issue "Printify placement presets" "apparel,enhancement" $'Add reusable placement presets for back jacket, center chest, left chest, and sleeve exports.\n\nAcceptance criteria:\n- Presets do not alter the underlying footprint map\n- Labels remain printable\n- PNG export respects the selected layout'
ensure_issue "Nationwide footprint coverage verification" "gis,enhancement" $'Track representative U.S. searches and verify bounded footprint loading remains reliable without freezing the browser.'
ensure_issue "Playwright visual regression coverage" "playwright,enhancement" $'Expand the media suite with stable screenshots for dark, paper, and apparel-label views while keeping external GIS timing non-blocking.'
ensure_issue "Container release verification" "docker,release" $'Verify GHCR latest and version tags boot successfully and pass /api/health after each release.'
ensure_issue "D2 architecture diagram maintenance" "documentation" $'Keep docs/architecture.d2, the custom icon set, and README architecture image synchronized as the platform changes.'

echo "Issues and labels ready: https://github.com/$REPO/issues"
