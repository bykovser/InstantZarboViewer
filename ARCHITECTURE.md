# InstantZarboViewer — архитектура

Переписывание `zarbo_viewer_lan` 2.4 (InstantMV) с нуля.

## Что делает

1. Экспортирует сцену из Blender (GLB и/или USDZ) + окружение (HDRI).
2. Показывает её в браузере по LAN (телефон/планшет) на собственном three.js-вьювере,
   визуально совпадающем с `<model-viewer>` (MV) — чтобы превью = то, что увидит клиент в виджете Zarbo.
3. Заливает результат в Zarbo (продукт → модель → виджет) и отдаёт embed-ссылку.

## Раскладка

```
InstantZarboViewer/
├── addon/                  Blender Extension (4.2+), чистый Python, без логики в __init__
│   ├── blender_manifest.toml
│   ├── __init__.py         только register/unregister по списку CLASSES
│   ├── preferences.py      порты, HTTPS, Zarbo host + Api-Key
│   ├── properties.py       PropertyGroup сцены (настройки вьювера/экспорта/zarbo)
│   ├── operators.py        тонкие операторы: собрать → экспорт → сервер/заливка
│   ├── panels.py           UI в N-панели
│   ├── session.py          «сессия просмотра»: папка + scene.json (манифест для веба)
│   ├── export/
│   │   ├── glb.py          bpy.ops.export_scene.gltf
│   │   ├── usdz.py         запуск Blender 4.1 в фоне → usdz_legacy_worker.py
│   │   └── hdri.py         HDRI из World / кастомный файл
│   ├── server/
│   │   └── http.py         один ThreadingHTTPServer, опц. TLS; раздаёт web/dist + сессию
│   └── zarbo/
│       └── client.py       ZarboClient (Api-Key), без bpy — тестируется отдельно
│
└── web/                    вьювер, Vite + three.js, собирается в addon/web_dist
    └── src/
        ├── main.js         загрузка scene.json → Viewer
        ├── viewer/
        │   ├── Viewer.js        renderer/scene/camera/controls, цикл рендера
        │   ├── toneMapping.js   Neutral / ACES / AgX — как в MV
        │   ├── environment.js   neutral (RoomEnvironment, как MV) / HDRI, exposure, rotation
        │   └── transparency.js  стратегии сортировки прозрачности
        ├── materials/schema.js  свойства материала: панели редактора + live link
        ├── editor/         редактор (Preact + glTF-Transform), отдельный чанк
        └── state/store.js  единое состояние настроек вьювера
```

## Поток данных

```
Blender ── Export & View ──► session dir/ (model.glb, env.hdr, scene.json)
                                   │
            server/http.py ◄───────┘  GET /            → web_dist/index.html
                                      GET /session/*   → файлы сессии
                                      GET /api/scene   → scene.json
                                   │
Browser ── fetch /api/scene ──► Viewer(three.js) ── tone mapping / env / transparency

Blender ── Upload to Zarbo ──► ZarboClient: product → model(glb, usdz) → widget → PATCH camera
                              ──► embed: https://embed.zarbo.tech/{widget.product.uuid}/{widget.id}/
```

Ключевое отличие от 2.4: **HTML не шаблонизируется regex'ами**. Вьювер — статический бандл,
все параметры сцены идут через `scene.json`. Blender-часть и веб-часть не знают о внутренностях друг друга.

## 1. Рендер, совместимый с model-viewer

- three.js той же ветки, что у MV (сверять версию `three` в `@google/model-viewer` при обновлении).
- Tone mapping: `neutral` (MV по умолчанию, `THREE.NeutralToneMapping`), `aces` (`ACESFilmicToneMapping`),
  `agx` (`AgXToneMapping`). Exposure — `renderer.toneMappingExposure`.
- Окружение `neutral` = `RoomEnvironment` через PMREM, как делает MV; HDRI — `RGBELoader`/`EXRLoader`.
- Цвет: `SRGBColorSpace` на выходе, как в MV.

### Прозрачность (`transparency.js`)

| Режим       | Как                                                                                          |
|-------------|----------------------------------------------------------------------------------------------|
| `origin`    | сортировка прозрачных по расстоянию **от origin объекта** до камеры — как старый iOS Quick Look |
| `mv`        | поведение MV/three: центр bounding sphere + двухпроходный double-sided (back → front)         |
| `hashed`    | alpha hash/dither, без сортировки, depthWrite — стабильно, но зернисто (кандидат)              |
| `prepass`   | depth pre-pass: прозрачное пишет глубину отдельным проходом, видна только ближняя поверхность (кандидат) |

Реализуется через `renderer.setTransparentSort()` + правку материалов — ядро рендера не трогаем.

## 2. Zarbo API (`addon/zarbo/client.py`)

База `{host}/api/v1`, `host` по умолчанию `https://api.zarbo.tech`, заголовок `Authorization: Api-Key <key>`.

| Метод  | Путь                      | Зачем                                                                 |
|--------|---------------------------|----------------------------------------------------------------------|
| POST   | `/collections/`           | создать коллекцию (id кешируется в prefs)                             |
| POST   | `/products/`              | продукт: `collection_id`, `guid`, `name`, `description`               |
| PATCH  | `/products/{id}/`         | `tags` строкой                                                        |
| POST   | `/models/`                | multipart `file`, `product_id`, `additional_data` (обязательно!)       |
| GET    | `/widgets/?product={id}`  | есть ли виджет                                                        |
| POST   | `/widgets/`               | создать явно — на автосоздание не полагаемся                          |
| PATCH  | `/widgets/{id}/`          | `camera_orbit`, `shadow_intensity`, `shadow_softness` (нет в Postman)  |

