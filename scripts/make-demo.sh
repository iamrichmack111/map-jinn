#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required." >&2; exit 1; }; }
for c in python3 node npm ffmpeg ffprobe; do need "$c"; done
mkdir -p local-demo
[[ -d node_modules/@playwright/test ]] || npm install --no-audit --no-fund
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1; then npx playwright install chromium; fi
./scripts/setup-piper-demo.sh
node scripts/record-demo.mjs
cp -f local-demo/map-jinn-demo.mp4 local-demo/map-jinn-demo-browser.mp4
./scripts/add-demo-voice.sh
./scripts/build-demo-poster.sh
printf '\nLOCAL DEMO COMPLETE\nVideo:    %s\nPoster:   %s\nVoice:    %s\nCaptions: compact lower-third by default\n' "$PWD/local-demo/map-jinn-demo.mp4" "$PWD/local-demo/map-jinn-demo-poster.jpg" "$PWD/local-demo/map-jinn-demo-voice.wav"
