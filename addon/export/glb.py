from pathlib import Path

import bpy

from . import has_selection, op_kwargs


def export_glb(context, path: Path, selected_only: bool, draco_level: int | None = None) -> Path:
    op = bpy.ops.export_scene.gltf
    op(**op_kwargs(
        op,
        filepath=str(path),
        export_format='GLB',
        use_selection=selected_only and has_selection(context),
        use_visible=True,
        export_extras=True,
        export_apply=True,
        export_animations=True,
        export_draco_mesh_compression_enable=draco_level is not None,
        export_draco_mesh_compression_level=draco_level if draco_level is not None else 6,
    ))
    return path
