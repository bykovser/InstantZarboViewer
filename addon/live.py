"""Live link: push material factors and viewer settings to connected viewers without re-export.

depsgraph handler only marks dirty; a timer snapshots, diffs against the last sent state and broadcasts.
Textures and geometry don't travel this way — they need a re-export (`scene` event).
"""
import math

import bpy
from bpy.app.handlers import persistent

from .server import events

INTERVAL = 0.1

_dirty = False
_sent_materials: dict[str, dict] = {}
_sent_viewer: dict = {}


def _unlinked(node, name, default=None):
    sock = node.inputs.get(name)
    if sock is None or sock.is_linked:
        return default
    value = sock.default_value
    return list(value) if hasattr(value, "__len__") else value


def _rgb(node, name):
    value = _unlinked(node, name)
    return value[:3] if value else None


def _sheen(node):
    tint, weight = _rgb(node, "Sheen Tint"), _unlinked(node, "Sheen Weight")
    if tint is None or weight is None:
        return None
    return [c * weight for c in tint]


def _principled(mat):
    if not mat.use_nodes or not mat.node_tree:
        return None
    nodes = mat.node_tree.nodes
    out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if out and out.inputs["Surface"].is_linked:
        node = out.inputs["Surface"].links[0].from_node
        if node.type == 'BSDF_PRINCIPLED':
            return node
    return next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)


def _alpha_mode(node) -> str:
    """Mirrors the glTF exporter: Round/Greater Than before Alpha -> MASK, any other alpha -> BLEND."""
    sock = node.inputs["Alpha"]
    if sock.is_linked:
        src = sock.links[0].from_node
        if src.type == 'MATH' and src.operation in {'ROUND', 'GREATER_THAN', 'LESS_THAN'}:
            return 'MASK'
        return 'BLEND'
    return 'BLEND' if sock.default_value < 1.0 else 'OPAQUE'


def material_snapshot(mat) -> dict | None:
    node = _principled(mat)
    if node is None:
        return None
    snap = {
        "baseColor": _rgb(node, "Base Color"),
        "alpha": _unlinked(node, "Alpha"),
        "alphaMode": _alpha_mode(node),
        "doubleSided": not mat.use_backface_culling,
        "metallic": _unlinked(node, "Metallic"),
        "roughness": _unlinked(node, "Roughness"),
        "emissive": _rgb(node, "Emission Color"),
        "emissiveStrength": _unlinked(node, "Emission Strength"),
        "ior": _unlinked(node, "IOR"),
        "transmission": _unlinked(node, "Transmission Weight"),
        "clearcoat": _unlinked(node, "Coat Weight"),
        "clearcoatRoughness": _unlinked(node, "Coat Roughness"),
        "sheenColor": _sheen(node),
        "sheenRoughness": _unlinked(node, "Sheen Roughness"),
    }
    return {k: v for k, v in snap.items() if v is not None}


def viewer_snapshot(scene) -> dict:
    v = scene.izv.viewer
    return {
        "toneMapping": v.tone_mapping,
        "exposure": v.exposure,
        "transparency": v.transparency,
        "background": list(v.background),
        "environmentRotation": math.degrees(v.environment_rotation),
        "bloom": v.bloom,
        "bloomStrength": v.bloom_strength,
        "bloomRadius": v.bloom_radius,
        "bloomThreshold": v.bloom_threshold,
        "fps": scene.render.fps / scene.render.fps_base,
    }


def _rounded(d: dict) -> dict:
    return {k: [round(x, 4) for x in v] if isinstance(v, list) else round(v, 4) if isinstance(v, float) else v
            for k, v in d.items()}


def reset(scene=None):
    """Forget what was sent: call after a re-export so the next diff starts from the new file."""
    global _dirty
    _sent_materials.clear()
    _sent_viewer.clear()
    if scene is not None:
        for mat in bpy.data.materials:
            snap = material_snapshot(mat)
            if snap:
                _sent_materials[mat.name] = _rounded(snap)
        _sent_viewer.update(viewer_snapshot(scene))
    _dirty = False


def flush(scene):
    changed = {}
    for mat in bpy.data.materials:
        snap = material_snapshot(mat)
        if not snap:
            continue
        snap = _rounded(snap)
        prev = _sent_materials.get(mat.name, {})
        diff = {k: v for k, v in snap.items() if prev.get(k) != v}
        if diff:
            changed[mat.name] = diff
            _sent_materials[mat.name] = snap
    if changed:
        events.broadcast("material", changed)

    view = viewer_snapshot(scene)
    diff = {k: v for k, v in view.items() if _sent_viewer.get(k) != v}
    if diff:
        _sent_viewer.update(view)
        events.broadcast("viewer", diff)


@persistent
def _on_depsgraph(scene, depsgraph):
    global _dirty
    if events.client_count() == 0:
        return
    for update in depsgraph.updates:
        if isinstance(update.id, (bpy.types.Material, bpy.types.NodeTree, bpy.types.Scene)):
            _dirty = True
            return


def _tick():
    global _dirty
    if _dirty and events.client_count():
        _dirty = False
        scene = bpy.context.scene
        if scene is not None:
            flush(scene)
    return INTERVAL


def register():
    bpy.app.handlers.depsgraph_update_post.append(_on_depsgraph)
    bpy.app.timers.register(_tick, first_interval=INTERVAL, persistent=True)


def unregister():
    if _on_depsgraph in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_on_depsgraph)
    if bpy.app.timers.is_registered(_tick):
        bpy.app.timers.unregister(_tick)
