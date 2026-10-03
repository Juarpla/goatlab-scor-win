"""Small standard-library helpers shared by the Gateway tools and planner."""
import json
import os
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path


def database(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    # Two databases, each <=4.5 MB plus its rollback journal: <20 MB total.
    db.execute("PRAGMA journal_mode=DELETE")
    page_size = db.execute("PRAGMA page_size").fetchone()[0]
    maximum = db.execute(f"PRAGMA max_page_count={4_500_000 // page_size}").fetchone()[0]
    if maximum * page_size > 4_500_000:
        db.close()
        raise ValueError("SQLite supera el presupuesto temporal; no se ampliará")
    db.execute("PRAGMA cache_size=-1024")
    db.execute("PRAGMA secure_delete=ON")
    db.execute("PRAGMA busy_timeout=30000")
    return db


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f".{os.getpid()}.tmp")
    with temp.open("w") as handle:
        json.dump(value, handle, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    temp.replace(path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def request_json(url, body=None, headers=None, timeout=30):
    request = urllib.request.Request(
        url, data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def telegram(method, body):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("falta TELEGRAM_BOT_TOKEN")
    result = request_json(f"https://api.telegram.org/bot{token}/{method}", body)
    if not result.get("ok"):
        raise RuntimeError(f"Telegram {method} rechazado")
    return result["result"]
