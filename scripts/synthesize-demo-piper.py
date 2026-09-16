#!/usr/bin/env python3
import os, wave
from pathlib import Path
from piper import PiperVoice
try:
    from piper import SynthesisConfig
except ImportError:
    SynthesisConfig = None
ROOT = Path(__file__).resolve().parents[1]
name = os.environ.get("MAP_JINN_PIPER_VOICE", "en_US-ryan-high")
voice_dir = Path(os.environ.get("MAP_JINN_PIPER_VOICE_DIR", str(ROOT / ".demo-voices")))
model = voice_dir / f"{name}.onnx"
out = ROOT / "local-demo" / "map-jinn-demo-voice.wav"
text = (ROOT / "scripts" / "demo-narration.txt").read_text(encoding="utf-8").strip()
if not model.is_file(): raise SystemExit(f"Missing Piper model: {model}")
out.parent.mkdir(parents=True, exist_ok=True)
voice = PiperVoice.load(str(model))
kwargs = {}
if SynthesisConfig is not None:
    kwargs["syn_config"] = SynthesisConfig(length_scale=1.08, noise_scale=0.667, noise_w_scale=0.8, volume=1.0)
with wave.open(str(out), "wb") as wav_file:
    voice.synthesize_wav(text, wav_file, **kwargs)
print(out)
