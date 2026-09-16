#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VOICE="${1:-en_US-hfc_male-medium}"
export MAP_JINN_PIPER_VOICE="$VOICE"
./scripts/setup-piper-demo.sh
./scripts/add-demo-voice.sh
./scripts/build-demo-poster.sh
printf '\nVoice replaced with %s\n%s\n' "$VOICE" "$PWD/local-demo/map-jinn-demo.mp4"
