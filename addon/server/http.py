"""LAN server: viewer bundle at /, session files at /session/*, manifest at /api/scene, SSE at /api/events,
Zarbo API proxy at /api/zarbo/* (the key stays in Blender preferences; only this machine may use it)."""
import json
import socket
import urllib.error
import urllib.request
import ssl
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import events

ADDON_DIR = Path(__file__).resolve().parent.parent
WEB_DIST = ADDON_DIR / "web_dist"
CERT_DIR = ADDON_DIR / "certs"

_server: ThreadingHTTPServer | None = None
_scheme = "http"
_zarbo = {"host": "", "key": ""}
LOCAL = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}


def set_zarbo(host: str, key: str):
    """Called on the main thread from preferences; the handler threads only read it."""
    _zarbo.update(host=host.rstrip("/"), key=key)


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

    def reply(self, status: int, body: bytes, ctype: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def zarbo(self):
        if not self.path.startswith("/api/zarbo/"):
            return self.reply(405, b'{"detail": "method not allowed"}')
        if self.client_address[0] not in LOCAL:
            return self.reply(403, json.dumps({"detail": "Zarbo доступен только с этого компьютера"}).encode())
        rest = self.path[len("/api/zarbo"):]
        if rest == "/config":
            return self.reply(200, json.dumps({"host": _zarbo["host"], "configured": bool(_zarbo["key"])}).encode())
        if not _zarbo["key"]:
            return self.reply(503, json.dumps({"detail": "Нет API-ключа Zarbo: Preferences → Add-ons → Instant Zarbo Viewer"}).encode())
        length = int(self.headers.get("Content-Length") or 0)
        headers = {"Authorization": f"Api-Key {_zarbo['key']}", "Accept": "application/json"}
        if self.headers.get("Content-Type"):
            headers["Content-Type"] = self.headers["Content-Type"]
        req = urllib.request.Request(
            _zarbo["host"] + "/api/v1" + rest, data=self.rfile.read(length) if length else None,
            headers=headers, method=self.command,
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                self.reply(resp.status, resp.read(), resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self.reply(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except urllib.error.URLError as e:
            self.reply(502, json.dumps({"detail": f"Zarbo недоступен: {e.reason}"}).encode())

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
    return url()


def stop():
    global _server
    if _server is None:
        return
    events.close_all()
    _server.shutdown()
    _server.server_close()
    _server = None
