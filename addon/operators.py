import subprocess

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


class IZV_OT_StopServer(bpy.types.Operator):
    bl_idname = "izv.stop_server"
    bl_label = "Stop Server"

    def execute(self, context):
        http.stop()
        return {'FINISHED'}



CLASSES = (IZV_OT_ExportAndView, IZV_OT_StopServer)
