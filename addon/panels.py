import bpy

from .server import http


class IZV_PT_Main(bpy.types.Panel):
    bl_label = "Instant Zarbo Viewer"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Zarbo"

    def draw(self, context):
        layout = self.layout
        row = layout.row()
        row.scale_y = 2
        row.operator("izv.export_and_view", icon='URL')
        if http.is_running():
            row = layout.row()
            row.label(text=http.url(), icon='CHECKMARK')
            row.operator("izv.stop_server", text="", icon='CANCEL')


class IZV_PT_Viewer(bpy.types.Panel):
    bl_label = "Viewer"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Zarbo"
    bl_parent_id = "IZV_PT_Main"

    def draw(self, context):
        v = context.scene.izv.viewer
        col = self.layout.column()
        col.prop(v, "tone_mapping")
        col.prop(v, "exposure")
        col.prop(v, "transparency")
        col.prop(v, "environment")
        if v.environment == 'custom':
            col.prop(v, "environment_path")
        col.prop(v, "environment_rotation")
        col.prop(v, "background")
        col.prop(v, "copy_camera")
        col.separator()
        col.prop(v, "bloom")
        sub = col.column()
        sub.enabled = v.bloom
        sub.prop(v, "bloom_strength")
        sub.prop(v, "bloom_radius")
        sub.prop(v, "bloom_threshold")


class IZV_PT_Export(bpy.types.Panel):
    bl_label = "Export"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Zarbo"
    bl_parent_id = "IZV_PT_Main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        e = context.scene.izv.export
        col = self.layout.column()
        col.prop(e, "selected_only")
        col.prop(e, "export_usdz")
        sub = col.column()
        sub.enabled = e.export_usdz
        sub.prop(e, "usdz_texture_size")
        sub.prop(e, "usdz_animation")


class IZV_PT_Zarbo(bpy.types.Panel):
    bl_label = "Zarbo"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Zarbo"
    bl_parent_id = "IZV_PT_Main"

    def draw(self, context):
        z = context.scene.izv.zarbo
        col = self.layout.column()
        col.prop(z, "product_name")
        col.prop(z, "description")
        col.prop(z, "tags")
        col.operator("izv.publish_zarbo", icon='EXPORT')
        if z.last_embed_url:
            row = col.row()
            row.prop(z, "last_embed_url", text="")
            row.operator("izv.open_embed", text="", icon='URL')


CLASSES = (IZV_PT_Main, IZV_PT_Viewer, IZV_PT_Export, IZV_PT_Zarbo)