- `additional_data`: GLB → `"3d ar_android ar_ios"`, если есть отдельный USDZ — GLB `"3d ar_android"`, USDZ `"ar_ios"`.
- Embed — **`https://embed.zarbo.tech/{widget["product"]["uuid"]}/{widget["id"]}/`**, не `/widgets/render/`.
- Референс: `../blinZarboBlenderAddon/blender-addon/managers/zarbo.py`, Postman `zarbo-dev` / `release/1.44.0`.

## 3. USDZ (`addon/export/usdz.py` + `usdz_legacy_worker.py`)

**USDZ из Blender 4.2+/5.x не открывается на iOS**, поэтому текущий Blender экспортирует только GLB, а USDZ
делает Blender 4.1 в фоне (`blender -b --python usdz_legacy_worker.py -- in.glb out.usdz <size> <anim>`):

- импорт GLB → **сжатие текстур** (`image.scale` до 1024/2048/4096, JPEG если нет альфы, PNG если есть) —
  в 4.1 нет `usdz_downscale_size`;
- **анимации**: диапазон кадров берётся из actions, `export_animation` + скелетка + shape keys;
- Y-up руками (в 4.1 нет `convert_orientation`): корни под empty с −90° X, `upAxis=Y` через `pxr`;
- без светильников (World → DomeLight ARKit не принимает), первый UV → `st`, `rename_uvmaps=False`;
- упаковка `UsdUtils.CreateNewARKitUsdzPackage`, проверка `ComplianceChecker(arkit=True)`.

Нет Blender 4.1 → USDZ не делаем, GLB уходит в Zarbo с `ar_ios`, iOS-версию собирает сервер Zarbo.
USDZ не умеет Draco — тяжёлая геометрия раздувает файл (тестовая сцена с кольцом: GLB 3 МБ с Draco → USDZ 47 МБ); нужна децимация.

## 4. Live link

Канал Blender → браузер: **SSE** (`GET /api/events`, `text/event-stream`) — работает поверх того же
`http.server`, без websocket-зависимостей, браузер сам переподключается. Обратный канал не нужен.

| Событие           | Когда                                              | Что делает вьювер                                 |
|-------------------|----------------------------------------------------|---------------------------------------------------|
| `scene`           | повторный Export & View                            | перезагружает GLB, **камеру не трогает**, вкладка та же |
| `material`        | правка материала (`depsgraph_update_post`)         | патчит `MeshStandard/PhysicalMaterial` по имени     |
| `viewer`          | правка tone mapping/exposure/env в N-панели        | `store.set(...)`                                   |

Материалы: хендлер только помечает dirty, `bpy.app.timers` раз в ~100 мс снимает снапшот
Principled BSDF → glTF-полей (baseColor, metallic, roughness, emissive, alpha, IOR, transmission,
clearcoat, sheen…) и `surface_render_method`/`blend_method` → `alphaMode` (OPAQUE/MASK/BLEND),
шлёт только изменившиеся. Маппинг имён: `material.name` Blender = `material.name` в GLB.
Текстуры и топология в live не едут — для них `scene` (переэкспорт, можно по таймеру/по сохранению).

## 5. Редактор (`web/src/editor/`)

Ориентир по функциям — [gltfeditor.com](https://gltfeditor.com) (свой рендер, React, Basis/KTX2, meshopt,
xatlas для AO-бейка, ffmpeg для видео). Открывается кнопкой «Редактор» во вьювере (только десктоп) или `?edit`;
отдельный чанк, телефонный вьювер не тяжелеет.

**Ядро:** источник правды — документ glTF-Transform (без потерь: расширения, extras). Рисует по-прежнему
GLTFLoader, как model-viewer, поэтому редактор выглядит как вьювер, и анимации работают.

- правка значения (ползунок, цвет) → документ + живой патч three-материалов по `parser.associations`;
- структурная правка (текстура, UV-канал, вкл/выкл расширения, смена класса материала) → документ → GLB → перезагрузка,
  камера не трогается;
- Draco/meshopt декодируются один раз при чтении, сжатие выбирается заново при экспорте;
- undo/redo на всё, ползунки склеиваются в один шаг;
- live link из Blender в режиме редактора пишет и в документ — экспорт включает правки из Blender.

`materials/schema.js` — единое описание свойств материала (ядро + 10 KHR-расширений): по нему строятся панели,
патчится three и принимается live link. Без импортов glTF-Transform — вьювер использует его без редактора.

| Этап | Что |
|------|-----|
| **1 (сделано)** | дерево сцены / материалы / текстуры; инспектор всех PBR-полей и расширений; слоты текстур: замена, выбор существующей, UV-канал, скачать, убрать; выбор кликом по модели; панель сцены; экспорт GLB: prune+dedup, meshopt, WebP/JPEG, даунскейл |
| 2 | Draco и KTX2 (Basis) при экспорте; оптимизация: simplify (meshopt), weld, merge materials/geometry, collapse hierarchy, удалить пустые/скрытые узлы; нормали/тангенты |
| 3 | трансформы и гизмо, set origin, apply transform; дубли/удаление узлов; добавление примитивов и света |
| 4 | бейк AO (xatlas + raytrace), упаковка O/R/M; просмотр каналов (normal, UV, AO) |
| 5 | экспорт картинки/видео (MediaRecorder), USDZ из браузера — только если серверный/4.1 путь не устроит |

## Решения, отложенные на потом


- Обратная запись правок в .blend (POST из браузера) — не проектируем, пока не нужна.
