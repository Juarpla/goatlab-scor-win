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

from common import agnes_authority, atomic_json, database, request_json

MODEL = "agnes-image-2.5-flash"


def image_rpm():
    """Starter operative pace: 12 starts/min, far below the 80 RPM provider tier for 2K."""
    try:
        return max(1, min(80, int(os.environ.get("AGNES_IMAGE_RPM", "12"))))
    except (TypeError, ValueError):
        return 12


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
    def __init__(self, path, clock=time.time, sleep=time.sleep, state=None):
        self.path = Path(path)
        self.db = database(path)
        self.clock, self.sleep = clock, sleep
        self.state = state if state is not None else agnes_authority(clock)
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
        rpm = image_rpm()
        while True:
            now = self.clock()
            self.db.execute("DELETE FROM starts WHERE at<=?", (now - 60,))
            pause = self.db.execute("SELECT until FROM throttle WHERE id=1").fetchone()
            starts = [r[0] for r in self.db.execute("SELECT at FROM starts ORDER BY at")]
            wait = max(0, (pause[0] - now) if pause else 0,
                       (starts[len(starts) - rpm] + 60.05 - now) if len(starts) >= rpm else 0)
            if deadline is not None and now+wait+reserve>deadline:
                raise ValueError("presupuesto de preparación agotado")
            if wait > 0:
                self.sleep(wait)
                continue
            self.db.execute("INSERT INTO starts VALUES(?)", (now,))
            return

    def generate(self, match, slot, prompt, out, call=request_json, size="2K", ratio="9:16", expires_at=None, attempt_deadline=None):
        if slot not in range(4):
            raise ValueError("máximo cuatro imágenes por encuentro")
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
            model = os.environ.get("AGNES_IMAGE_MODEL", MODEL)
            recovery = out / f"{slot}.response.json"
            if recovery.exists():
                try:
                    cached = json.loads(recovery.read_text())
                    expected_hash = hashlib.sha256(prompt.encode()).hexdigest()
                    remote = self.state.status(match, 'image', slot)
                    if (cached.get('version') != 1 or cached.get('matchId') != match or cached.get('ordinal') != slot
                        or cached.get('promptHash') != expected_hash or cached.get('model') != model
                        or not remote or remote.get('attemptId') != cached.get('attemptId')
                        or remote.get('promptHash') != expected_hash or remote.get('model') != model
                        or remote.get('state') not in ('completed', 'uncertain')):
                        raise ValueError("recuperación local incompatible; no se regenera")
                    if remote['state'] != 'completed':
                        self.state.event(cached['attemptId'], 'completed')
                    self.db.execute("INSERT OR IGNORE INTO images VALUES(?,?,?,NULL)", (match, slot, 'pending'))
                    return self.materialize(match, slot, prompt, model, cached['attemptId'], cached['result'], out, size, ratio, recovery)
                except (OSError, KeyError, TypeError, json.JSONDecodeError):
                    raise ValueError("recuperación local inválida; no se regenera") from None
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
                while True:
                    admission = self.state.reserve(match, 'image', slot, prompt, model, deadline)
                    if admission.get('canPost'):
                        break
                    retry_at = admission.get('retryAtMs', 0) / 1000
                    if retry_at > self.clock() and (attempt_deadline is None or retry_at + timeout + 35 <= attempt_deadline):
                        self.sleep(retry_at - self.clock())
                        continue
                    raise ValueError(admission.get('reason', 'autoridad Agnes no concedió permiso'))
                attempt_id = admission['attemptId']
                self.db.execute("INSERT OR REPLACE INTO images VALUES(?,?,?,NULL)", (match, slot, "pending"))
                try:
                    result = call("https://apihub.agnes-ai.com/v1/images/generations", {
                        "model": model, "prompt": prompt, "size": size, "ratio": ratio,
                        "return_base64": True,
                    }, {"Authorization": "Bearer " + key}, timeout=timeout)
                    self.state.event(attempt_id, 'completed')
                    break
                except urllib.error.HTTPError as error:
                    if error.code == 429:
                        try:
                            raw = error.read(4097)
                            payload = json.loads(raw) if raw else {}
                            def has_identifier(value):
                                if isinstance(value, dict):
                                    return any(k in ('id', 'video_id', 'task_id', 'generation_id') and v for k, v in value.items()) or any(has_identifier(v) for v in value.values())
                                return isinstance(value, list) and any(has_identifier(v) for v in value)
                            rejected = len(raw) <= 4096 and not has_identifier(payload)
                        except (OSError, ValueError):
                            rejected = False
                        finally:
                            error.close()
                        if not rejected:
                            self.db.execute("UPDATE images SET status='uncertain' WHERE match_id=? AND slot=?", (match, slot))
                            self.state.event(attempt_id, 'uncertain', httpStatus=429, stage='create')
                            raise ValueError('Agnes HTTP 429 con resultado incierto; no se repite') from None
                        self.db.execute("UPDATE images SET status='limited' WHERE match_id=? AND slot=?", (match, slot))
                        until = self.clock() + retry_seconds(error.headers.get("Retry-After"))
                        self.state.event(attempt_id, 'hard-rejected-429', httpStatus=429, provenRejected=True,
                                         retryAfterMs=max(0, until-self.clock())*1000)
                        self.db.execute("INSERT OR REPLACE INTO throttle VALUES(1,?)", (until,))
                        if attempt == 0:
                            continue
                        self.db.execute("UPDATE images SET status='limited' WHERE match_id=? AND slot=?", (match, slot))
                        raise ValueError("Agnes HTTP 429 repetido; generación detenida") from None
                    error.close()
                    self.db.execute("UPDATE images SET status='failed' WHERE match_id=? AND slot=?", (match, slot))
                    self.state.event(attempt_id, 'uncertain', httpStatus=error.code, stage='create')
                    raise ValueError(f"Agnes HTTP {error.code}") from None
                except (TimeoutError, socket.timeout, urllib.error.URLError):
                    self.db.execute("UPDATE images SET status='uncertain' WHERE match_id=? AND slot=?", (match, slot))
                    self.state.event(attempt_id, 'uncertain', stage='create')
                    raise ValueError("Agnes timeout/red: resultado incierto, no se repite") from None
            # Keep the response before decoding/downloading: successful requests are not lost.
            recovery = out / f"{slot}.response.json"
            encoded_result = json.dumps(result)
            root = out.parent
            cached_bytes = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
            if cached_bytes + len(encoded_result.encode()) * 2 > 128_000_000:
                self.db.execute("UPDATE images SET status='uncertain' WHERE match_id=? AND slot=?", (match,slot))
                raise ValueError("caché de imágenes llena; resultado incierto")
            atomic_json(recovery, {'version': 1, 'matchId': match, 'ordinal': slot,
                                   'promptHash': hashlib.sha256(prompt.encode()).hexdigest(),
                                   'model': model, 'attemptId': attempt_id, 'result': result})
            return self.materialize(match, slot, prompt, model, attempt_id, result, out, size, ratio, recovery)

    def materialize(self, match, slot, prompt, model, attempt_id, result, out, size, ratio, recovery):
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
            saved = {"attemptId": attempt_id, "path": str(path.resolve()), "file": path.name, "width": dimensions["width"],
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
        state = os.environ.get("AGNES_STATE_DB", str(Path(args.out).parents[1] / "agnes.sqlite"))
        pool = ImagePool(state)
        print(json.dumps(pool.generate(args.match, args.index, Path(args.prompt_file).read_text(), args.out, size=args.size, ratio=args.ratio, expires_at=args.expires_at, attempt_deadline=args.attempt_deadline)))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
