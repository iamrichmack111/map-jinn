FROM python:3.13-slim

WORKDIR /app
COPY . /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MAP_JINN_HOST=0.0.0.0 \
    MAP_JINN_PORT=5333 \
    MAP_JINN_DB_PATH=/data/map_jinn_auth.sqlite3

RUN mkdir -p /data

EXPOSE 5333
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:5333/api/health', timeout=2)); raise SystemExit(0 if d.get('ok') else 1)"

CMD ["python", "app.py"]
