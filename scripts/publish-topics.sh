#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-}"
if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi
TOPICS=(gis mapping geospatial building-footprints arcgis apparel-design print-on-demand printify python javascript docker playwright ci-cd atlanta maps)
args=(repo edit "$REPO")
for topic in "${TOPICS[@]}"; do args+=(--add-topic "$topic"); done
gh "${args[@]}"
echo "Topics applied to $REPO"
