# Security

Map Jinn login data is stored locally in SQLite and passwords are PBKDF2-hashed. Do not commit `map_jinn_auth.sqlite3` or its WAL/SHM files. The repository `.gitignore` excludes them.

For public deployment, put Map Jinn behind HTTPS and a production reverse proxy. The built-in Python server is intended for local use, demos, and controlled deployments.
