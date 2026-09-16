# Changelog

## 17.4.3

- Added D2 architecture source and custom SVG icon set.
- Added issue forms plus idempotent starter issue/label bootstrap.
- Added GHCR Docker publishing workflow.
- Hardened Playwright screenshot/demo shipping and GitHub Release packaging.
- Added README workflow badges, screenshots, demo, and architecture documentation.

## 17.4.2

- Repaired CI and Playwright selectors.
- Made demo recording independent of fixed port 5333.
- Added resilient MP4 conversion and media verification.
- Added live Docker health validation.
- Made GitHub Release publishing idempotent.
- Added one-command shipping script that waits for CI, Container, Media, and Release jobs and prints failed logs automatically.
- Preserved the approved 17.4 map behavior.

## 17.4.0

- Clean street linework and selective street labels for apparel-oriented footprint designs.
- Apparel map labels and nationwide footprint-place workflow.

## 17.4.4

- Added male voice narration to the Playwright demo video.
- Added Edge TTS narration with an espeak-ng fallback.
- Added ffprobe checks so CI fails if the demo MP4 has no audio track.
- Release artifact continues to use `demo/map-jinn-demo.mp4`, now with AAC audio.

## Demo repair
- Demo recorder now executes and waits for a real ZIP 30331 search instead of only typing into the search box.
- Added deterministic style, apparel-label, theme, focus-mode, and PNG-export steps.
- Added project-local demo setup, Edge TTS support with local fallback, burned caption support, and a real animated README GIF.
- Media CI and release packaging now preserve the demo MP4, animated preview GIF, and poster image.
