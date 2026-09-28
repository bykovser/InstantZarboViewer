import bpy

from . import __version__
from .preferences import get as get_prefs
from .server import events, http


class IZV_PT_Main(bpy.types.Panel):
    bl_label = "Instant Zarbo Viewer"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Zarbo"

    def draw(self, context):
        layout = self.layout
        prefs = get_prefs(context)
        state = http.config_state()

        if not prefs.zarbo_api_key.strip():
            box = layout.box()
            box.alert = True
            col = box.column(align=True)
            col.label(text="Нет API-ключа Zarbo", icon='ERROR')
            col.label(text="Публикация из вкладки «Экспорт» не заработает")
            col.operator("izv.show_preferences", text="Открыть настройки", icon='PREFERENCES')
        elif state["warm_error"]:
            # Ключ вписан, но стенд его не принял — обычно ключ от другого стенда.
            box = layout.box()
            box.alert = True
            col = box.column(align=True)
            col.label(text="Zarbo не принял ключ", icon='ERROR')
            col.label(text=state["warm_error"][:64])
            col.operator("izv.show_preferences", text="Проверить настройки", icon='PREFERENCES')

        layout.label(text=f"Версия {__version__}", icon='INFO')
        row = layout.row()
        row.scale_y = 2
        row.operator("izv.export_and_view", icon='URL')
        if http.is_running():
            box = layout.box()
            viewers = events.client_count()
            row = box.row()
            row.label(
                text=f"Вьювер открыт: {viewers}" if viewers else "Вьювер закрыт (вкладка не открыта)",
                icon='CHECKMARK' if viewers else 'X',
            )
            row = box.row(align=True)
            row.operator("izv.open_viewer", text="Открыть", icon='URL')
            row.operator("izv.copy_link", text="", icon='COPYDOWN')
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
        row = col.row(align=True)
        row.prop(e, "draco")
        sub = row.row(align=True)
        sub.enabled = e.draco
        sub.prop(e, "draco_level")
        col.prop(e, "export_usdz")
        sub = col.column()
        sub.enabled = e.export_usdz
        sub.prop(e, "usdz_texture_size")
        sub.prop(e, "usdz_animation")



CLASSES = (IZV_PT_Main, IZV_PT_Viewer, IZV_PT_Export)
