import subprocess
import uuid
import webbrowser

import bpy

from . import live, preferences, session
from .export.hdri import HdriError
from .server import events, http
from .zarbo.client import ZarboClient, ZarboError, publish


class IZV_OT_ExportAndView(bpy.types.Operator):
    bl_idname = "izv.export_and_view"
    bl_label = "Export and View"
    bl_description = "Export the scene and open it in the LAN viewer"

    def execute(self, context):
        prefs = preferences.get(context)
        try:
            result = session.build(context, prefs.legacy_blender)
            link = http.start(session.session_dir(), prefs.port, prefs.use_https)
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


class IZV_OT_PublishZarbo(bpy.types.Operator):
    bl_idname = "izv.publish_zarbo"
    bl_label = "Publish to Zarbo"
    bl_description = "Export GLB (+USDZ) and create product, models and widget in Zarbo"

    @classmethod
    def poll(cls, context):
        return bool(preferences.get(context).zarbo_api_key)

    def execute(self, context):
        prefs = preferences.get(context)
        z = context.scene.izv.zarbo
        client = ZarboClient(prefs.zarbo_api_key, prefs.zarbo_host)
        name = z.product_name or bpy.path.display_name_from_filepath(bpy.data.filepath) or "Blender export"
        try:
            result = session.build(context, prefs.legacy_blender)
            if not prefs.zarbo_collection_id:
                prefs.zarbo_collection_id = client.create_collection("Создано из Blender")["id"]
            _, embed = publish(
                client, prefs.zarbo_collection_id, str(uuid.uuid4()), name, z.description, z.tags,
                result["glb"], result["usdz"], widget_fields=widget_fields(result["scene"]),
            )
        except (ZarboError, HdriError, OSError, RuntimeError, subprocess.TimeoutExpired) as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        z.last_embed_url = embed
        context.window_manager.clipboard = embed
        self.report({'INFO'}, f"Published: {embed} (copied)")
        return {'FINISHED'}


def widget_fields(scene: dict) -> dict:
    cam = scene.get("camera")
    if not cam:
        return {}
    return {"camera_orbit": f"{cam['theta']:.1f}deg {cam['phi']:.1f}deg {cam['radius']:.3f}m"}


class IZV_OT_OpenEmbed(bpy.types.Operator):
    bl_idname = "izv.open_embed"
    bl_label = "Open Embed"

    def execute(self, context):
        webbrowser.open(context.scene.izv.zarbo.last_embed_url)
        return {'FINISHED'}


CLASSES = (IZV_OT_ExportAndView, IZV_OT_StopServer, IZV_OT_PublishZarbo, IZV_OT_OpenEmbed)
