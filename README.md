# Map Jinn 17.4

[![CI](https://github.com/iamrichmack111/map-jinn/actions/workflows/ci.yml/badge.svg)](https://github.com/iamrichmack111/map-jinn/actions/workflows/ci.yml)
[![Container](https://github.com/iamrichmack111/map-jinn/actions/workflows/container.yml/badge.svg)](https://github.com/iamrichmack111/map-jinn/actions/workflows/container.yml)
[![Docker Publish](https://github.com/iamrichmack111/map-jinn/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/iamrichmack111/map-jinn/actions/workflows/docker-publish.yml)
[![Release](https://github.com/iamrichmack111/map-jinn/actions/workflows/release.yml/badge.svg)](https://github.com/iamrichmack111/map-jinn/actions/workflows/release.yml)

Map Jinn is a footprint-first U.S. mapping workspace for geographic artwork and apparel design.

## Run
```bash
./run.sh
```

## Tests
```bash
npm install
npx playwright install --with-deps chromium
npm test
```

## Local Piper demo
The narrated demo is intentionally not generated or uploaded by GitHub Actions. Build it only on the workstation:

```bash
chmod +x scripts/*.sh
./scripts/make-demo.sh
xdg-open local-demo/map-jinn-demo.mp4
```

The one-time setup installs Piper locally and downloads `en_US-ryan-high`. Rendered media, the Piper model, and the Piper virtual environment are excluded from Git.

If an older version of this repo tracked demo media, run once:
```bash
./scripts/remove-demo-from-github.sh
git add -A
git commit -m "chore: keep demo local"
git push
```

## Delivery
```bash
./scripts/ship-everything.sh
```
CI/CD now validates the application/container and publishes source/container releases without demo media.
