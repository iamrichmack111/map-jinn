#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VENV="${MAP_JINN_PIPER_VENV:-$PWD/.demo-venv}"
VOICE_DIR="${MAP_JINN_PIPER_VOICE_DIR:-$PWD/.demo-voices}"
VOICE="${MAP_JINN_PIPER_VOICE:-en_US-ryan-high}"
MODEL="$VOICE_DIR/$VOICE.onnx"
CONFIG="$VOICE_DIR/$VOICE.onnx.json"
need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required." >&2; exit 1; }; }
need python3
[[ -x "$VENV/bin/python" ]] || python3 -m venv "$VENV"
PY="$VENV/bin/python"; PIP="$VENV/bin/pip"
if ! "$PY" -c 'import piper' >/dev/null 2>&1; then
  echo "Installing Piper TTS locally..."
  "$PIP" install --disable-pip-version-check --upgrade pip wheel
  "$PIP" install --disable-pip-version-check 'piper-tts==1.4.2'
fi
mkdir -p "$VOICE_DIR"
if [[ ! -s "$MODEL" || ! -s "$CONFIG" ]]; then
  echo "Downloading high-quality Piper voice: $VOICE"
  if ! "$PY" -m piper.download_voices --data-dir "$VOICE_DIR" "$VOICE"; then
    need curl
    BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high"
    curl -fL --retry 3 --retry-delay 2 "$BASE/en_US-ryan-high.onnx" -o "$MODEL"
    curl -fL --retry 3 --retry-delay 2 "$BASE/en_US-ryan-high.onnx.json" -o "$CONFIG"
  fi
fi
[[ -s "$MODEL" && -s "$CONFIG" ]] || { echo "ERROR: Piper voice download failed." >&2; exit 1; }
echo "Piper ready: $MODEL"
