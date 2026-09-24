"""Server-Sent Events hub: Blender pushes, every connected viewer receives."""
import json
import queue
import threading

_clients: set[queue.Queue] = set()
_lock = threading.Lock()
_CLOSE = object()


def client_count() -> int:
    return len(_clients)


def broadcast(event: str, data) -> int:
    payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()
    with _lock:
        for q in _clients:
            q.put(payload)
        return len(_clients)


def close_all():
    with _lock:
        for q in _clients:
            q.put(_CLOSE)


def stream(handler):
    """Runs on the request thread until the viewer disconnects or the server stops."""
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Connection", "keep-alive")
    handler.end_headers()

    q: queue.Queue = queue.Queue()
    with _lock:
        _clients.add(q)
    try:
        handler.wfile.write(b"retry: 1000\n\n")
        handler.wfile.flush()
        while True:
            try:
                item = q.get(timeout=15)
            except queue.Empty:
                item = b": ping\n\n"
            if item is _CLOSE:
                break
            handler.wfile.write(item)
            handler.wfile.flush()
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        pass
    finally:
        with _lock:
            _clients.discard(q)
