"""Serialized, persistent Agnes image generation; never retry an ambiguous timeout."""
import argparse
import base64
import fcntl
import hashlib
import json
import os
import socket
import math
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from common import atomic_json, database, request_json

MODEL = "agnes-image-2.5-flash"


def retry_seconds(value, now=None):
    now = time.time() if now is None else now
    try:
        return max(0, float(value))
    except (TypeError, ValueError):
        try:
            return max(0, parsedate_to_datetime(value).timestamp() - now)
        except (TypeError, ValueError, OverflowError):
            return 60


class ImagePool:
    def __init__(self, path, clock=time.time, sleep=time.sleep):
        self.path = Path(path)
        self.db = database(path)
        self.clock, self.sleep = clock, sleep
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS matches(match_id TEXT PRIMARY KEY, expires REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS starts(at REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS images(
            match_id TEXT NOT NULL, slot INTEGER NOT NULL, status TEXT NOT NULL,
            result TEXT, PRIMARY KEY(match_id,slot));
          CREATE TABLE IF NOT EXISTS throttle(id INTEGER PRIMARY KEY, until REAL NOT NULL);
        """)

    def cleanup(self):
        self.db.execute("DELETE FROM images WHERE match_id IN (SELECT match_id FROM matches WHERE expires<=?)", (self.clock(),))
        self.db.execute("DELETE FROM matches WHERE expires<=?", (self.clock(),))
        for row in self.db.execute("SELECT match_id,slot,result FROM images WHERE status='done'").fetchall():
            saved = json.loads(row['result'])
            if not Path(saved['path']).exists():
                self.db.execute("UPDATE images SET status='used',result=NULL WHERE match_id=? AND slot=?", (row['match_id'],row['slot']))
        self.db.execute("DELETE FROM starts WHERE at<=?", (self.clock()-60,))
        self.db.execute("DELETE FROM throttle WHERE until<=?", (self.clock(),))

    def take_slot(self, deadline=None, reserve=0):
        # Called while holding the global lock, including on every retry.
        while True:
            now = self.clock()
            self.db.execute("DELETE FROM starts WHERE at<=?", (now - 60,))
            pause = self.db.execute("SELECT until FROM throttle WHERE id=1").fetchone()
            starts = [r[0] for r in self.db.execute("SELECT at FROM starts ORDER BY at")]
            wait = max(0, (pause[0] - now) if pause else 0,
                       (starts[0] + 60.05 - now) if len(starts) >= 4 else 0)
            if deadline is not None and now+wait+reserve>deadline:
                raise ValueError("presupuesto de preparación agotado")
            if wait > 0:
                self.sleep(wait)
                continue
            self.db.execute("INSERT INTO starts VALUES(?)", (now,))
            return

    def generate(self, match, slot, prompt, out, call=request_json, size="2K", ratio="9:16", expires_at=None, attempt_deadline=None):
        if slot not in range(10):
            raise ValueError("máximo diez imágenes por encuentro")
        if size not in {"1K", "2K"} or ratio not in {"1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"}:
            raise ValueError("resolución o ratio no admitidos")
        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        with self.path.with_suffix(".lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            deadline = expires_at if expires_at is not None else self.clock()+86400
            prior_match = self.db.execute("SELECT expires FROM matches WHERE match_id=?", (match,)).fetchone()
            if not math.isfinite(deadline) or deadline <= self.clock() or (prior_match and prior_match[0] <= self.clock()):
                raise ValueError("encuentro caducado; generaciones cerradas")
            self.cleanup()
            self.db.execute("INSERT OR IGNORE INTO matches VALUES(?,?)", (match, deadline))
            old = self.db.execute("SELECT * FROM images WHERE match_id=? AND slot=?", (match, slot)).fetchone()
            if old and old["status"] == "done":
                result = json.loads(old["result"])
                if Path(result["path"]).exists():
                    if result.get("prompt") != prompt: raise ValueError("slot pertenece a otra versión de prompts; no se regenera")
                    return result
                raise ValueError("la imagen guardada no existe; restaurar el recurso antes de reintentar")
            if old and old["status"] == "used":
                raise ValueError("imagen liberada; el slot ya fue utilizado")
            if old and old["status"] in ("pending", "uncertain"):
                raise ValueError("generación de resultado incierto; no se repite automáticamente")
            throttle = self.db.execute("SELECT until FROM throttle WHERE id=1").fetchone()
            if throttle and throttle[0] > self.clock():
                raise ValueError("Agnes está pausado por límite de llamadas")
            key = os.environ.get("AGNES_API_KEY")
            if not key:
                raise ValueError("falta AGNES_API_KEY")
            model = os.environ.get("AGNES_IMAGE_MODEL", MODEL)
            timeout = int(os.environ.get("AGNES_TIMEOUT_SECONDS", "300"))
            if not 60 <= timeout <= 360:
                raise ValueError("AGNES_TIMEOUT_SECONDS debe estar entre 60 y 360")
            for attempt in range(2):
                workflow_db = Path(os.environ.get('GOATLAB_STATE_DIR', str(self.path.parent))) / 'goatlab.sqlite'
                if workflow_db.exists():
                    import sqlite3
                    with sqlite3.connect(workflow_db) as flow:
                        task = flow.execute('SELECT status FROM tasks WHERE id=?', ('media:'+match,)).fetchone()
                        if task and task[0] == 'cancelled': raise ValueError('preparación cancelada')
                self.take_slot(attempt_deadline, timeout+35)
                if self.clock() >= (prior_match[0] if prior_match else deadline):
                    raise ValueError("encuentro caducado; generaciones cerradas")
                self.db.execute("INSERT OR REPLACE INTO images VALUES(?,?,?,NULL)", (match, slot, "pending"))
                try:
                    result = call("https://apihub.agnes-ai.com/v1/images/generations", {
                        "model": model, "prompt": prompt, "size": size, "ratio": ratio,
                        "return_base64": True,
                    }, {"Authorization": "Bearer " + key}, timeout=timeout)
                    break
                except urllib.error.HTTPError as error:
                    error.close()
                    if error.code == 429:
                        self.db.execute("UPDATE images SET status='limited' WHERE match_id=? AND slot=?", (match, slot))
                        until = self.clock() + retry_seconds(error.headers.get("Retry-After"))
                        self.db.execute("INSERT OR REPLACE INTO throttle VALUES(1,?)", (until,))
                        if attempt == 0:
                            continue
                        self.db.execute("UPDATE images SET status='limited' WHERE match_id=? AND slot=?", (match, slot))
                        raise ValueError("Agnes HTTP 429 repetido; generación detenida") from None
                    self.db.execute("UPDATE images SET status='failed' WHERE match_id=? AND slot=?", (match, slot))
                    raise ValueError(f"Agnes HTTP {error.code}") from None
                except (TimeoutError, socket.timeout, urllib.error.URLError):
                    self.db.execute("UPDATE images SET status='uncertain' WHERE match_id=? AND slot=?", (match, slot))
                    raise ValueError("Agnes timeout/red: resultado incierto, no se repite") from None
            # Keep the response before decoding/downloading: successful requests are not lost.
            recovery = out / f"{slot}.response.json"
            encoded_result = json.dumps(result)
            root = out.parent
            cached_bytes = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
            if cached_bytes + len(encoded_result.encode()) * 2 > 128_000_000:
                self.db.execute("UPDATE images SET status='uncertain' WHERE match_id=? AND slot=?", (match,slot))
                raise ValueError("caché de imágenes llena; resultado incierto")
            atomic_json(recovery, result)
            try:
                image = (result.get("data") or result.get("images") or [result])[0]
                encoded = image.get("b64_json") or image.get("base64")
                if encoded:
                    raw = base64.b64decode(encoded.split(",")[-1], validate=True)
                else:
                    url = image.get("url", "")
                    if not url.startswith("https://"):
                        raise ValueError("Agnes no devolvió una imagen")
                    with urllib.request.urlopen(url, timeout=60) as response:
                        raw = response.read(64 * 1024 * 1024 + 1)
                if not raw or len(raw) > 64 * 1024 * 1024:
                    raise ValueError("tamaño de imagen inesperado")
                ext = "png" if raw.startswith(b"\x89PNG") else "webp" if raw.startswith(b"RIFF") else "jpg"
                path = out / f"{slot}.{ext}"
                temp = path.with_suffix(".tmp")
                with temp.open("wb") as handle:
                    handle.write(raw)
                    handle.flush()
                    os.fsync(handle.fileno())
                temp.replace(path)
                probe = json.loads(subprocess.check_output([
                    "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                    "stream=width,height", "-of", "json", str(path)], timeout=30))
                dimensions = probe["streams"][0]
                saved = {"path": str(path.resolve()), "file": path.name, "width": dimensions["width"],
                         "height": dimensions["height"], "model": model, "prompt": prompt,
                         "sha256": hashlib.sha256(raw).hexdigest(),
                         "size": size, "ratio": ratio, "at": datetime.now(timezone.utc).isoformat()}
                atomic_json(out / f"{slot}.json", saved)
                self.db.execute("UPDATE images SET status='done',result=? WHERE match_id=? AND slot=?",
                                (json.dumps(saved), match, slot))
                recovery.unlink(missing_ok=True)
                return saved
            except Exception:
                self.db.execute("UPDATE images SET status='uncertain' WHERE match_id=? AND slot=?", (match, slot))
                raise ValueError("Agnes generó un resultado que requiere recuperación local") from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--match", required=True)
    parser.add_argument("--index", type=int, required=True)
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", choices=["1K", "2K"], default="2K")
    parser.add_argument("--ratio", default="9:16")
    parser.add_argument("--expires-at", type=float, required=True)
    parser.add_argument("--attempt-deadline", type=float)
    args = parser.parse_args()
    try:
        pool = ImagePool(os.environ.get("AGNES_STATE_DB", str(Path(args.out).parents[1] / "agnes.sqlite")))
        print(json.dumps(pool.generate(args.match, args.index, Path(args.prompt_file).read_text(), args.out, size=args.size, ratio=args.ratio, expires_at=args.expires_at, attempt_deadline=args.attempt_deadline)))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
