#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sqlite3
import time
from http import cookies
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "templates" / "app.html"
LOGIN_TEMPLATE = ROOT / "templates" / "login.html"
STATIC = ROOT / "static"
DB_PATH = Path(os.environ.get("MAP_JINN_DB_PATH", str(ROOT / "map_jinn_auth.sqlite3"))).expanduser()
HOST = os.environ.get("MAP_JINN_HOST", "0.0.0.0")
PORT = int(os.environ.get("MAP_JINN_PORT", "5333"))
SESSION_DAYS = 30
PBKDF2_ROUNDS = 260_000


def db_connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db_connect() as conn:
        conn.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))


def hash_password(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, expected_hex: str) -> bool:
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    _, actual_hex = hash_password(password, salt)
    return hmac.compare_digest(actual_hex, expected_hex)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def render_index() -> bytes:
    text = TEMPLATE.read_text(encoding="utf-8")
    text = text.replace("{{ url_for('static', filename='css/app.css') }}", "/static/css/app.css")
    text = text.replace("{{ url_for('static', filename='js/app.js') }}", "/static/js/app.js")
    return text.encode("utf-8")


def render_login() -> bytes:
    return LOGIN_TEMPLATE.read_bytes()


class Handler(BaseHTTPRequestHandler):
    server_version = "MapJinn/17.4"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send(self, status: int, body: bytes, content_type: str, headers: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict, headers: dict | None = None):
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json; charset=utf-8", headers)

    def _redirect(self, location: str, headers: dict | None = None):
        hdrs = {"Location": location}
        if headers:
            hdrs.update(headers)
        self._send(302, b"", "text/plain; charset=utf-8", hdrs)

    def _read_json(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size <= 0 or size > 64 * 1024:
            return None
        try:
            return json.loads(self.rfile.read(size).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    def _session_token(self) -> str | None:
        raw = self.headers.get("Cookie", "")
        if not raw:
            return None
        jar = cookies.SimpleCookie()
        try:
            jar.load(raw)
        except cookies.CookieError:
            return None
        morsel = jar.get("mapjinn_session")
        return morsel.value if morsel else None

    def _current_user(self):
        token = self._session_token()
        if not token:
            return None
        now = int(time.time())
        with db_connect() as conn:
            row = conn.execute(
                """
                SELECT users.id, users.username
                FROM sessions JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ?
                """,
                (token_hash(token), now),
            ).fetchone()
        return dict(row) if row else None

    def _new_session_headers(self, user_id: int):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        expires = now + SESSION_DAYS * 86400
        with db_connect() as conn:
            conn.execute(
                "INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (token_hash(token), user_id, expires, now),
            )
        cookie = f"mapjinn_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS * 86400}"
        return {"Set-Cookie": cookie}

    def _clear_session_headers(self):
        token = self._session_token()
        if token:
            with db_connect() as conn:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        return {"Set-Cookie": "mapjinn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"}

    def do_GET(self):
        path = unquote(urlparse(self.path).path)

        if path == "/login":
            if self._current_user():
                self._redirect("/")
            else:
                self._send(200, render_login(), "text/html; charset=utf-8")
            return

        if path in ("/", "/index.html"):
            if not self._current_user():
                self._redirect("/login")
                return
            self._send(200, render_index(), "text/html; charset=utf-8")
            return

        if path == "/api/auth/status":
            user = self._current_user()
            with db_connect() as conn:
                count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            self._json(200, {"authenticated": bool(user), "user": user, "has_users": count > 0})
            return

        if path == "/api/health":
            body = {
                "ok": True,
                "app": "Map Jinn 17.4 — Clean Streets + Apparel Labels + Login",
                "mode": "stdlib-server",
                "api_key_required": False,
                "login_required": True,
            }
            self._json(200, body)
            return

        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            target = (STATIC / rel).resolve()
            try:
                target.relative_to(STATIC.resolve())
            except ValueError:
                self._send(403, b"Forbidden", "text/plain; charset=utf-8")
                return
            if not target.is_file():
                self._send(404, b"Not found", "text/plain; charset=utf-8")
                return
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                ctype += "; charset=utf-8"
            self._send(200, target.read_bytes(), ctype)
            return

        self._send(404, b"Not found", "text/plain; charset=utf-8")

    def do_POST(self):
        path = unquote(urlparse(self.path).path)

        if path == "/api/auth/signup":
            data = self._read_json()
            if not isinstance(data, dict):
                self._json(400, {"ok": False, "error": "Invalid request."})
                return
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", ""))
            if len(username) < 3 or len(username) > 40:
                self._json(400, {"ok": False, "error": "Username must be 3–40 characters."})
                return
            if not all(ch.isalnum() or ch in "._-" for ch in username):
                self._json(400, {"ok": False, "error": "Use letters, numbers, dot, dash, or underscore."})
                return
            if len(password) < 8:
                self._json(400, {"ok": False, "error": "Password must be at least 8 characters."})
                return
            salt, digest = hash_password(password)
            now = int(time.time())
            try:
                with db_connect() as conn:
                    cur = conn.execute(
                        "INSERT INTO users(username, salt, password_hash, created_at) VALUES (?, ?, ?, ?)",
                        (username, salt, digest, now),
                    )
                    user_id = cur.lastrowid
            except sqlite3.IntegrityError:
                self._json(409, {"ok": False, "error": "That username already exists."})
                return
            self._json(200, {"ok": True, "username": username}, self._new_session_headers(user_id))
            return

        if path == "/api/auth/login":
            data = self._read_json()
            if not isinstance(data, dict):
                self._json(400, {"ok": False, "error": "Invalid request."})
                return
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", ""))
            with db_connect() as conn:
                row = conn.execute(
                    "SELECT id, username, salt, password_hash FROM users WHERE username = ? COLLATE NOCASE",
                    (username,),
                ).fetchone()
            if not row or not verify_password(password, row["salt"], row["password_hash"]):
                time.sleep(0.15)
                self._json(401, {"ok": False, "error": "Incorrect username or password."})
                return
            self._json(200, {"ok": True, "username": row["username"]}, self._new_session_headers(row["id"]))
            return

        if path == "/api/auth/logout":
            self._json(200, {"ok": True}, self._clear_session_headers())
            return

        self._send(404, b"Not found", "text/plain; charset=utf-8")


if __name__ == "__main__":
    init_db()
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        raise SystemExit(f"Could not start Map Jinn on port {PORT}: {exc}")
    print(f"Map Jinn 17.4 running at http://127.0.0.1:{PORT}")
    print("Login is enabled. First visit: create your account.")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Map Jinn...")
    finally:
        httpd.server_close()
