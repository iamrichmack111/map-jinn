#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VIDEO="local-demo/map-jinn-demo.mp4"
BROWSER="local-demo/map-jinn-demo-browser.mp4"
VOICE="local-demo/map-jinn-demo-voice.wav"
FINAL="local-demo/map-jinn-demo-final.mp4"
CAPTIONS_SRT="local-demo/map-jinn-demo-captions.srt"
CAPTIONS_ASS="local-demo/map-jinn-demo-captions.ass"
PY="${MAP_JINN_PIPER_PYTHON:-$PWD/.demo-venv/bin/python}"
CAPTIONS_ENABLED="${MAP_JINN_DEMO_CAPTIONS:-1}"

[[ -x "$PY" ]] || { echo "ERROR: Piper environment is missing." >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required." >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe is required." >&2; exit 1; }

# Preserve a clean browser-only master exactly once. Every later narration/caption rebuild starts
# from this file, never from an already-captioned final MP4. This prevents subtitle stacking.
if [[ ! -s "$BROWSER" ]]; then
  [[ -s "$VIDEO" ]] || { echo "ERROR: missing browser recording ($VIDEO)" >&2; exit 1; }
  cp -f "$VIDEO" "$BROWSER"
fi

rm -f "$VOICE" "$FINAL" "$CAPTIONS_SRT" "$CAPTIONS_ASS"
MAP_JINN_DEMO_CAPTIONS="$CAPTIONS_ENABLED" "$PY" scripts/synthesize-demo-piper.py

BASE_FILTER="[0:v]tpad=stop_mode=clone:stop_duration=60,scale=1920:1080:flags=lanczos,fade=t=in:st=0:d=0.35[v]"
FILTER="$BASE_FILTER"

case "${CAPTIONS_ENABLED,,}" in
  1|true|yes|on)
    [[ -s "$CAPTIONS_ASS" ]] || { echo "ERROR: captions were requested but $CAPTIONS_ASS is missing." >&2; exit 1; }
    # Fixed-resolution ASS, max two lines, outline-only styling, no expanding background box.
    FILTER="[0:v]tpad=stop_mode=clone:stop_duration=60,scale=1920:1080:flags=lanczos,subtitles=${CAPTIONS_ASS},fade=t=in:st=0:d=0.35[v]"
    ;;
  *)
    rm -f "$CAPTIONS_SRT" "$CAPTIONS_ASS"
    ;;
esac

ffmpeg -y -loglevel warning \
  -i "$BROWSER" -i "$VOICE" \
  -filter_complex "$FILTER" \
  -map '[v]' -map 1:a:0 \
  -c:v libx264 -preset slow -crf 18 -profile:v high -level 4.1 \
  -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart -shortest "$FINAL"

mv "$FINAL" "$VIDEO"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$VIDEO" | grep -q .

if [[ -s "$CAPTIONS_ASS" ]]; then
  printf 'Finished demo: %s\nCaptions: compact lower-third (%s)\nClean browser master: %s\n' "$PWD/$VIDEO" "$PWD/$CAPTIONS_ASS" "$PWD/$BROWSER"
else
  printf 'Finished demo: %s\nCaptions: OFF\nClean browser master: %s\n' "$PWD/$VIDEO" "$PWD/$BROWSER"
fi
