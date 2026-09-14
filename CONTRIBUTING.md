# Contributing

Keep the core design rule intact: building footprints are the map. Avoid introducing a conventional basemap that visually overtakes the footprint artwork.

Before opening a pull request:

```bash
python3 -m py_compile app.py
npm install --no-audit --no-fund
npm test
docker compose build
```
