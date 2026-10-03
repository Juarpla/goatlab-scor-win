"""Durable per-chat series and background outbox. Run --help for CLI commands."""
import argparse
import concurrent.futures
import fcntl
import json
import os
import signal
import subprocess
import sys
import time
import uuid
import hashlib
import shutil
import urllib.error
from pathlib import Path

from common import atomic_json, database, request_json, telegram
from telegram_input import chat_id, file_id

SKILL = Path(__file__).resolve().parents[1]
ROOT = next((p for p in SKILL.parents if (p / "public/data").exists()), Path.cwd())
REPO = Path(os.environ.get("GOATLAB_REPO", str(ROOT)))
STATE = Path(os.environ.get("GOATLAB_STATE_DIR", str(REPO / ".cache/goatlab")))


class Workflow:
    def __init__(self, path=None, clock=time.time):
        self.clock = clock
        self.state = Path(path).parent if path else STATE
        self.db = database(path or STATE / "goatlab.sqlite")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS choices(chat TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS series(
          id TEXT PRIMARY KEY, chat TEXT NOT NULL, match_id TEXT NOT NULL,
          payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
          closed INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS active_chat ON series(chat) WHERE active=1;
        CREATE TABLE IF NOT EXISTS audios(
          id TEXT PRIMARY KEY, series_id TEXT NOT NULL, event TEXT NOT NULL,
          ordinal INTEGER NOT NULL, file_id TEXT NOT NULL, cancelled INTEGER DEFAULT 0,
          UNIQUE(series_id,event));
        CREATE TABLE IF NOT EXISTS tasks(
          id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
          next_at REAL NOT NULL DEFAULT 0, result TEXT, error TEXT);
        """)

        for table in ("tasks", "choices"):
            if "created" not in {r[1] for r in self.db.execute(f"PRAGMA table_info({table})")}:
                self.db.execute(f"ALTER TABLE {table} ADD COLUMN created REAL NOT NULL DEFAULT 0")
                self.db.execute(f"UPDATE {table} SET created=? WHERE created=0", (self.clock(),))

    def cleanup(self, protected=()):
        """Only temporary GoatLab state; never touch OpenClaw session files."""
        cutoff = self.clock() - 86400
        for row in self.db.execute("SELECT chat FROM series WHERE active=1 AND created<=?", (cutoff,)).fetchall():
            self.reset(row[0])
        protected = set(protected)
        for row in self.db.execute("SELECT id FROM tasks WHERE created<=? AND status!='running'", (cutoff,)).fetchall():
            if row[0] not in protected:
                self.db.execute("DELETE FROM tasks WHERE id=?", (row[0],))
        self.db.execute("DELETE FROM audios WHERE series_id IN (SELECT id FROM series WHERE created<=?)", (cutoff,))
        self.db.execute("DELETE FROM series WHERE created<=?", (cutoff,))
        self.db.execute("DELETE FROM choices WHERE created<=?", (cutoff,))

    def release_media(self, protected=()):
        out = Path(os.environ.get("MEDIA_PACK_DIR", str(STATE / "media-pack")))
        from render_ledger import Ledger
        records = {r["id"]: r for r in Ledger(self.state / "render-ledger").records()}
        needed = {r[0] for r in self.db.execute("SELECT match_id FROM series WHERE active=1 AND closed=0 AND created>?", (self.clock()-86400,))}
        for task in self.db.execute("SELECT * FROM tasks WHERE kind IN ('render','media','cancel')"):
            body = json.loads(task['payload'])
            if task['id'] in protected or (task['kind'] != 'cancel' and task['status'] in ('queued','running','failed')):
                needed.add(body['matchId'])
            elif task['kind'] == 'render' and task['status'] in ('done','cancelled'):
                result = json.loads(task['result'] or 'null')
                if isinstance(result, dict) and result.get('jobId'):
                    state = records.get(result['jobId'], {}).get('status')
                    if state not in ('done','cancelled'):
                        needed.add(body['matchId'])
                    else:
                        minimal = {k: body[k] for k in ('matchId','chatId','requestId','expiresAt') if k in body}
                        self.db.execute("UPDATE tasks SET status='delivered',payload=? WHERE id=?", (json.dumps(minimal), task['id']))
                        self.db.execute("UPDATE audios SET file_id='' WHERE id=?", (task['id'],))
        if not out.exists():
            return
        for path in out.iterdir():
            match = path.stem.removesuffix('.progress')
            if path.name == 'gen':
                for folder in path.iterdir():
                    if folder.name not in needed:
                        shutil.rmtree(folder, ignore_errors=True)
            elif match not in needed and path.is_file():
                path.unlink(missing_ok=True)
                self.db.execute("DELETE FROM tasks WHERE id=? AND status!='running'", ('media:'+match,))
        pending = STATE / 'pending'
        for path in pending.glob('*/*.json'):
            if path.stat().st_mtime <= self.clock()-86400:
                path.unlink(missing_ok=True)

    def task(self, key, kind, payload):
        self.db.execute("INSERT OR IGNORE INTO tasks(id,kind,payload,created) VALUES(?,?,?,?)",
                        (key, kind, json.dumps(payload), self.clock()))

    def current(self, chat):
        return self.db.execute("SELECT * FROM series WHERE chat=? AND active=1 AND created>?", (chat_id(chat), self.clock()-86400)).fetchone()

    def import_pending(self, directory):
        """Recover pre-Python pending JSONs without guessing the agent's audio counter."""
        for path in Path(directory).glob("*/*.json"):
            try:
                body = json.loads(path.read_text())
                if not all(body.get(k) is not None for k in ["chatId", "matchId", "variant", "audioFileId"]):
                    continue
                key = "legacy-" + hashlib.sha256(json.dumps([str(body["chatId"]), body["matchId"], body["variant"], body["audioFileId"]]).encode()).hexdigest()[:32]
                if path.stat().st_mtime + 86400 <= self.clock():
                    path.unlink()
                    continue
                body["expiresAt"] = int((path.stat().st_mtime + 86400) * 1000)
                body["requestId"] = key
                self.task("media:" + body["matchId"], "media", {"matchId": body["matchId"]})
                self.task(key, "render", body)
            except (ValueError, TypeError):
                print("workflow: pendiente antiguo inválido", file=sys.stderr)

    def select(self, chat, script):
        if len(script.get('scripts', [])) != 10 or not script.get('matchId') or Path(script['matchId']).name != script['matchId']:
            raise ValueError('se requiere un partido válido con diez guiones')
        chat = chat_id(chat)
        self.db.execute("BEGIN IMMEDIATE")
        try:
            if self.current(chat):
                raise ValueError("ya hay una serie activa; /start la reinicia")
            sid = uuid.uuid4().hex
            match = script["matchId"]
            self.db.execute("INSERT INTO series(id,chat,match_id,payload,created) VALUES(?,?,?,?,?)",
                            (sid, chat, match, json.dumps(script), self.clock()))
            self.task("media:" + match, "media", {"matchId": match})
            self.db.execute("UPDATE tasks SET status='queued',next_at=0 WHERE id=? AND status='cancelled'", ("media:"+match,))
            self.db.execute("COMMIT")
            return {"seriesId": sid, "matchId": match, "scripts": script["scripts"]}
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def receive(self, chat, file_id, event):
        chat = chat_id(chat)
        self.db.execute("BEGIN IMMEDIATE")
        try:
            series = self.current(chat)
            if not series:
                raise ValueError("envía /goatlab antes del audio")
            prior = self.db.execute("SELECT * FROM audios WHERE series_id=? AND event=?",
                                    (series["id"], str(event))).fetchone()
            if prior:
                self.db.execute("COMMIT")
                return {"duplicate": True, "n": prior["ordinal"], "requestId": prior["id"]}
            if series["closed"]:
                raise ValueError("la serie ya recibió diez audios; /start inicia otra")
            n = self.db.execute("SELECT COALESCE(MAX(ordinal),0)+1 FROM audios WHERE series_id=? AND cancelled=0",
                                (series["id"],)).fetchone()[0]
            aid = uuid.uuid4().hex
            self.db.execute("INSERT INTO audios(id,series_id,event,ordinal,file_id) VALUES(?,?,?,?,?)",
                            (aid, series["id"], str(event), n, file_id))
            script = json.loads(series["payload"])
            shot = script["scripts"][n - 1]
            self.task(aid, "render", {
                "expiresAt": int((series["created"] + 86400) * 1000),
                "requestId": aid, "seriesId": series["id"], "chatId": str(chat),
                "matchId": series["match_id"], "variant": n - 1,
                "home": script.get("home", ""), "away": script.get("away", ""),
                "matchLabel": script.get("match") or f'{script.get("home", "")} contra {script.get("away", "")}',
                "hook": shot.get("hook", ""), "title": shot.get("title", ""), "audioFileId": file_id,
            })
            if n == 10:
                self.db.execute("UPDATE series SET closed=1 WHERE id=?", (series["id"],))
            self.db.execute("COMMIT")
            return {"n": n, "requestId": aid, "closed": n == 10}
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def cancel_audio(self, audio):
        task = self.db.execute("SELECT payload FROM tasks WHERE id=?", (audio["id"],)).fetchone()
        self.db.execute("UPDATE audios SET cancelled=1 WHERE id=?", (audio["id"],))
        self.db.execute("UPDATE tasks SET status='cancelled' WHERE id=?", (audio["id"],))
        if task:
            body = json.loads(task["payload"])
            minimal = {k: body[k] for k in ("matchId","chatId","requestId","expiresAt") if k in body}
            self.task("cancel:" + audio["id"], "cancel", minimal)
            self.db.execute("UPDATE tasks SET payload=? WHERE id=?", (json.dumps(minimal), audio["id"]))
            self.db.execute("UPDATE audios SET file_id='' WHERE id=?", (audio["id"],))

    def drop_last(self, chat):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            series = self.current(chat)
            if not series:
                raise ValueError("no hay una serie activa")
            audio = self.db.execute("SELECT * FROM audios WHERE series_id=? AND cancelled=0 ORDER BY ordinal DESC LIMIT 1",
                                    (series["id"],)).fetchone()
            if not audio:
                raise ValueError("no hay un audio para sustituir")
            self.cancel_audio(audio)
            self.db.execute("UPDATE series SET closed=0 WHERE id=?", (series["id"],))
            self.db.execute("COMMIT")
            return {"reuses": audio["ordinal"]}
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def reset(self, chat):
        chat = str(chat)  # preserve ability to discard a legacy prefixed series
        self.db.execute("BEGIN IMMEDIATE")
        try:
            series = self.db.execute("SELECT * FROM series WHERE chat=? AND active=1", (str(chat),)).fetchone()
            if series:
                for audio in self.db.execute("SELECT * FROM audios WHERE series_id=? AND cancelled=0", (series["id"],)).fetchall():
                    self.cancel_audio(audio)
                if not self.db.execute("SELECT 1 FROM series WHERE match_id=? AND active=1 AND id!=?", (series['match_id'], series['id'])).fetchone():
                    self.db.execute("UPDATE tasks SET status='cancelled' WHERE id=? AND status IN ('queued','failed','running')", ('media:'+series['match_id'],))
                self.db.execute("DELETE FROM choices WHERE chat=?", (str(chat),))
                self.db.execute("UPDATE series SET active=0,payload='{}' WHERE id=?", (series["id"],))
            for task in self.db.execute("SELECT id,payload FROM tasks WHERE kind='render' AND status NOT IN ('cancelled','done')").fetchall():
                if str(json.loads(task['payload']).get('chatId')) == str(chat):
                    self.cancel_audio(task)
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise
        (self.state / ".cleanup-request").parent.mkdir(parents=True, exist_ok=True)
        (self.state / ".cleanup-request").touch()
        return {"reset": True}


def worker_post(path, body):
    url = os.environ.get("WORKER_URL", "https://goatlab-render.fly.dev").rstrip("/")
    headers = {"Authorization": "Bearer " + os.environ.get("RENDER_SECRET", "")}
    # Gateway is deployed first. Never submit to a worker with the old contract.
    if request_json(url + "/healthz", headers=headers, timeout=15).get("workflowProtocol") != 2:
        return None
    return request_json(url + path, body, headers)


def render_status(audio):
    """On-demand status; outbox completion only means the HTTP job was accepted."""
    result = json.loads(audio.get('result') or 'null')
    if audio.get('cancelled') or not isinstance(result, dict) or not result.get('jobId'):
        return audio
    try:
        url = os.environ.get('WORKER_URL', 'https://goatlab-render.fly.dev').rstrip('/')
        job = request_json(url + '/jobs/' + result['jobId'], headers={'Authorization': 'Bearer ' + os.environ.get('RENDER_SECRET', '')}, timeout=10)
        audio['render'] = {key: job.get(key) for key in ['id', 'status', 'error', 'stages', 'messageId', 'creditsError']}
    except Exception:
        audio['render'] = {'id': result['jobId'], 'status': 'unavailable'}
    return audio


def execute(task):
    body = json.loads(task["payload"])
    out = Path(os.environ.get("MEDIA_PACK_DIR", str(STATE / "media-pack")))
    match = body["matchId"]
    if task["kind"] == "render" and body.get("expiresAt", time.time()*1000+1) <= time.time()*1000:
        raise ValueError("solicitud caducada")
    if task["kind"] == "media":
        ready = out / f"{match}.ready"
        if not ready.exists():
            out.mkdir(parents=True, exist_ok=True)
            env = {**os.environ, "GOATLAB_REPO": str(REPO), "AGNES_STATE_DB": str(STATE / "agnes.sqlite")}
            with (out / f"{match}.log").open("a") as log:
                subprocess.run(["node", str(SKILL / "scripts/generate-media-pack.mjs"), f"--match={match}", f"--out={out}"],
                               cwd=REPO, env=env, stdout=log, stderr=log, check=True)
            manifest = json.loads((out / f"{match}.json").read_text())
            atomic_json(ready, {"assets": len(manifest["assets"])})
        return {"ready": True}
    if task["kind"] == "cancel":
        return worker_post("/render/cancel", body)
    ready = out / f"{match}.ready"
    if not ready.exists():
        return None
    manifest = json.loads((out / f"{match}.json").read_text())
    if not body.get('assets'):
        body.update(assets=manifest["assets"], attribution=manifest.get("attribution", ""), facts=manifest.get('facts',[]), mediaMinimum=8)
    return worker_post("/render", body)


def supervise():
    STATE.mkdir(parents=True, exist_ok=True)
    lock = (STATE / "workflow.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    from render_ledger import serve
    ledger_server = serve(STATE)
    flow = Workflow()
    from progress import ProgressReporter
    reporter=ProgressReporter(flow) if os.environ.get('TELEGRAM_BOT_TOKEN') else None
    flow.import_pending(STATE / "pending")
    flow.db.execute("UPDATE tasks SET status='queued' WHERE status='running'")
    flow.cleanup()
    stopping = False
    def stop(*_):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    futures = {}
    last_cleanup = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        while not stopping or futures:
            if reporter and not stopping and time.time()>=reporter.next:
                from render_ledger import Ledger
                reporter.update(Ledger(STATE/'render-ledger').records())
            if time.time() - last_cleanup >= 300 or (STATE / ".cleanup-request").exists():
                protected = [t["id"] for t in futures.values()]
                from render_ledger import Ledger
                Ledger(STATE / "render-ledger").records()
                flow.cleanup(protected)
                flow.release_media(protected)
                (STATE / ".cleanup-request").unlink(missing_ok=True)
                if not any(t["kind"] == "media" for t in futures.values()):
                    from agnes import ImagePool
                    pool_state = ImagePool(STATE / "agnes.sqlite")
                    pool_state.cleanup()
                    pool_state.db.close()
                last_cleanup = time.time()
            for future, task in list(futures.items()):
                if not future.done():
                    continue
                del futures[future]
                # Cancellation can happen while an HTTP request is in flight.
                current = flow.db.execute("SELECT status FROM tasks WHERE id=?", (task["id"],)).fetchone()[0]
                try:
                    result = future.result()
                    if current == "cancelled":
                        if task["kind"] == "render":
                            flow.db.execute("UPDATE tasks SET status='queued',next_at=0 WHERE id=?", ("cancel:" + task["id"],))
                        continue
                    status = "done" if result is not None else "queued"
                    flow.db.execute("UPDATE tasks SET status=?,result=?,next_at=? WHERE id=?",
                                    (status, json.dumps(result), time.time() + 3, task["id"]))
                except Exception as error:
                    if current == "cancelled":
                        continue
                    attempts = task["attempts"] + 1
                    failed = task["kind"] == "media" or attempts >= 5
                    reason = f'HTTP {error.code}' if isinstance(error, urllib.error.HTTPError) else f'proceso {error.returncode}' if isinstance(error, subprocess.CalledProcessError) else type(error).__name__
                    print(f'workflow: {task["id"]} {task["kind"]}: {reason}', file=sys.stderr)
                    flow.db.execute("UPDATE tasks SET status=?,attempts=?,next_at=?,error=? WHERE id=?",
                                    ("failed" if failed else "queued", attempts, time.time() + min(300, 5 * 2 ** attempts),
                                     f"La tarea no se pudo completar ({reason}); consulta el registro local.", task["id"]))
                    if failed:
                        body = json.loads(task["payload"])
                        chats = [body["chatId"]] if "chatId" in body else [r[0] for r in flow.db.execute(
                            "SELECT DISTINCT chat FROM series WHERE match_id=? AND active=1", (body["matchId"],))]
                        for chat in chats:
                            try:
                                text = "❌ Fotos: no se pudo completar la búsqueda. Puedes pedir reintentar fotos." if task["kind"] == "media" else "No pude enviar un trabajo a Render. Puedes pedir reintentar el video."
                                telegram("sendMessage", {"chat_id": chat, "text": text})
                            except Exception:
                                print("workflow: aviso de fallo no entregado", file=sys.stderr)
            if not stopping:
                media_running = any(t["kind"] == "media" for t in futures.values())
                render_running = any(t["kind"] == "render" for t in futures.values())
                first_by_chat = {}
                for pending in flow.db.execute("SELECT id,payload FROM tasks WHERE kind='render' AND status IN ('queued','running','failed') ORDER BY rowid"):
                    first_by_chat.setdefault(str(json.loads(pending['payload'])['chatId']), pending['id'])
                rows = flow.db.execute("SELECT * FROM tasks WHERE status='queued' AND next_at<=? ORDER BY CASE kind WHEN 'cancel' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,rowid", (time.time(),)).fetchall()
                for task in rows:
                    if len(futures) >= 3:
                        break
                    if task["kind"] == "media" and media_running:
                        continue
                    if task["kind"] == "render":
                        body = json.loads(task["payload"])
                        if render_running or first_by_chat.get(str(body['chatId'])) != task['id']:
                            continue
                        if not (Path(os.environ.get("MEDIA_PACK_DIR", str(STATE / "media-pack"))) / f'{body["matchId"]}.ready').exists():
                            continue
                        if not body.get('assets'):
                            manifest=json.loads((Path(os.environ.get('MEDIA_PACK_DIR',str(STATE/'media-pack')))/f'{body["matchId"]}.json').read_text())
                            body.update(assets=manifest['assets'],attribution=manifest.get('attribution',''),facts=manifest.get('facts',[]), mediaMinimum=8)
                            payload=json.dumps(body)
                            flow.db.execute('UPDATE tasks SET payload=? WHERE id=?',(payload,task['id']))
                            task=dict(task); task['payload']=payload
                    flow.db.execute("UPDATE tasks SET status='running' WHERE id=?", (task["id"],))
                    futures[pool.submit(execute, dict(task))] = dict(task)
                    media_running |= task["kind"] == "media"
                    render_running |= task["kind"] == "render"
            busy = STATE / ".busy"
            if futures:
                busy.touch()
            else:
                busy.unlink(missing_ok=True)
            time.sleep(1)
    (STATE / ".busy").unlink(missing_ok=True)
    ledger_server.shutdown()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["list", "select", "receive", "enqueue", "drop-last", "reset", "retry", "status", "busy", "supervise"])
    parser.add_argument("--chat")
    parser.add_argument("--number", type=int)
    parser.add_argument("--audio")
    parser.add_argument("--event", help="Telegram message_id, stable across repeated tool calls")
    parser.add_argument("--request", help="requestId to retry; omitted = retry media")
    parser.add_argument("--match", help="compatibility adapter for an already selected match")
    args = parser.parse_args()
    if args.command == "supervise":
        supervise()
        return
    flow = Workflow()
    flow.cleanup()
    if args.command == "busy":
        pending = flow.db.execute("SELECT COUNT(*) FROM tasks WHERE status='running' OR (status='queued' AND kind IN ('media','cancel'))").fetchone()[0]
        from render_ledger import Ledger
        remote_busy = any(r.get("status") in ("queued","working","delivering") for r in Ledger(STATE / "render-ledger").records())
        print(json.dumps({"busy": bool(pending) or remote_busy}))
        return
    if not args.chat:
        parser.error("--chat es obligatorio")
    args.chat = chat_id(args.chat)
    if args.command == "list":
        if (REPO / ".git").exists():
            subprocess.run(["git", "pull", "--ff-only"], cwd=REPO, check=True, stdout=sys.stderr)
        scripts = [json.loads(p.read_text()) for p in sorted((REPO / "public/data/youtube-scripts").glob("*.json"))]
        if not scripts:
            raise ValueError("no hay guiones disponibles")
        flow.db.execute("INSERT OR REPLACE INTO choices(chat,payload,created) VALUES(?,?,?)", (args.chat, json.dumps(scripts), flow.clock()))
        result = [{"number": i + 1, **{k: s.get(k) for k in ["matchId", "match", "home", "away", "competition", "kickoff"]}} for i, s in enumerate(scripts)]
    elif args.command == "select":
        row = flow.db.execute("SELECT payload FROM choices WHERE chat=?", (args.chat,)).fetchone()
        if not row or not args.number or not 1 <= args.number <= len(json.loads(row[0])):
            raise ValueError("elige un número de la lista actual")
        result = flow.select(args.chat, json.loads(row[0])[args.number - 1])
    elif args.command in {"receive", "enqueue"}:
        if args.command == "enqueue" and not flow.current(args.chat):
            if not args.match or Path(args.match).name != args.match:
                raise ValueError("match inválido")
            script = json.loads((REPO / "public/data/youtube-scripts" / f"{args.match}.json").read_text())
            flow.select(args.chat, script)
        if args.command == "enqueue" and flow.current(args.chat)["match_id"] != args.match:
            raise ValueError("el partido no coincide con la serie activa")
        if not args.audio or (args.command == "receive" and not args.event):
            parser.error("receive requiere --audio y --event")
        result = flow.receive(args.chat, file_id(args.audio), args.event or args.audio)
    elif args.command == "drop-last":
        result = flow.drop_last(args.chat)
    elif args.command == "reset":
        result = flow.reset(args.chat)
    elif args.command == "retry":
        series = flow.current(args.chat)
        if not series:
            raise ValueError("no hay una serie activa")
        key = args.request or "media:" + series["match_id"]
        if args.request:
            audio = flow.db.execute("SELECT 1 FROM audios WHERE id=? AND series_id=? AND cancelled=0", (key, series["id"])).fetchone()
            if not audio:
                raise ValueError("el trabajo no pertenece a la serie")
            from render_ledger import Ledger
            remote=next((r for r in Ledger(STATE/'render-ledger').records() if r.get('requestId')==key),None)
            if remote and remote.get('status') in ('done','delivering','delivery-unknown','working','queued'):
                raise ValueError('no se reintenta una entrega completada, incierta o en curso')
            row=flow.db.execute('SELECT payload FROM tasks WHERE id=?',(key,)).fetchone()
            if row:
                body=json.loads(row[0])
                for field in ('assets','attribution','facts'):body.pop(field,None)
                flow.db.execute('UPDATE tasks SET payload=? WHERE id=?',(json.dumps(body),key))
        flow.db.execute("UPDATE tasks SET status='queued',attempts=0,next_at=0 WHERE id=? AND status IN ('failed','done')", (key,))
        result = {"retry": key}
    else:
        series = flow.current(args.chat)
        result = dict(series) if series else None
        if result:
            result.pop("payload")
            audios = [dict(r) for r in flow.db.execute("SELECT a.ordinal,a.id AS requestId,a.cancelled,t.status,t.result FROM audios a JOIN tasks t ON a.id=t.id WHERE series_id=? ORDER BY ordinal", (series["id"],))]
            if args.number is not None:
                audios = [audio for audio in audios if audio['ordinal'] == args.number]
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                result['audios'] = list(pool.map(render_status, audios))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # urllib exceptions can contain credential-bearing Telegram URLs.
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
