import bpy
from bpy.props import BoolProperty, IntProperty, StringProperty

from .zarbo.client import DEFAULT_HOST


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
        name="Blender 4.1 for USDZ",
        description="USDZ from Blender 4.2+ doesn't open on iOS; empty = default 4.1 install path",
        subtype='FILE_PATH',
    )
    zarbo_host: StringProperty(name="Zarbo host", default=DEFAULT_HOST)
    zarbo_api_key: StringProperty(name="Zarbo Api-Key", subtype='PASSWORD')
    zarbo_collection_id: IntProperty(name="Collection id", default=0, description="0 = create on first upload")

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
        col.prop(self, "zarbo_collection_id")


CLASSES = (IZV_Preferences,)
