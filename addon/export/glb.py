from pathlib import Path

import bpy

from . import has_selection, op_kwargs


def export_glb(context, path: Path, selected_only: bool) -> Path:
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
    ))
    return path
