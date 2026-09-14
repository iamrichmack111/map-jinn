# Map Jinn 17.4

![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-tested-2EAD33?logo=playwright&logoColor=white)
![GIS](https://img.shields.io/badge/GIS-building%20footprints-7FBF3F)

**Map Jinn** is a building-footprint-first map workspace for geographic artwork and apparel design. Version 17.4 keeps the clean 17.2 apparel look while adding restrained street linework and selective road names at close print-detail scales.

The core rule is simple: **the footprints are the map**. There is no conventional basemap underneath the artwork.

## Highlights

- Building-footprint-first map design
- Nationwide U.S. footprint search with bounded viewport loading
- Atlanta official GIS layers on startup
- Clean street linework + selective road names at close scale
- Saved footprint places
- Apparel labels: location, coordinates, and custom text
- Dark and paper modes
- Filled, outline, and dense footprint styles
- PNG, GeoJSON, and CSV export
- Local login with SQLite + PBKDF2 password hashing
- Docker + Docker Compose
- Playwright smoke tests
- Automated screenshots and MP4 demo generation
- GitHub Actions CI, container build, media, and release workflows
- Wiki source included in `wiki/`

## Run locally

```bash
chmod +x run.sh
./run.sh
```

Open the URL printed by the launcher. On first use, create a local account.

## Docker

```bash
docker compose up --build -d
```

Open `http://127.0.0.1:5333`.

## Browser tests

```bash
./scripts/setup-dev.sh
npm test
```

## Screenshots + demo

```bash
npm run screenshots
npm run demo
```

Screenshots are written to `docs/screenshots/`. The MP4 demo is written to `demo/map-jinn-demo.mp4`.

## Data sources

Atlanta-specific layers use the City of Atlanta Department of City Planning public GIS services. Nationwide building rendering uses the USA Structures public polygon service. Search uses public ArcGIS geocoding/place services.

## Repository topics

After the repository is pushed:

```bash
./scripts/publish-topics.sh
```

## Wiki

The canonical wiki source is in `wiki/`. After enabling GitHub Wiki and creating its first page once:

```bash
./scripts/push-wiki.sh
```

## Release

Tagging a version such as `v17.4.0` triggers the release workflow:

```bash
git tag -a v17.4.0 -m "Map Jinn 17.4"
git push origin v17.4.0
```
