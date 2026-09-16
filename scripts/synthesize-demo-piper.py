#!/usr/bin/env python3
"""Create polished local Piper narration with compact, synchronized captions."""
import os
import re
import shutil
import subprocess
import tempfile
import textwrap
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
CAPTIONS_SRT = ROOT / "local-demo" / "map-jinn-demo-captions.srt"
CAPTIONS_ASS = ROOT / "local-demo" / "map-jinn-demo-captions.ass"
CAPTIONS_ENABLED = os.environ.get("MAP_JINN_DEMO_CAPTIONS", "1").strip().lower() in {"1", "true", "yes", "on"}
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
kwargs = {}
if SynthesisConfig is not None:
    kwargs["syn_config"] = SynthesisConfig(
        length_scale=float(os.environ.get("MAP_JINN_PIPER_LENGTH", "1.04")),
        noise_scale=float(os.environ.get("MAP_JINN_PIPER_NOISE", "0.38")),
        noise_w_scale=float(os.environ.get("MAP_JINN_PIPER_NOISE_W", "0.58")),
        volume=1.0,
    )

OUT.parent.mkdir(parents=True, exist_ok=True)
PAUSE_SEC = float(os.environ.get("MAP_JINN_PIPER_PAUSE", "0.42"))


def clean_caption(text: str) -> str:
    replacements = {
        "G.I.S.": "GIS",
        "P.N.G.": "PNG",
        "three-oh-three-three-one": "30331",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return re.sub(r"\s+", " ", text).strip()


def caption_chunks(text: str, width: int = 36, max_lines: int = 2, max_words: int = 12):
    """Split narration into short events that can never become a wall of text."""
    words = clean_caption(text).split()
    if not words:
        return []
    chunks = []
    current = []
    for word in words:
        candidate = current + [word]
        wrapped = textwrap.wrap(
            " ".join(candidate),
            width=width,
            break_long_words=False,
            break_on_hyphens=False,
        )
        if current and (len(candidate) > max_words or len(wrapped) > max_lines):
            chunks.append(" ".join(current))
            current = [word]
        else:
            current = candidate
    if current:
        chunks.append(" ".join(current))

    formatted = []
    for chunk in chunks:
        wrapped = textwrap.wrap(
            chunk,
            width=width,
            break_long_words=False,
            break_on_hyphens=False,
        )[:max_lines]
        formatted.append("\n".join(wrapped))
    return formatted


def srt_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def ass_time(seconds: float) -> str:
    centis = max(0, round(seconds * 100))
    hours, centis = divmod(centis, 360_000)
    minutes, centis = divmod(centis, 6_000)
    secs, centis = divmod(centis, 100)
    return f"{hours:d}:{minutes:02d}:{secs:02d}.{centis:02d}"


def ass_escape(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def add_caption_events(events, text: str, segment_start: float, duration: float):
    chunks = caption_chunks(text)
    if not chunks:
        return

    # Allocate time by character weight so longer chunks stay up slightly longer.
    weights = [max(1, len(c.replace("\n", " "))) for c in chunks]
    total_weight = sum(weights)
    usable = max(0.45, duration - 0.12)
    cursor = segment_start + 0.06
    segment_end = segment_start + max(0.55, duration - 0.06)

    for idx, (chunk, weight) in enumerate(zip(chunks, weights)):
        if idx == len(chunks) - 1:
            end = segment_end
        else:
            share = usable * weight / total_weight
            end = min(segment_end, cursor + max(0.72, share))
        # Avoid zero/negative display windows on very short synthesis segments.
        end = max(cursor + 0.35, end)
        events.append((cursor, min(end, segment_end), chunk))
        cursor = min(segment_end, end + 0.03)


with tempfile.TemporaryDirectory(prefix="map-jinn-piper-") as temp_dir:
    temp = Path(temp_dir)
    parts = []
    durations = []
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
            frames = wav_file.getnframes()
            durations.append(frames / wav_file.getframerate())
            parts.append(wav_file.readframes(frames))

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

    if CAPTIONS_ENABLED:
        events = []
        cursor = 0.0
        for idx, (text, duration) in enumerate(zip(lines, durations)):
            add_caption_events(events, text, cursor, duration)
            cursor += duration
            if idx != len(lines) - 1:
                cursor += PAUSE_SEC

        srt_blocks = []
        ass_dialogue = []
        for idx, (start, end, caption) in enumerate(events, 1):
            srt_blocks.append(
                f"{idx}\n{srt_time(start)} --> {srt_time(end)}\n{caption}\n"
            )
            ass_dialogue.append(
                "Dialogue: 0,"
                f"{ass_time(start)},{ass_time(end)},Demo,,0,0,0,,{ass_escape(caption)}"
            )

        CAPTIONS_SRT.write_text("\n".join(srt_blocks).rstrip() + "\n", encoding="utf-8")

        # Fixed 1920x1080 canvas prevents libass from scaling the subtitle style unpredictably.
        # BorderStyle=1 intentionally avoids any full-width/giant background rectangle.
        ass_header = """[Script Info]
Title: Map Jinn Demo Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Demo,DejaVu Sans,42,&H00FFFFFF,&H000000FF,&H00000000,&H70000000,-1,0,0,0,100,100,0,0,1,3.0,1.0,2,260,260,72,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        CAPTIONS_ASS.write_text(ass_header + "\n".join(ass_dialogue) + "\n", encoding="utf-8")
    else:
        CAPTIONS_SRT.unlink(missing_ok=True)
        CAPTIONS_ASS.unlink(missing_ok=True)

# Gentle voice mastering for clearer narration without the "radio" effect.
filters = (
    "highpass=f=70,"
    "lowpass=f=14500,"
    "equalizer=f=180:t=q:w=1.0:g=0.8,"
    "equalizer=f=2800:t=q:w=1.1:g=1.2,"
    "acompressor=threshold=-19dB:ratio=2.0:attack=20:release=190:makeup=1.5,"
    "deesser=i=0.12:m=0.35:f=0.45,"
    "loudnorm=I=-16:TP=-1.5:LRA=6"
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
print(f"Captions: {CAPTIONS_ASS if CAPTIONS_ENABLED else 'OFF'}")
print(OUT)
