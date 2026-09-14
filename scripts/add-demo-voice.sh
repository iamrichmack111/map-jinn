#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p demo

VIDEO="demo/map-jinn-demo.mp4"
SILENT="demo/map-jinn-demo-silent.mp4"
VOICE_MP3="demo/map-jinn-demo-voice.mp3"
VOICE_WAV="demo/map-jinn-demo-voice.wav"
FINAL="demo/map-jinn-demo-voiced.mp4"

[[ -s "$VIDEO" ]] || { echo "ERROR: missing $VIDEO" >&2; exit 1; }
rm -f "$VOICE_MP3" "$VOICE_WAV" "$FINAL"

if python3 -c 'import edge_tts' >/dev/null 2>&1; then
  echo "Generating high-quality male narration with Edge TTS..."
  if ! python3 scripts/synthesize-demo-voice.py; then
    rm -f "$VOICE_MP3"
  fi
fi

AUDIO=""
if [[ -s "$VOICE_MP3" ]]; then
  AUDIO="$VOICE_MP3"
elif command -v espeak-ng >/dev/null 2>&1; then
  echo "Edge TTS unavailable; using local male speech fallback..."
  espeak-ng -v en-us+m3 -s 145 -p 42 -f scripts/demo-narration.txt -w "$VOICE_WAV"
  AUDIO="$VOICE_WAV"
else
  echo "ERROR: no narration engine available (edge-tts or espeak-ng)." >&2
  exit 1
fi

mv -f "$VIDEO" "$SILENT"

# Keep the live Playwright recording, then hold its final frame only if narration
# is longer. The final deliverable always has an AAC audio track.
ffmpeg -y \
  -i "$SILENT" \
  -i "$AUDIO" \
  -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=45[v]" \
  -map "[v]" -map 1:a:0 \
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart -shortest \
  "$FINAL"

mv -f "$FINAL" "$VIDEO"

# The release demo must contain both a video and audio stream.
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$VIDEO" | grep -q .
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$VIDEO" | grep -q .

echo "Voiced demo ready: $VIDEO"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO"
