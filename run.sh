#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required." >&2
  echo "Install it with: sudo apt update && sudo apt install -y python3" >&2
  exit 1
fi

# Prefer the familiar port 5333. If an older Map Jinn is already there,
# stop only that verified Map Jinn instance so the browser cannot keep
# showing the previous broken build. Never kill an unrelated service.
PORT="${MAP_JINN_PORT:-5333}"
if [[ "$PORT" == "5333" ]]; then
  if python3 - <<'PY' >/dev/null 2>&1
import json, urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:5333/api/health', timeout=0.7) as r:
        data=json.load(r)
    raise SystemExit(0 if str(data.get('app','')).startswith('Map Jinn') else 1)
except Exception:
    raise SystemExit(1)
PY
  then
    if command -v fuser >/dev/null 2>&1; then
      echo "Stopping older Map Jinn on port 5333..."
      fuser -k 5333/tcp >/dev/null 2>&1 || true
      sleep 0.5
    else
      PORT=5334
    fi
  fi
fi

# If the requested port is still occupied by something else, find a free one.
if ! python3 - "$PORT" <<'PY' >/dev/null 2>&1
import socket, sys
p=int(sys.argv[1]); s=socket.socket()
try:
    s.bind(('127.0.0.1', p))
except OSError:
    raise SystemExit(1)
finally:
    s.close()
PY
then
  PORT="$(python3 - <<'PY'
import socket
for p in range(5334, 5344):
    s=socket.socket()
    try:
        s.bind(('127.0.0.1', p))
    except OSError:
        s.close(); continue
    s.close(); print(p); break
else:
    raise SystemExit('No free port found from 5334 through 5343')
PY
)"
fi

export MAP_JINN_PORT="$PORT"
echo
printf 'Map Jinn 17.4 + Login + Clean Streets + Apparel Labels\n'
printf 'OPEN THIS URL: http://127.0.0.1:%s\n' "$PORT"
printf 'Press Ctrl+C to stop.\n\n'
exec python3 app.py
