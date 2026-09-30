import bpy
from bpy.props import (BoolProperty, EnumProperty, FloatProperty, FloatVectorProperty,
                       IntProperty, PointerProperty, StringProperty)

TONE_MAPPING = [
    ('neutral', "Neutral", "model-viewer default (Khronos PBR Neutral)"),
    ('aces', "ACES", "ACES Filmic"),
    ('agx', "AgX", "AgX, closest to Blender's default view transform"),
]

TRANSPARENCY = [
    ('origin', "By origin", "Sort transparent objects by their origin, like old iOS Quick Look"),
    ('mv', "model-viewer", "Bounding-sphere sort + two-pass double-sided, like model-viewer"),
    ('hashed', "Hashed", "Alpha hash/dither, no sorting"),
    ('prepass', "Depth prepass", "Only the nearest transparent surface is visible"),
]

ENVIRONMENT = [
    ('neutral', "Neutral", "model-viewer neutral room"),
    ('scene', "From World", "Environment Texture of the scene World"),
    ('custom', "Custom", "HDR/EXR file"),
]

TEXTURE_SIZE = [
    ('KEEP', "Keep", ""),
    ('1024', "1024", ""),
    ('2048', "2048", ""),
    ('4096', "4096", ""),
]


class IZV_ViewerSettings(bpy.types.PropertyGroup):
    tone_mapping: EnumProperty(name="Tone mapping", items=TONE_MAPPING, default='neutral')
    exposure: FloatProperty(name="Exposure", default=1.0, min=0.0, soft_max=4.0)
    transparency: EnumProperty(name="Transparency", items=TRANSPARENCY, default='mv')
    environment: EnumProperty(name="Environment", items=ENVIRONMENT, default='neutral')
    environment_path: StringProperty(name="HDRI", subtype='FILE_PATH')
    environment_rotation: FloatProperty(name="Env rotation", subtype='ANGLE', default=0.0)
    background: FloatVectorProperty(name="Background", subtype='COLOR', size=3, min=0, max=1, default=(1, 1, 1))
    copy_camera: BoolProperty(name="Copy 3D view camera", default=True)
    bloom: BoolProperty(name="Bloom", description="Glow preview for emission (model-viewer has no bloom)", default=False)
    bloom_strength: FloatProperty(name="Strength", default=0.15, min=0.0, soft_max=3.0)
    bloom_radius: FloatProperty(name="Radius", default=0.4, min=0.0, max=1.0)
    bloom_threshold: FloatProperty(name="Threshold", default=1.0, min=0.0, soft_max=10.0)


class IZV_ExportSettings(bpy.types.PropertyGroup):
    selected_only: BoolProperty(name="Selected only", default=False)
    draco: BoolProperty(
        name="Draco", default=False,
        description="Compress GLB geometry (KHR_draco_mesh_compression). Slower export, much smaller file")
    draco_level: IntProperty(name="Level", default=6, min=0, max=10, description="Higher = smaller file, slower encode")
    export_usdz: BoolProperty(name="USDZ", description="Also export USDZ for iOS Quick Look", default=True)
    usdz_texture_size: EnumProperty(name="USDZ textures", items=TEXTURE_SIZE, default='2048')
    usdz_animation: BoolProperty(name="Animation", default=True)
    usdz_flatten: BoolProperty(
        name="Упрощать материалы",
        description="Схлопнуть transmission/IOR/specular в базовый PBR: на iPhone стекло и металл "
                    "выглядят как задумано. GLB-версия при этом остаётся с полными каналами",
        default=True)



class IZV_Settings(bpy.types.PropertyGroup):
    viewer: PointerProperty(type=IZV_ViewerSettings)
    export: PointerProperty(type=IZV_ExportSettings)


CLASSES = (IZV_ViewerSettings, IZV_ExportSettings, IZV_Settings)


def attach():
    bpy.types.Scene.izv = PointerProperty(type=IZV_Settings)


def detach():
    del bpy.types.Scene.izv
