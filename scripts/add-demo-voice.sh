#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VIDEO="local-demo/map-jinn-demo.mp4"; SILENT="local-demo/map-jinn-demo-silent.mp4"
VOICE="local-demo/map-jinn-demo-voice.wav"; FINAL="local-demo/map-jinn-demo-final.mp4"
CAPTIONS="scripts/demo-captions.srt"; PY="${MAP_JINN_PIPER_PYTHON:-$PWD/.demo-venv/bin/python}"
[[ -s "$VIDEO" ]] || { echo "ERROR: missing $VIDEO" >&2; exit 1; }
[[ -x "$PY" ]] || { echo "ERROR: Piper environment is missing." >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required." >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe is required." >&2; exit 1; }
rm -f "$VOICE" "$SILENT" "$FINAL"
"$PY" scripts/synthesize-demo-piper.py
mv "$VIDEO" "$SILENT"
FILTER="[0:v]tpad=stop_mode=clone:stop_duration=60[v]"
if [[ -s "$CAPTIONS" ]]; then FILTER="[0:v]tpad=stop_mode=clone:stop_duration=60,subtitles=${CAPTIONS}:force_style='FontName=DejaVu Sans,FontSize=18,Outline=2,MarginV=34'[v]"; fi
if ! ffmpeg -y -loglevel warning -i "$SILENT" -i "$VOICE" -filter_complex "$FILTER" -map '[v]' -map 1:a:0 -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "$FINAL"; then
  ffmpeg -y -loglevel warning -i "$SILENT" -i "$VOICE" -filter_complex '[0:v]tpad=stop_mode=clone:stop_duration=60[v]' -map '[v]' -map 1:a:0 -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "$FINAL"
fi
mv "$FINAL" "$VIDEO"; rm -f "$SILENT"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$VIDEO" | grep -q .
echo "Piper narrated demo ready: $PWD/$VIDEO"
