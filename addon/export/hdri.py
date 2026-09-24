import shutil
from pathlib import Path

import bpy


class HdriError(Exception):
    pass


def world_environment_image(scene):
    world = scene.world
    if not world or not world.use_nodes:
        return None
    for node in world.node_tree.nodes:
        if node.type == 'TEX_ENVIRONMENT' and node.image:
            return node.image
    return None


def export_hdri(scene, source: str, custom_path: str, out_dir: Path) -> str | None:
    """Returns the file name inside out_dir, or None for the built-in neutral environment."""
    if source == 'neutral':
        return None

    if source == 'custom':
        src = Path(bpy.path.abspath(custom_path))
        if not src.is_file():
            raise HdriError(f"HDRI not found: {src}")
        shutil.copy2(src, out_dir / src.name)
        return src.name

    image = world_environment_image(scene)
    if image is None:
        raise HdriError("World has no Environment Texture")
    src = Path(bpy.path.abspath(image.filepath))
    if image.packed_file or not src.is_file():
        name = "environment.hdr"
        image.save_render(str(out_dir / name))
        return name
    shutil.copy2(src, out_dir / src.name)
    return src.name
