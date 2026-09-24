"""LAN server: viewer bundle at /, session files at /session/*, manifest at /api/scene, SSE at /api/events."""
import socket
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


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, session_dir: Path, **kwargs):
        self.session_dir = session_dir
        super().__init__(*args, directory=str(WEB_DIST), **kwargs)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/events":
            events.stream(self)
            return
        super().do_GET()

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
