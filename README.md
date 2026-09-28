# Instant Zarbo Viewer

Репозиторий: <https://github.com/bykovser/InstantZarboViewer>

Blender → LAN-превью в браузере (three.js, совпадает с model-viewer) → публикация в Zarbo.
Переписывание `zarbo_viewer_lan` 2.4 с нуля. Устройство — в [ARCHITECTURE.md](ARCHITECTURE.md).

## Сборка

```bash
cd web && npm install && npm run build   # → addon/web_dist
```

Затем упаковать `addon/` как Blender Extension:

```bash
blender --command extension build --source-dir addon --output-dir dist
```

## Разработка вьювера

1. В Blender: Export and View (поднимает сервер на :8080).
2. `cd web && npm run dev` — Vite проксирует `/api` и `/session` в Blender.

Без Blender: `http://localhost:5173/?model=/path/to/model.glb`.

## HTTPS

Для WebXR/камеры на телефоне положить `cert.pem` и `key.pem` в `addon/certs/` и включить HTTPS в настройках аддона.
