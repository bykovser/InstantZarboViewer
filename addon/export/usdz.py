from pathlib import Path

import bpy

from . import has_selection, op_kwargs


def export_usdz(context, path: Path, selected_only: bool, texture_size: str, animation: bool) -> Path:
    """Native Blender USD exporter; UsdPreviewSurface is the only material model Quick Look understands."""
    scene = context.scene
    op = bpy.ops.wm.usd_export
    op(**op_kwargs(
        op,
        filepath=str(path.with_suffix(".usdz")),
        selected_objects_only=selected_only and has_selection(context),
        visible_objects_only=True,
        export_materials=True,
        generate_preview_surface=True,
        export_textures=True,
        overwrite_textures=True,
        usdz_downscale_size=texture_size,
        export_animation=animation,
        start=scene.frame_start,
        end=scene.frame_end,
        export_armatures=animation,
        only_deform_bones=True,
        export_shapekeys=animation,
        convert_world_material=False,
    ))
    return path.with_suffix(".usdz")
