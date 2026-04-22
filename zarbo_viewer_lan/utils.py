import bpy
import os
import socket
import math

HDRI_FROM_SCENE = 'FROM_SCENE'
HDRI_NONE = 'NONE'
HDRI_CUSTOM = 'CUSTOM'

COPY_TRANSFORM_ENABLED = 'ENABLED'
COPY_TRANSFORM_DISABLED = 'DISABLED'

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def export_to_glb(context, filepath, export_format='GLB'):
    """
    Export the selected or visible objects in the scene to a GLB or GLTF file.
    If nothing is selected, exports all visible objects.
    If no objects at all, exports empty scene.

    Args:
        context (bpy.context): The Blender context.
        filepath (str): The path to the output file.
        export_format (str, optional): The output format, either 'GLB' or 'GLTF'. Defaults to 'GLB'.

    Returns:
        Tuple[bool, str]: A tuple containing a boolean indicating success/failure and a message describing the result.
    """
    selected_objects = [obj for obj in context.scene.objects if obj.select_get()]
    if not selected_objects:
        # Deselect all objects before selecting visible ones
        bpy.ops.object.select_all(action='DESELECT')
        # Select all visible objects
        for obj in context.scene.objects:
            if obj.visible_get():
                obj.select_set(True)
        selected_objects = [obj for obj in context.scene.objects if obj.select_get()]

    # Export even if no objects (empty scene)
    try:
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            use_selection=len(selected_objects) > 0,
            export_format=export_format,
            export_extras=True,
            export_apply=True
        )
        if selected_objects:
            return True, f"{export_format} model exported to {filepath}"
        else:
            return True, f"Empty scene exported to {filepath}"
    except Exception as e:
        return False, f"Failed to export {export_format} model: {str(e)}"

def export_scene_hdri(context, filepath):
    # Check if world environment texture exists
    world = context.scene.world
    if not world or not world.use_nodes:
        return False, "No world nodes setup"
    
    # Try to find environment texture node
    env_tex_node = None
    for node in world.node_tree.nodes:
        if node.type == 'TEX_ENVIRONMENT':
            env_tex_node = node
            break
    
    if not env_tex_node or not env_tex_node.image:
        return False, "No environment texture found"
    
    # Save image to file
    try:
        original_path = env_tex_node.image.filepath
        # If it's a packed image, save it to the filepath
        if env_tex_node.image.packed_file:
            env_tex_node.image.save_render(filepath)
            return True, filepath
        # If it's a file on disk, copy it or return the path
        elif os.path.exists(bpy.path.abspath(original_path)):
            import shutil
            src_path = bpy.path.abspath(original_path)
            shutil.copy2(src_path, filepath)
            return True, filepath
        else:
            return False, "Environment image not found on disk"
    except Exception as e:
        return False, f"Failed to export HDRI: {str(e)}"
