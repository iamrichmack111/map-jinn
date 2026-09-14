#!/usr/bin/env python3
import asyncio
import os
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "scripts" / "demo-narration.txt").read_text(encoding="utf-8").strip()
out = ROOT / "demo" / "map-jinn-demo-voice.mp3"
out.parent.mkdir(parents=True, exist_ok=True)
voice = os.environ.get("MAP_JINN_DEMO_VOICE", "en-US-GuyNeural")
rate = os.environ.get("MAP_JINN_DEMO_RATE", "-12%")
pitch = os.environ.get("MAP_JINN_DEMO_PITCH", "-2Hz")

async def main():
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
    await communicate.save(str(out))

asyncio.run(main())
print(out)
