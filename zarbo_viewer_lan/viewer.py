import bpy
import os
import webbrowser
import threading
import time
import math
import re
import shutil
import traceback

from .utils import get_local_ip, export_to_glb, export_scene_hdri, HDRI_FROM_SCENE, HDRI_NONE, HDRI_CUSTOM
from .LANserver import SimpleHTTPServerThread, HTML_OT_StartServer, HTML_OT_StopServer
from .UI import HTML_PT_ViewerPanel, safe_register_class, safe_unregister_class

bl_info = {
    "name": "Zarbo Viewer LAN",
    "author": "BykovSer",
    "version": (2, 4, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Local HTML",
    "description": "Host HTML page in local network and open in browser",
    "category": "Interface",
}

class HTML_OT_ExportAndView(bpy.types.Operator):
    bl_idname = "html.export_and_view"
    bl_label = "Export and View"

    auto_start = bpy.props.BoolProperty(
        name="Auto Start",
        description="Automatically start the server if needed",
        default=False
    )

    def execute(self, context):
        # Check if server_thread is defined in globals
        if 'server_thread' not in globals():
            globals()['server_thread'] = None

        # Declare server_thread as global
        global server_thread

        try:
            # Check if server_thread is defined
            if server_thread is None and self.auto_start:
                # Check if HTTPS is enabled in preferences
                prefs = context.preferences.addons["zarbo_viewer_lan"].preferences
                if prefs.use_https:
                    bpy.ops.html.start_server()
                else:
                    # Start HTTP server directly
                    temp_dir = bpy.app.tempdir
                    html_path = os.path.join(temp_dir, "index.html")

                    # Get path to our resources directory
                    addon_dir = os.path.dirname(os.path.realpath(__file__))
                    template_path = os.path.join(addon_dir, "resources", "index.html")

                    if os.path.exists(template_path):
                        import shutil
                        shutil.copy2(template_path, html_path)
                    else:
                        self.report({'ERROR'}, "HTML template not found in resources")
                        return {'CANCELLED'}

                    # Change to temp directory
                    os.chdir(temp_dir)

                    # Start HTTP server
                    server_thread = SimpleHTTPServerThread(port=prefs.http_port)

                    # Start serving in a separate thread
                    def serve_forever():
                        try:
                            server_thread.serve_forever()
                        except Exception as e:
                            print(f"Server error: {e}")
                            traceback.print_exc()

                    threading.Thread(target=serve_forever, daemon=True).start()

                    self.report({'INFO'}, f"Server started at http://{get_local_ip()}:{prefs.http_port}")
                    context.window_manager.clipboard = f"http://{get_local_ip()}:{prefs.http_port}"

            temp_dir = bpy.app.tempdir
            model_name = f"model_{int(time.time())}.glb"
            model_path = os.path.join(temp_dir, model_name)

            # Копирование ресурсов иконок
            import shutil
            addon_dir = os.path.dirname(os.path.realpath(__file__))
            res_dir = os.path.join(addon_dir, "resources")
            
            # Copy logos directory
            logos_src = os.path.join(res_dir, "logos")
            logos_dst = os.path.join(temp_dir, "logos")
            if os.path.exists(logos_src):
                try:
                    if os.path.exists(logos_dst):
                        shutil.rmtree(logos_dst)
                    shutil.copytree(logos_src, logos_dst)
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to copy logos directory: {e}")
            
            # Copy other resources from root
            for item in os.listdir(res_dir):
                if item.endswith((".svg", ".png", ".ico", ".css", ".js")) and os.path.isfile(os.path.join(res_dir, item)):
                    try:
                        shutil.copy2(
                            os.path.join(res_dir, item),
                            os.path.join(temp_dir, item)
                        )
                    except Exception as e:
                        self.report({'ERROR'}, f"Failed to copy resource {item}: {e}")
                        continue

            success, message = export_to_glb(context, model_path)

            if success:
                template_path = os.path.join(addon_dir, "resources", "index.html")
                try:
                    with open(template_path, 'r') as f:
                        html_content = f.read()
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to read template: {e}")
                    return {'CANCELLED'}

                # Check if html_props exists
                if hasattr(context.scene, 'html_props'):
                    props = context.scene.html_props
                    hdri_type = context.scene.html_viewer_hdri_type
                else:
                    self.report({'ERROR'}, "HTML properties not available")
                    return {'CANCELLED'}

                model_attrs = [
                    f'id="model"',
                    f'src="./{model_name}"',
                    f'environment-image="neutral"',
                    f'exposure="{props.exposure}"',
                    f'shadow-intensity="{props.hdri_intensity}"',
                    f'environment-rotation="{props.hdri_rotation}deg"',
                    f'camera-controls',
                    f'auto-rotate="false"'
                ]

                if context.scene.html_viewer_copy_transform:
                    if context.space_data.type == 'VIEW_3D':
                        view = context.space_data.region_3d
                        if view:
                            yaw = round(math.degrees(view.view_rotation.to_euler().z), 1)
                            pitch = round(math.degrees(view.view_rotation.to_euler().x), 1)
                            distance = round(view.view_distance * 1.5, 1)
                            model_attrs.append(f'camera-orbit="{yaw}deg {pitch}deg {distance}%"')

                try:
                    updated_html = re.sub(
                        r'<model-viewer\s+id="model"[^>]*>',
                        f'<model-viewer {" ".join(model_attrs)}>',
                        html_content,
                        flags=re.DOTALL
                    )
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to update HTML: {e}")
                    return {'CANCELLED'}

                # Add background color data to viewer container
                bg_color_data = f'data-bg-color="{props.background_color[0]},{props.background_color[1]},{props.background_color[2]}"'
                try:
                    updated_html = re.sub(
                        r'<div class="viewer-container" id="viewer-container-id">',
                        f'<div class="viewer-container" id="viewer-container-id" {bg_color_data}>',
                        updated_html
                    )
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to add background color data: {e}")
                    return {'CANCELLED'}

                hdri_name = ""
                if hdri_type == HDRI_FROM_SCENE:
                    # Export HDRI directly to temp directory where server can serve it
                    hdri_path = os.path.join(temp_dir, "default.hdr")
                    hdri_success, hdri_message = export_scene_hdri(context, hdri_path)

                    if not hdri_success:
                        self.report({'ERROR'}, f"HDRI export failed: {hdri_message}")
                        return {'CANCELLED'}

                    hdri_name = "default.hdr"

                elif hdri_type == HDRI_CUSTOM:
                    custom_path = bpy.path.abspath(context.scene.html_viewer_hdri_path)
                    if not os.path.exists(custom_path):
                        self.report({'ERROR'}, "Custom HDRI path is invalid")
                        return {'CANCELLED'}

                    hdri_name = os.path.basename(custom_path)
                    hdri_path = os.path.join(temp_dir, hdri_name)
                    try:
                        shutil.copy2(custom_path, hdri_path)
                    except Exception as e:
                        self.report({'ERROR'}, f"Failed to copy HDRI: {e}")
                        return {'CANCELLED'}

                # Only update environment-image if we have a valid HDRI file
                if hdri_type != HDRI_NONE and hdri_name:
                    # Verify the HDRI file actually exists in temp directory
                    hdri_file_path = os.path.join(temp_dir, hdri_name)
                    if os.path.exists(hdri_file_path):
                        try:
                            updated_html = re.sub(
                                r'environment-image="[^"]*"',
                                f'environment-image="./{hdri_name}"',
                                updated_html
                            )
                        except Exception as e:
                            self.report({'ERROR'}, f"Failed to update HDRI in HTML: {e}")
                            return {'CANCELLED'}
                    else:
                        self.report({'WARNING'}, f"HDRI file {hdri_name} not found, using default environment")
                        # Keep the default "neutral" environment

                html_path = os.path.join(temp_dir, "index.html")
                try:
                    # Update the model filename in the HTML
                    updated_html = re.sub(
                        r'src="MODEL_PLACEHOLDER\.glb"',
                        f'src="{model_name}"',
                        updated_html
                    )
                    with open(html_path, 'w') as f:
                        f.write(updated_html)
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to write HTML: {e}")
                    return {'CANCELLED'}

                try:
                    # Check if we're using HTTPS or HTTP
                    prefs = context.preferences.addons["zarbo_viewer_lan"].preferences
                    if prefs.use_https:
                        webbrowser.open(f"https://{get_local_ip()}:{prefs.https_port}")
                    else:
                        webbrowser.open(f"http://{get_local_ip()}:{prefs.http_port}")
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to open browser: {e}")
            else:
                self.report({'ERROR'}, message)

            return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, f"Export and View failed: {e}")
            traceback.print_exc()
            return {'CANCELLED'}

def register():
    try:
        safe_register_class(HTML_OT_ExportAndView)
        print(f"Registered class: HTML_OT_ExportAndView")
    except ValueError as e:
        if "register_class(...): already registered as a subclass" in str(e):
            print(f"Class HTML_OT_ExportAndView already registered, skipping")
        else:
            print(f"Error registering HTML_OT_ExportAndView: {e}")
            traceback.print_exc()

def unregister():
    # Ensure server_thread exists in globals
    if 'server_thread' not in globals():
        globals()['server_thread'] = None

    # Declare server_thread as global
    global server_thread

    # Check if server_thread is defined
    if server_thread:
        try:
            server_thread.stop()
            server_thread = None
            print("Server stopped")
        except Exception as e:
            print(f"Error stopping server: {e}")

    try:
        safe_unregister_class(HTML_OT_ExportAndView)
        print(f"Unregistered class: HTML_OT_ExportAndView")
    except Exception as e:
        print(f"Error unregistering HTML_OT_ExportAndView: {e}")
