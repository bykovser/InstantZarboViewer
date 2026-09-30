"""Runs INSIDE a background Blender (4.1 … 5.x): GLB -> USDZ for iOS Quick Look.

blender -b --factory-startup --python usdz_worker.py -- in.glb out.usdz <max_texture|0> <animation 0|1>

Output of 5.2 opens on iOS (tested on iPhone XS); sanitize() still brings it down to what 4.1 wrote,
for older iOS: no ColorSpaceAPI (USD 25+ schema), no Blender-only attributes, every SkelAnimation
channel time-sampled on the same frames.
Fixes from MaxConverter (verified with ComplianceChecker(arkit=True)):
  - Z-up -> Y-up explicitly, otherwise models open lying on their side;
  - no lights: World becomes a DomeLight, which ARKit rejects;
  - first UV layer named 'st' by hand, rename_uvmaps off, so textures on other UV sets keep their binding.
"""
import json
import math
import shutil
import sys
from pathlib import Path

import bpy


def op_kwargs(op, **kwargs):
    known = {p.identifier for p in op.get_rna_type().properties}
    return {k: v for k, v in kwargs.items() if k in known}


def compress_textures(max_size: int, tmp: Path):
    """Legacy USD exporter has no downscale option: shrink and re-encode images ourselves."""
    tmp.mkdir(parents=True, exist_ok=True)
    for i, img in enumerate(bpy.data.images):
        if img.size[0] == 0:
            continue
        w, h = img.size
        if max_size and max(w, h) > max_size:
            k = max_size / max(w, h)
            img.scale(max(1, round(w * k)), max(1, round(h * k)))
        has_alpha = img.alpha_mode != 'NONE' and img.channels == 4 and _uses_alpha(img)
        fmt, ext = ('PNG', 'png') if has_alpha else ('JPEG', 'jpg')
        path = tmp / f"tex_{i}.{ext}"
        img.file_format = fmt
        img.filepath_raw = str(path)
        if img.packed_file:
            img.unpack(method='REMOVE')
        img.save()


def _uses_alpha(img) -> bool:
    px = img.pixels[:]
    return any(px[i] < 0.999 for i in range(3, len(px), 4 * 97))


def rename_first_uv():
    for mesh in bpy.data.meshes:
        if mesh.uv_layers and all(uv.name != "st" for uv in mesh.uv_layers):
            mesh.uv_layers[0].name = "st"


def wrap_y_up():
    """4.1 has no convert_orientation: parent all roots to an empty rotated -90° X (Blender Z-up -> Y-up)."""
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    pivot = bpy.data.objects.new("root", None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.rotation_euler = (-math.pi / 2, 0, 0)
    for obj in roots:
        obj.parent = pivot
        obj.matrix_parent_inverse.identity()


def sanitize(usdc: Path):
    from pxr import Sdf, Usd
    layer = Sdf.Layer.FindOrOpen(str(usdc))
    paths = []
    layer.Traverse(Sdf.Path.absoluteRootPath, lambda p: paths.append(p) if p.IsPrimPath() else None)
    for path in paths:
        spec = layer.GetPrimAtPath(path)
        if spec.HasInfo("apiSchemas"):
            op = spec.GetInfo("apiSchemas")
            items = [s for s in op.prependedItems if s != "ColorSpaceAPI"]
            if len(items) != len(op.prependedItems):
                if items:
                    op.prependedItems = items
                    spec.SetInfo("apiSchemas", op)
                else:
                    spec.ClearInfo("apiSchemas")
        for name in [n for n in spec.properties.keys() if n.startswith("colorSpace:") or ":blender:" in n]:
            spec.RemoveProperty(spec.properties[name])
        if spec.typeName != "SkelAnimation":
            continue
        channels = [spec.properties[n] for n in ("rotations", "scales", "translations", "blendShapeWeights")
                    if n in spec.properties]
        times = sorted({t for a in channels for t in layer.ListTimeSamplesForPath(a.path)})
        if not times:
            times = [layer.startTimeCode if layer.HasStartTimeCode() else 1.0]
        stage = None
        for attr in channels:
            own = layer.ListTimeSamplesForPath(attr.path)
            if attr.default is not None and not own:
                for t in times:
                    layer.SetTimeSample(attr.path, t, attr.default)
            elif own and len(own) != len(times):
                stage = stage or Usd.Stage.Open(layer)
                usd_attr = stage.GetAttributeAtPath(attr.path)
                for t in times:
                    if t not in own:
                        layer.SetTimeSample(attr.path, t, usd_attr.Get(t))
            attr.ClearDefaultValue()
    layer.Save()


def package_usdz(usdc: Path, dst: Path):
    from pxr import Sdf, Usd, UsdGeom, UsdUtils
    stage = Usd.Stage.Open(str(usdc))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    stage.GetRootLayer().Save()
    if dst.exists():
        dst.unlink()
    UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(str(usdc)), str(dst))


def check_arkit(path: Path) -> list[str]:
    try:
        from pxr import UsdUtils
    except ImportError:
        return ["pxr not available: ARKit check skipped"]
    checker = UsdUtils.ComplianceChecker(arkit=True, skipARKitRootLayerCheck=False)
    checker.CheckCompliance(str(path))
    return [*checker.GetErrors(), *checker.GetFailedChecks()]


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    src, dst, max_size, animation = args[:4]
    flatten = len(args) > 4 and args[4] == "1"
    src, dst, max_size, animation = Path(src), Path(dst), int(max_size), animation == "1"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src))
    if flatten:
        # UsdPreviewSurface не умеет transmission/IOR: схлопываем материалы под iOS.
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from usdz_materials import apply_usdz_adaptation
        apply_usdz_adaptation()
    work = dst.parent / f"{dst.stem}_work"
    compress_textures(max_size, work / "textures")
    rename_first_uv()
    op = bpy.ops.wm.usd_export
    if "convert_orientation" not in {p.identifier for p in op.get_rna_type().properties}:
        wrap_y_up()

    scene = bpy.context.scene
    if animation and bpy.data.actions:
        start = min(a.frame_range[0] for a in bpy.data.actions)
        end = max(a.frame_range[1] for a in bpy.data.actions)
        scene.frame_start, scene.frame_end = int(start), int(end)
    op(**op_kwargs(
        op,
        filepath=str(work / f"{dst.stem}.usdc"),
        selected_objects_only=False,
        export_materials=True,
        generate_preview_surface=True,
        export_textures=True,
        overwrite_textures=True,
        relative_paths=True,
        export_lights=False,
        rename_uvmaps=False,
        convert_orientation=True,
        export_global_forward_selection='NEGATIVE_Z',
        export_global_up_selection='Y',
        export_animation=animation,
        start=scene.frame_start,
        end=scene.frame_end,
        export_armatures=animation,
        only_deform_bones=True,
        export_shapekeys=animation,
    ))
    try:
        sanitize(work / f"{dst.stem}.usdc")
        package_usdz(work / f"{dst.stem}.usdc", dst)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print("IZV_RESULT " + json.dumps({"path": str(dst), "arkit": check_arkit(dst)}))


main()
