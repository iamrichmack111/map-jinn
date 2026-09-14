# Development and testing

## Browser QA

```bash
./scripts/setup-dev.sh
npm test
```

## Screenshots

```bash
npm run screenshots
```

Outputs are written to `docs/screenshots/`.

## Demo video

```bash
npm run demo
```

The recorder uses Playwright and converts the captured browser video to `demo/map-jinn-demo.mp4` with ffmpeg.

## Container

```bash
docker compose build
docker compose up -d
```
