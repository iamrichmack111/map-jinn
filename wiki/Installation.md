# Installation

## Native

```bash
chmod +x run.sh
./run.sh
```

Open the URL printed by the launcher and create a local account on first use.

## Docker Compose

```bash
docker compose up --build -d
```

Open `http://127.0.0.1:5333`. Login data is persisted in the `map_jinn_data` Docker volume.
