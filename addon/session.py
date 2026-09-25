"""A view session: one folder with exported files + scene.json that the web viewer reads."""
import json
import math
import shutil
import time
from pathlib import Path

import bpy

from .export.glb import export_glb
from .export.hdri import export_hdri
from .export.usdz import export_usdz, legacy_blender
from .live import viewer_snapshot


def session_dir() -> Path:
    return Path(bpy.app.tempdir) / "izv_session"


def camera_orbit(context) -> dict | None:
    space = context.space_data
    if not space or space.type != 'VIEW_3D' or not space.region_3d:
        return None
    rv3d = space.region_3d
    euler = rv3d.view_rotation.to_euler()
    target = rv3d.view_location
    return {
        "theta": math.degrees(euler.z),
        "phi": math.degrees(euler.x),
        "radius": rv3d.view_distance,
        "target": [target.x, target.z, -target.y],  # Blender Z-up -> glTF Y-up
    }


def build(context, legacy_blender_path: str = "") -> dict:
    settings = context.scene.izv
    out = session_dir()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    stamp = int(time.time())
    e = settings.export
    glb = export_glb(context, out / f"model_{stamp}.glb", e.selected_only, e.draco_level if e.draco else None)
    # No legacy Blender -> no USDZ; Zarbo then builds the iOS model from GLB itself.
    usdz = None
    blender = legacy_blender(legacy_blender_path)
    if settings.export.export_usdz and blender:
        usdz = export_usdz(glb, blender, settings.export.usdz_texture_size, settings.export.usdz_animation)

    v = settings.viewer
    env = export_hdri(context.scene, v.environment, v.environment_path, out)

    scene = {
        "version": 1,
        "model": f"session/{glb.name}",
        "usdz": f"session/{usdz.name}" if usdz else None,
        "environment": f"session/{env}" if env else "neutral",
        **viewer_snapshot(context.scene),
        "camera": camera_orbit(context) if v.copy_camera else None,
    }
    (out / "scene.json").write_text(json.dumps(scene, indent=2), encoding="utf-8")
    return {"dir": out, "glb": glb, "usdz": usdz, "scene": scene}
