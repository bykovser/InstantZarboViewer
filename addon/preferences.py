from pathlib import Path

import bpy
from bpy.props import BoolProperty, IntProperty, StringProperty

from .server import http

DEFAULT_HOST = "https://api-sergkey.zarbo.works"


def get(context=None) -> "IZV_Preferences":
    context = context or bpy.context
    return context.preferences.addons[__package__].preferences


class IZV_Preferences(bpy.types.AddonPreferences):
    bl_idname = __package__

    port: IntProperty(name="Port", default=8090, min=1024, max=65535)
    use_https: BoolProperty(
        name="HTTPS",
        description="Needed for WebXR/camera on phones; uses a self-signed certificate",
        default=False,
    )
    legacy_blender: StringProperty(
        name="Blender for USDZ",
        description="Blender that writes USDZ in the background; empty = this Blender (e.g. point to 4.1 to compare)",
        subtype='FILE_PATH',
    )
    # Publishing lives in the web editor (Export tab); the key only feeds the local proxy.
    zarbo_host: StringProperty(
        name="Zarbo host", default=DEFAULT_HOST,
        description="Стенд Zarbo. Можно вставить и адрес страницы, где создают ключ "
                    "(https://app-<стенд>.zarbo.works/profile): путь отбрасывается, app-/app. меняется на api-/api.",
        update=lambda self, _: push_zarbo(self))
    zarbo_api_key: StringProperty(name="Zarbo Api-Key", subtype='PASSWORD', update=lambda self, _: push_zarbo(self))

    def draw(self, context):
        col = self.layout.column()
        col.label(text="LAN server")
        row = col.row()
        row.prop(self, "port")
        row.prop(self, "use_https")
        col.separator()
        col.prop(self, "legacy_blender")
        col.separator()
        col.label(text="Zarbo")
        col.prop(self, "zarbo_host")
        col.prop(self, "zarbo_api_key")
        col.label(text="Публикация — во вкладке «Экспорт» веб-редактора", icon='INFO')


def store_path() -> Path | None:
    try:
        return Path(bpy.utils.user_resource('CONFIG', path='instant_zarbo_viewer', create=True)) / 'last_publish.json'
    except Exception:  # noqa: BLE001 — без конфига просто не помним между запусками
        return None


def push_zarbo(prefs):
    http.set_store(store_path())
    http.set_zarbo(prefs.zarbo_host, prefs.zarbo_api_key)


CLASSES = (IZV_Preferences,)
