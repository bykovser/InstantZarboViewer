// Blender -> viewer events over SSE. EventSource reconnects by itself (server sends retry: 1000).
export function connectLive(handlers, onStatus) {
  const es = new EventSource('./api/events');
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false);
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => fn(JSON.parse(e.data)));
  }
  return () => es.close();
}
