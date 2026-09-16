#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -loglevel error -ss 00:00:18 -i local-demo/map-jinn-demo.mp4 -frames:v 1 -q:v 2 local-demo/map-jinn-demo-poster.jpg
