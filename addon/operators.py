import subprocess
import webbrowser

import bpy

from . import live, preferences, session
from .export.hdri import HdriError
from .server import events, http


class IZV_OT_ExportAndView(bpy.types.Operator):
    bl_idname = "izv.export_and_view"
    bl_label = "Export and View"
    bl_description = "Export the scene and open it in the LAN viewer"

    def execute(self, context):
        prefs = preferences.get(context)
        try:
            result = session.build(context, prefs.legacy_blender)
            link = http.start(session.session_dir(), prefs.port, prefs.use_https)
            preferences.push_zarbo(prefs)
            http.warm_collections()  # сервер мог быть уже поднят: start() тогда ничего не делает
        except (HdriError, OSError, RuntimeError, subprocess.TimeoutExpired) as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        live.reset(context.scene)
        if events.broadcast("scene", result["scene"]):
            self.report({'INFO'}, "Viewer updated")
            return {'FINISHED'}
        context.window_manager.clipboard = link
        webbrowser.open(link)
        self.report({'INFO'}, f"Viewer: {link} (copied)")
        return {'FINISHED'}


class IZV_OT_ShowPreferences(bpy.types.Operator):
    bl_idname = "izv.show_preferences"
    bl_label = "Настройки аддона"
    bl_description = "Открыть настройки Instant Zarbo Viewer — хост стенда и API-ключ"

    def execute(self, context):
        try:
            bpy.ops.preferences.addon_show(module=__package__)
        except (AttributeError, RuntimeError):
            bpy.ops.screen.userpref_show('INVOKE_DEFAULT')
        return {'FINISHED'}


class IZV_OT_OpenViewer(bpy.types.Operator):
    bl_idname = "izv.open_viewer"
    bl_label = "Open Viewer"
    bl_description = "Открыть вьювер в браузере заново (закрыли вкладку) — ничего не переэкспортирует"

    def execute(self, context):
        link = http.url()
        if not link:
            self.report({'WARNING'}, "Сервер не запущен: сначала Export and View")
            return {'CANCELLED'}
        webbrowser.open(link)
        return {'FINISHED'}


class IZV_OT_CopyLink(bpy.types.Operator):
    bl_idname = "izv.copy_link"
    bl_label = "Copy Viewer Link"
    bl_description = "Скопировать ссылку вьювера"

    def execute(self, context):
        link = http.url()
        if not link:
            self.report({'WARNING'}, "Сервер не запущен: сначала Export and View")
            return {'CANCELLED'}
        context.window_manager.clipboard = link
        self.report({'INFO'}, link)
        return {'FINISHED'}


class IZV_OT_StopServer(bpy.types.Operator):
    bl_idname = "izv.stop_server"
    bl_label = "Stop Server"

    def execute(self, context):
        http.stop()
        return {'FINISHED'}



CLASSES = (IZV_OT_ExportAndView, IZV_OT_ShowPreferences, IZV_OT_OpenViewer, IZV_OT_CopyLink, IZV_OT_StopServer)
