"""Small standard-library helpers shared by the Gateway tools and planner."""
import json
import os
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timezone
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


def quota_day(timestamp):
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d")


def agnes_authority(clock=None):
    """Production always uses R2. Tests inject a backend into the pools directly."""
    from agnes_state import AgnesState
    return AgnesState(**({'clock': clock} if clock is not None else {}))


def quota_caps():
    """Token Plan Starter quotas with a conservative operative video ceiling.

    Provider Starter quotas: 4000 images/day, 500 video seconds/day.
    The operative video ceiling (default 360s ~= 20 full banks) keeps a
    reserve for retries and on-demand Telegram generations within the month.
    """
    def num(name, default):
        try:
            return float(os.environ.get(name, default))
        except (TypeError, ValueError):
            return float(default)
    return {
        "images": num("AGNES_DAILY_IMAGE_CAP", 4000),
        "video_seconds": num("AGNES_DAILY_VIDEO_SECONDS_CAP", 360),
    }


def ensure_quota(db):
    db.execute("CREATE TABLE IF NOT EXISTS quota_use(day TEXT PRIMARY KEY,"
               " images INTEGER NOT NULL DEFAULT 0, video_seconds REAL NOT NULL DEFAULT 0)")


def read_quota(db, day):
    ensure_quota(db)
    row = db.execute("SELECT images, video_seconds FROM quota_use WHERE day=?", (day,)).fetchone()
    return {"images": row[0] if row else 0, "video_seconds": row[1] if row else 0.0}


def add_quota(db, day, images=0, video_seconds=0.0):
    ensure_quota(db)
    db.execute("INSERT INTO quota_use(day, images, video_seconds) VALUES(?,?,?)"
               " ON CONFLICT(day) DO UPDATE SET images=images+excluded.images,"
               " video_seconds=video_seconds+excluded.video_seconds", (day, images, video_seconds))
