"""LAN server: viewer bundle at /, session files at /session/*, manifest at /api/scene, SSE at /api/events,
Zarbo API proxy at /api/zarbo/* (the key stays in Blender preferences; only this machine may use it)."""
import json
import re
import socket
import time
import traceback
import urllib.error
import urllib.request
import ssl
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from . import events

ADDON_DIR = Path(__file__).resolve().parent.parent
WEB_DIST = ADDON_DIR / "web_dist"
CERT_DIR = ADDON_DIR / "certs"

_server: ThreadingHTTPServer | None = None
_scheme = "http"
_zarbo = {"host": "", "input": "", "key": ""}
LOCAL = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
_SCHEME = re.compile(r"^https?://", re.I)
# Список коллекций греем заранее (при старте сервера) и отдаём из кеша: к моменту, когда
# открывают вкладку «Экспорт», он уже на руках. Свежий запрос — через ?refresh=1.
_cache = {"collections": None, "at": 0.0, "key": "", "host": "", "error": ""}
# Последняя публикация: ссылку показываем панели заново после перезагрузки/закрытия вкладки.
_last_publish = {"url": "", "name": "", "at": 0.0}
# Последние запросы прокси: по нему видно, дошёл ли запрос из браузера и чем кончился.
_trace: list = []
_store_path: Path | None = None
CACHE_TTL = 60


def _fetch_collections(host: str, key: str):
    req = urllib.request.Request(
        host + "/api/v1/collections/",
        headers={"Authorization": f"Api-Key {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8") or "[]")


def warm_collections():
    """Тянем коллекции в фоне сразу после старта сервера. Ключ/хост берём из того, что
    уже разложено в _zarbo; без них тихо выходим (панель потом отдаст понятную ошибку)."""
    host, key = _zarbo["host"], _zarbo["key"]
    if not (host and key):
        return

    def run():
        try:
            data = _fetch_collections(host, key)
        except urllib.error.HTTPError as e:
            _cache.update(collections=None, at=0.0, key=key, host=host,
                          error=f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:120]}")
            return
        except (urllib.error.URLError, ValueError, OSError) as e:
            _cache.update(collections=None, at=0.0, key=key, host=host, error=str(e)[:120])
            return
        _cache.update(collections=data, at=time.time(), key=key, host=host, error="")

    threading.Thread(target=run, daemon=True, name="izv-zarbo-warm").start()


def _retarget(url: str, *pairs) -> str:
    """Меняет префикс хоста: app-sergkey.zarbo.works → api-sergkey.zarbo.works."""
    parsed = urlsplit(url)
    netloc = parsed.netloc
    for src, dst in pairs:
        if netloc.startswith(src):
            netloc = dst + netloc[len(src):]
            break
    return f"{parsed.scheme}://{netloc}"


def _self_addresses() -> set:
    """Кому отдаём ключ Zarbo: loopback плюс собственные адреса машины. Вьювер часто
    открывают по LAN-адресу (http://192.168.x.x:8090) — тогда клиент приходит именно с
    него. Телефон в той же сети приходит с чужого IP и по-прежнему получает 403."""
    addrs = set(LOCAL)
    for getter in (local_ip, lambda: socket.gethostbyname(socket.gethostname())):
        try:
            addrs.add(getter())
        except OSError:
            pass
    return addrs


def _is_self(addr: str) -> bool:
    return (addr[7:] if addr.startswith("::ffff:") else addr) in _self_addresses()


def api_host(raw: str) -> str:
    """Хост Zarbo из preferences. Можно вставлять и адрес страницы фронта
    (https://app-sergkey.zarbo.works/profile, где берут ключ), и сам API — фронт отдаёт
    HTML на любой путь, JSON умеет только api-*, поэтому путь отбрасываем, а app-/app.
    меняем на api-/api. Стенды устроены так же, как основной: app.zarbo.tech ↔ api.zarbo.tech."""
    host = (raw or "").strip().rstrip("/")
    if not host:
        return ""
    if not _SCHEME.match(host):
        host = "https://" + host
    return _retarget(host, ("app.", "api."), ("app-", "api-"))


