#!/usr/bin/env python3
"""Create polished local Piper narration with sentence pauses and mastering."""
import os
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

from piper import PiperVoice
try:
    from piper import SynthesisConfig
except ImportError:
    SynthesisConfig = None

ROOT = Path(__file__).resolve().parents[1]
VOICE_NAME = os.environ.get("MAP_JINN_PIPER_VOICE", "en_US-hfc_male-medium")
VOICE_DIR = Path(os.environ.get("MAP_JINN_PIPER_VOICE_DIR", str(ROOT / ".demo-voices")))
MODEL = VOICE_DIR / f"{VOICE_NAME}.onnx"
TEXT_FILE = ROOT / "scripts" / "demo-narration.txt"
OUT = ROOT / "local-demo" / "map-jinn-demo-voice.wav"
RAW = ROOT / "local-demo" / "map-jinn-demo-voice-raw.wav"

if not MODEL.is_file():
    raise SystemExit(f"Missing Piper model: {MODEL}")
if shutil.which("ffmpeg") is None:
    raise SystemExit("ffmpeg is required for narration mastering")

lines = [line.strip() for line in TEXT_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
if not lines:
    raise SystemExit("Narration text is empty")

voice = PiperVoice.load(str(MODEL))
# hfc_male's native pacing is quick. These values slow it slightly while
# reducing random variation so narration stays clear and consistent.
kwargs = {}
if SynthesisConfig is not None:
    kwargs["syn_config"] = SynthesisConfig(
        length_scale=float(os.environ.get("MAP_JINN_PIPER_LENGTH", "0.98")),
        noise_scale=float(os.environ.get("MAP_JINN_PIPER_NOISE", "0.42")),
        noise_w_scale=float(os.environ.get("MAP_JINN_PIPER_NOISE_W", "0.62")),
        volume=1.0,
    )

OUT.parent.mkdir(parents=True, exist_ok=True)
PAUSE_SEC = float(os.environ.get("MAP_JINN_PIPER_PAUSE", "0.34"))

with tempfile.TemporaryDirectory(prefix="map-jinn-piper-") as temp_dir:
    temp = Path(temp_dir)
    parts = []
    fmt = None
    for idx, text in enumerate(lines, 1):
        path = temp / f"segment-{idx:02d}.wav"
        with wave.open(str(path), "wb") as wav_file:
            voice.synthesize_wav(text, wav_file, **kwargs)
        with wave.open(str(path), "rb") as wav_file:
            current = (wav_file.getnchannels(), wav_file.getsampwidth(), wav_file.getframerate())
            if fmt is None:
                fmt = current
            elif current != fmt:
                raise SystemExit("Piper emitted inconsistent WAV formats")
            parts.append(wav_file.readframes(wav_file.getnframes()))

    channels, sample_width, sample_rate = fmt
    silence = b"\x00" * int(PAUSE_SEC * sample_rate) * channels * sample_width
    with wave.open(str(RAW), "wb") as merged:
        merged.setnchannels(channels)
        merged.setsampwidth(sample_width)
        merged.setframerate(sample_rate)
        for idx, pcm in enumerate(parts):
            merged.writeframes(pcm)
            if idx != len(parts) - 1:
                merged.writeframes(silence)

# Voice mastering: remove rumble/harsh top end, add gentle presence,
# compress peaks, then normalize for consistent demo-video loudness.
filters = (
    "highpass=f=72,"
    "lowpass=f=15000,"
    "equalizer=f=140:t=q:w=1.0:g=1.2,"
    "equalizer=f=3200:t=q:w=1.2:g=1.0,"
    "acompressor=threshold=-18dB:ratio=2.4:attack=18:release=180:makeup=2,"
    "loudnorm=I=-16:TP=-1.5:LRA=7"
)
subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error",
    "-i", str(RAW),
    "-af", filters,
    "-ar", "48000", "-ac", "1",
    str(OUT),
], check=True)
RAW.unlink(missing_ok=True)
print(f"Narration voice: {VOICE_NAME}")
print(OUT)