def embed_host(host: str) -> str:
    if not host:
        return ""
    return _retarget(host, ("api.", "embed."), ("api-", "embed-"))


def _note(method: str, path: str, result: str):
    _trace.append(f"{time.strftime('%H:%M:%S')} {method} {path} -> {result}")
    del _trace[:-40]   # держим последние 40


def config_state() -> dict:
    """Состояние Zarbo-части: тот же ответ, что у GET /api/zarbo/config, — панель Blender
    читает его напрямую, без HTTP."""
    warm = None
    if (_cache["collections"] is not None and _cache["key"] == _zarbo["key"]
            and _cache["host"] == _zarbo["host"]):
        warm = {"count": len(_cache["collections"]), "age": round(time.time() - _cache["at"], 1)}
    return {
        "host": _zarbo["host"],
        "input": _zarbo["input"],
        "embed_host": embed_host(_zarbo["host"]),
        "configured": bool(_zarbo["key"] and _zarbo["host"]),
        "viewers": events.client_count(),
        "last_publish": _last_publish if _last_publish["url"] else None,
        "warm": warm,
        "warm_error": _cache["error"],
        "trace": list(_trace),
    }


def set_store(path):
    """Файл, где помним последнюю публикацию между запусками Blender (путь даёт bpy-сторона)."""
    global _store_path
    _store_path = Path(path) if path else None
    if _store_path and _store_path.is_file():
        try:
            _last_publish.update(json.loads(_store_path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass


def _save_last_publish():
    if not _store_path:
        return
    try:
        _store_path.parent.mkdir(parents=True, exist_ok=True)
        _store_path.write_text(json.dumps(_last_publish, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def set_zarbo(host: str, key: str):
    """Called on the main thread from preferences; the handler threads only read it."""
    new_host, new_key = api_host(host), (key or "").strip()
    if new_host != _zarbo["host"] or new_key != _zarbo["key"]:
        # Стенд или ключ поменяли — прошлая ошибка прогрева больше не про них.
        _cache.update(collections=None, at=0.0, error="")
    _zarbo.update(host=new_host, input=(host or "").strip(), key=new_key)


class Handler(SimpleHTTPRequestHandler):
    # Safari opens Quick Look only for the proper USDZ type; octet-stream just downloads.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".usdz": "model/vnd.usdz+zip",
        ".glb": "model/gltf-binary",
        ".hdr": "image/vnd.radiance",
        ".exr": "image/x-exr",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, session_dir: Path, **kwargs):
        self.session_dir = session_dir
        super().__init__(*args, directory=str(WEB_DIST), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/events":
            events.stream(self)
        elif path.startswith("/api/zarbo/"):
            self.zarbo()
        else:
            super().do_GET()

    def do_POST(self):
        self.zarbo()

    do_PATCH = do_DELETE = do_PUT = do_POST

    def _drain(self):
        """Дочитать тело запроса, даже если отвечаем не глядя в него: иначе Windows закрывает
        соединение с непрочитанными данными (RST), и браузер пишет «Failed to fetch» вместо
        нашего 403/503/405."""
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            try:
                self.rfile.read(length)
            except OSError:
                pass

    def reply(self, status: int, body: bytes, ctype: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def zarbo(self):
        if not self.path.startswith("/api/zarbo/"):
            self._drain()
            return self.reply(405, b'{"detail": "method not allowed"}')
        if not _is_self(self.client_address[0]):
            self._drain()
            return self.reply(403, json.dumps({"detail": "Zarbo доступен только с этого компьютера"}).encode())
        rest = self.path[len("/api/zarbo"):]
        query = ""
        if "?" in rest:
            rest, query = rest.split("?", 1)
            # refresh — наш флаг, наверх он не уезжает.
            query = "&".join(p for p in query.split("&") if p and not p.startswith("refresh"))
        if rest == "/config":
            return self.reply(200, json.dumps(config_state()).encode())
        if rest == "/publish" and self.command == "POST":
            # Чисто локальное: вкладку закрыли — ссылка на виджет не потерялась.
            length = int(self.headers.get("Content-Length") or 0)
            try:
                data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except ValueError:
                return self.reply(400, b'{"detail": "bad json"}')
            _last_publish.update({k: str(data[k]) for k in ("url", "name") if k in data}, at=time.time())
            _save_last_publish()
            return self.reply(200, json.dumps({"ok": True}).encode())
        if not _zarbo["host"]:
            self._drain()
            return self.reply(503, json.dumps({"detail": "Не задан хост Zarbo: Preferences → Add-ons → Instant Zarbo Viewer"}).encode())
        if not _zarbo["key"]:
            self._drain()
            return self.reply(503, json.dumps({"detail": "Нет API-ключа Zarbo: Preferences → Add-ons → Instant Zarbo Viewer"}).encode())
        if rest == "/collections/" and self.command == "GET" and "refresh" not in self.path:
            cached, age = _cache["collections"], time.time() - _cache["at"]
            if (cached is not None and _cache["key"] == _zarbo["key"]
                    and _cache["host"] == _zarbo["host"] and age < CACHE_TTL):
                return self.reply(200, json.dumps(cached).encode())
        # Дальше всё — поход наверх. Ошибка обязана стать ответом, а не оборванным
        # соединением: иначе браузер скажет «Failed to fetch» без причины.
        length = int(self.headers.get("Content-Length") or 0)
        headers = {"Authorization": f"Api-Key {_zarbo['key']}", "Accept": "application/json"}
        if self.headers.get("Content-Type"):
            headers["Content-Type"] = self.headers["Content-Type"]
        req = urllib.request.Request(
            _zarbo["host"] + "/api/v1" + rest + (("?" + query) if query else ""),
            data=self.rfile.read(length) if length else None,
            headers=headers, method=self.command,
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                body = resp.read()
                _note(self.command, rest, str(resp.status))
                if rest == "/collections/" and self.command == "GET":
                    try:
                        _cache.update(collections=json.loads(body.decode("utf-8")), at=time.time(),
                                      key=_zarbo["key"], host=_zarbo["host"])
                    except ValueError:
                        pass
                self.reply(resp.status, body, resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            _note(self.command, rest, str(e.code))
            self.reply(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except urllib.error.URLError as e:
            _note(self.command, rest, f"URLError {e.reason}")
            self.reply(502, json.dumps({"detail": f"Zarbo недоступен: {e.reason}"}).encode())
        except Exception as e:  # noqa: BLE001 — что угодно, но ответ уйти обязан
            _note(self.command, rest, f"{type(e).__name__}: {e}")
            traceback.print_exc()
            self.reply(502, json.dumps({"detail": f"{type(e).__name__}: {e}"}).encode())

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean == "/api/scene":
            return str(self.session_dir / "scene.json")
        if clean.startswith("/session/"):
            rel = Path(clean[len("/session/"):])
            target = (self.session_dir / rel).resolve()
            if self.session_dir.resolve() in target.parents:
                return str(target)
            return str(self.session_dir / "__forbidden__")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def is_running() -> bool:
    return _server is not None


def url() -> str | None:
    if _server is None:
        return None
    return f"{_scheme}://{local_ip()}:{_server.server_address[1]}/"


def start(session_dir: Path, port: int, use_https: bool) -> str:
    global _server, _scheme
    if _server is not None:
        return url()

    server = ThreadingHTTPServer(("", port), partial(Handler, session_dir=session_dir))
    server.daemon_threads = True
    if use_https:
        cert, key = CERT_DIR / "cert.pem", CERT_DIR / "key.pem"
        if not (cert.is_file() and key.is_file()):
            server.server_close()
            raise FileNotFoundError(f"HTTPS needs {cert} and {key}")
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)

    threading.Thread(target=server.serve_forever, daemon=True, name="izv-http").start()
    _server, _scheme = server, "https" if use_https else "http"
    warm_collections()
    return url()


def stop():
    global _server
    if _server is None:
        return
    events.close_all()
    _server.shutdown()
    _server.server_close()
    _server = None
