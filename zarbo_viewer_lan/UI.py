import bpy
import traceback

from .utils import HDRI_FROM_SCENE, HDRI_NONE, HDRI_CUSTOM, COPY_TRANSFORM_ENABLED, COPY_TRANSFORM_DISABLED

# Global tracking of registered classes
_REGISTERED_CLASSES = set()

class HTML_Properties(bpy.types.PropertyGroup):
    # UI state properties
    show_access_section: bpy.props.BoolProperty(
        name="Show Access Section",
        default=False,
        description="Show access information for other devices"
    )
    
    show_hdri_section: bpy.props.BoolProperty(
        name="Show HDRI Section", 
        default=True,
        description="Show HDRI settings"
    )
    
    # HDRI properties
    hdri_intensity: bpy.props.FloatProperty(
        name="HDRI Intensity",
        min=0.0,
        max=2.0,
        default=1.0,
        description="Intensity of the HDRI environment"
    )
    
    hdri_rotation: bpy.props.FloatProperty(
        name="HDRI Rotation",
        min=0.0,
        max=360.0,
        default=0.0,
        description="Rotation of the HDRI environment"
    )

    # Additional properties
    copy_transform: bpy.props.EnumProperty(
        items=[
            (COPY_TRANSFORM_ENABLED, "Enabled", "Copy transform from Blender view"),
            (COPY_TRANSFORM_DISABLED, "Disabled", "Don't copy transform")
        ],
        name="Copy Transform",
        default=COPY_TRANSFORM_ENABLED
    )

    exposure: bpy.props.FloatProperty(
        name="Exposure",
        min=0.1,
        max=2.0,
        default=0.75,
        description="Exposure value for the environment"
    )

    background_color: bpy.props.FloatVectorProperty(
        name="Background Color",
        subtype='COLOR',
        size=3,
        min=0.0,
        max=1.0,
        default=(1.0, 1.0, 1.0),
        description="Background color for the viewer"
    )

class HTML_PT_ViewerPanel(bpy.types.Panel):
    bl_label = "InstantMV View"
    bl_idname = "HTML_PT_ViewerPanel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "InstantMV"

    def draw(self, context):
        try:
            layout = self.layout

            # Check if html_props exists
            if not hasattr(context.scene, 'html_props'):
                layout.label(text="HTML properties not available", icon='ERROR')
                return

            props = context.scene.html_props

            # Single Export and View button with two-line label
            box = layout.box()
            row = box.row(align=True)
            row.scale_y = 2
            op = row.operator("html.export_and_view", text="Export and View", icon='URL')

            # HDRI settings (collapsible)
            if context.scene.html_viewer_show_hdri:
                box = layout.box()
                row = box.row()
                row = box.row()
                split = row.split(factor=0.4)
                split.prop(props, "show_hdri_section",
                        text="HDRI Source",
                        icon='TRIA_DOWN' if props.show_hdri_section else 'TRIA_RIGHT',
                        emboss=False)
                split.prop(context.scene, "html_viewer_hdri_type", text="")

                if props.show_hdri_section:
                    if context.scene.html_viewer_hdri_type == HDRI_CUSTOM:
                        row = box.row()
                        row.prop(context.scene, "html_viewer_hdri_path", text="File")

                    # row = box.row()
                    # row.prop(props, "hdri_intensity")
                    # row = box.row()
                    # row.prop(props, "hdri_rotation")
                    # row = box.row()
                    # row.prop(props, "exposure")
                    row = box.row()
                    row.prop(props, "background_color")
                    # row = box.row()
                    # row.prop(context.scene, "html_viewer_copy_transform")

            # Access section (collapsible)
            box = layout.box()
            row = box.row()
            row.prop(props, "show_access_section", text="Webserver Settings",
                    icon='TRIA_DOWN' if props.show_access_section else 'TRIA_RIGHT',
                    emboss=False)

            if props.show_access_section:
                # Get local IP and preferences
                from .utils import get_local_ip
                local_ip = get_local_ip()
                prefs = context.preferences.addons["zarbo_viewer_lan"].preferences
                
                # Check server status using helper function
                try:
                    from .LANserver import is_server_running, get_server_info
                    server_running = is_server_running()
                    server_info = get_server_info()
                except (ImportError, NameError):
                    server_running = False
                    server_info = {'running': False}
                
                # Server Status Section
                status_row = box.row()
                status_row.label(text="Server Status:")
                if server_running:
                    status_row.label(text="RUNNING", icon='CHECKMARK')
                    # Show actual running port from server info
                    if server_info.get('port'):
                        actual_port = server_info['port']
                        protocol = "HTTPS" if actual_port == prefs.https_port else "HTTP"
                        box.label(text=f"Protocol: {protocol} | Port: {actual_port}")
                    else:
                        protocol = "HTTPS" if prefs.use_https else "HTTP"
                        port = prefs.https_port if prefs.use_https else prefs.http_port
                        box.label(text=f"Protocol: {protocol} | Port: {port}")
                else:
                    status_row.label(text="STOPPED", icon='X')
                
                # Control Buttons
                button_row = box.row(align=True)
                if server_running:
                    button_row.operator("html.stop_server", text="Stop Server", icon='PAUSE')
                else:
                    button_row.operator("html.start_server", text="Start Server", icon='PLAY')
                
                # Network Information
                box.separator()
                box.label(text=f"Local IP: {local_ip}")
                
                # Show URL only if server is running
                if server_running:
                    if prefs.use_https:
                        view_url = f"https://{local_ip}:{prefs.https_port}/index.html"
                    else:
                        view_url = f"http://{local_ip}:{prefs.http_port}/index.html"
                    
                    url_row = box.row()
                    url_row.label(text="Server URL:")
                    url_row = box.row()
                    url_row.label(text=view_url, icon='URL')
                    
                    # URL action buttons
                    button_row = box.row(align=True)
                    
                    # Copy URL button
                    copy_op = button_row.operator("html.copy_url", text="Copy URL", icon='COPYDOWN')
                    copy_op.url = view_url
                    
                    # Open URL button
                    open_op = button_row.operator("wm.url_open", text="Open", icon='URL')
                    open_op.url = view_url
        except Exception as e:
            layout.label(text=f"Error drawing panel: {e}", icon='ERROR')
            traceback.print_exc()

class HTML_OT_CopyURL(bpy.types.Operator):
    bl_idname = "html.copy_url"
    bl_label = "Copy URL to Clipboard"
    bl_description = "Copy server URL to clipboard"
    
    url: bpy.props.StringProperty()
    
    def execute(self, context):
        context.window_manager.clipboard = self.url
        self.report({'INFO'}, f"URL copied to clipboard: {self.url}")
        return {'FINISHED'}

class HTML_OT_ApplyHDRI(bpy.types.Operator):
    bl_idname = "html.apply_hdri"
    bl_label = "Apply HDRI Settings"

    def execute(self, context):
        try:
            # Check if html_props exists
            if not hasattr(context.scene, 'html_props'):
                self.report({'ERROR'}, "HTML properties not available")
                return {'CANCELLED'}

            props = context.scene.html_props
            hdri_type = context.scene.html_viewer_hdri_type

            # Update exposure and transform settings
            if hdri_type == HDRI_CUSTOM:
                context.scene.html_viewer_exposure = props.exposure

            if context.scene.html_viewer_copy_transform:
                if context.space_data.type == 'VIEW_3D':
                    view = context.space_data.region_3d
                    if view:
                        # Get camera orbit values for future implementation
                        yaw = round(view.view_rotation.to_euler().z, 1)
                        pitch = round(view.view_rotation.to_euler().x, 1)
                        distance = round(view.view_distance * 1.5, 1)

                        print(f"DEBUG: Camera transform - yaw: {yaw}°, pitch: {pitch}°, distance: {distance}%")
                        self.report({'INFO'}, f"Camera transform copied at {yaw}° {pitch}° {distance}%")

            return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, f"Failed to apply HDRI settings: {e}")
            traceback.print_exc()
            return {'CANCELLED'}
###
class ServerPreferences(bpy.types.AddonPreferences):
    bl_idname = "zarbo_viewer_lan"

    use_https: bpy.props.BoolProperty(
        name="Use HTTPS",
        default=False,
        description="Use HTTPS instead of HTTP (requires SSL certificates)"
    )

    auto_generate_certs: bpy.props.BoolProperty(
        name="Auto Generate Certificates",
        default=False,
        description="Automatically generate SSL certificates if not found"
    )

    https_port: bpy.props.IntProperty(
        name="HTTPS Port",
        min=1024,
        max=65535,
        default=8443,
        description="Port for secure HTTPS connections"
    )
    
    http_port: bpy.props.IntProperty(
        name="HTTP Port",
        min=1024,
        max=65535,
        default=8080,
        description="Port for HTTP connections"
    )
    
    cert_path: bpy.props.StringProperty(
        name="SSL Certificate",
        subtype='FILE_PATH',
        default="//cert.pem",
        description="Path to SSL certificate file (leave default to use addon's built-in certificates)"
    )
    
    key_path: bpy.props.StringProperty(
        name="SSL Key",
        subtype='FILE_PATH',
        default="//key.pem",
        description="Path to SSL private key file (leave default to use addon's built-in certificates)"
    )

    def draw(self, context):
        layout = self.layout
        layout.use_property_split = True
        layout.use_property_decorate = False

        col = layout.column()
        col.prop(self, "use_https")
        if self.use_https:
            col.prop(self, "https_port")
            col.separator()
            
            # Add helpful note about built-in certificates
            box = col.box()
            box.label(text="SSL Certificates:", icon='INFO')
            box.label(text="• Leave paths as default to use addon's built-in certificates")
            box.label(text="• Or specify custom certificate paths below")
            
            col.prop(self, "cert_path")
            col.prop(self, "key_path")
            col.prop(self, "auto_generate_certs")
        else:
            col.prop(self, "http_port")
class VIEW3D_PT_ServerPanel(bpy.types.Panel):
    bl_label = "Local Server"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Tool"

    def draw(self, context):
        try:
            layout = self.layout
            prefs = context.preferences.addons["zarbo_viewer_lan"].preferences

            # Import server_thread but don't use it directly
            # Check if server_thread is defined
            if 'server_thread' in globals() and server_thread:
                from .LANserver import get_local_ip
                # Check if we're using HTTPS or HTTP
                if prefs.use_https:
                    layout.label(text=f"Running: https://{get_local_ip()}:{prefs.https_port}", icon='URL')
                else:
                    layout.label(text=f"Running: http://{get_local_ip()}:{prefs.http_port}", icon='URL')
                layout.operator("html.stop_server", text="Stop Server", icon='CANCEL')
            else:
                if prefs.use_https:
                    layout.prop(prefs, "https_port")
                else:
                    layout.prop(prefs, "http_port")
                layout.operator("html.start_server", text="Start Server", icon='PLAY')
        except Exception as e:
            layout.label(text=f"Error drawing panel: {e}", icon='ERROR')
            traceback.print_exc()
###
def safe_register_class(cls):
    """
    Safely register a Blender class, preventing duplicate registrations
    """
    try:
        if cls not in _REGISTERED_CLASSES:
            bpy.utils.register_class(cls)
            _REGISTERED_CLASSES.add(cls)
            print(f"Registered class: {cls.__name__}")
        else:
            print(f"Class {cls.__name__} already registered, skipping")
    except ValueError as e:
        if "register_class(...): already registered as a subclass" in str(e):
            print(f"Class {cls.__name__} already registered, skipping")
        else:
            print(f"Error registering {cls.__name__}: {e}")
            traceback.print_exc()
    except Exception as e:
        print(f"Error registering {cls.__name__}: {e}")
        traceback.print_exc()

def safe_unregister_class(cls):
    """
    Safely unregister a Blender class
    """
    try:
        if cls in _REGISTERED_CLASSES:
            bpy.utils.unregister_class(cls)
            _REGISTERED_CLASSES.remove(cls)
            print(f"Unregistered class: {cls.__name__}")
    except Exception as e:
        print(f"Error unregistering {cls.__name__}: {e}")
        traceback.print_exc()
###
def register():
    # Register HTML_Properties first
    safe_register_class(HTML_Properties)

    # Register ServerPreferences
    safe_register_class(ServerPreferences)

    # Register the property after the class
    if not hasattr(bpy.types.Scene, "html_props"):
        bpy.types.Scene.html_props = bpy.props.PointerProperty(type=HTML_Properties)

    # Register other scene properties
    if not hasattr(bpy.types.Scene, "html_viewer_hdri_type"):
        bpy.types.Scene.html_viewer_hdri_type = bpy.props.EnumProperty(
            items=[
                (HDRI_FROM_SCENE, "Scene", "Use HDRI from current scene"),
                (HDRI_NONE, "None (default MV scene)", "Use default model-viewer environment"),
                (HDRI_CUSTOM, "Custom", "Use custom HDRI path")
            ],
            name="HDRI Source",
            default=HDRI_NONE
        )

    if not hasattr(bpy.types.Scene, "html_viewer_hdri_path"):
        bpy.types.Scene.html_viewer_hdri_path = bpy.props.StringProperty(
            name="HDRI Path",
            subtype='FILE_PATH',
            description="Path to custom HDRI file",
            default="//hdri.hdr"
        )

    if not hasattr(bpy.types.Scene, "html_viewer_copy_transform"):
        bpy.types.Scene.html_viewer_copy_transform = bpy.props.BoolProperty(
            name="Copy Transform",
            default=True,
            description="Copy transform from Blender to viewer"
        )

    if not hasattr(bpy.types.Scene, "html_viewer_exposure"):
        bpy.types.Scene.html_viewer_exposure = bpy.props.FloatProperty(
            name="Exposure",
            min=0.1,
            max=2.0,
            default=0.75,
            description="Exposure value for the environment"
        )

    if not hasattr(bpy.types.Scene, "html_viewer_show_hdri"):
        bpy.types.Scene.html_viewer_show_hdri = bpy.props.BoolProperty(
            name="Show HDRI Settings",
            default=True,
            description="Show HDRI settings"
        )

    if not hasattr(bpy.types.Scene, "html_viewer_show_access"):
        bpy.types.Scene.html_viewer_show_access = bpy.props.BoolProperty(
            name="Show Access Information",
            default=False,
            description="Show access information for other devices"
        )
    
    safe_register_class(HTML_PT_ViewerPanel)
    safe_register_class(HTML_OT_CopyURL)
    safe_register_class(HTML_OT_ApplyHDRI)
    # safe_register_class(VIEW3D_PT_ServerPanel)  # Moved to main panel
    
    # HDRI and UI properties
    hdri_type_items = [
        (HDRI_FROM_SCENE, "Scene", "Use HDRI from current scene"),
        (HDRI_NONE, "None (default MV scene)", "Use default model-viewer environment"),
        (HDRI_CUSTOM, "Custom", "Use custom HDRI path")
    ]
    bpy.types.Scene.html_viewer_hdri_type = bpy.props.EnumProperty(
        items=hdri_type_items,
        name="HDRI Source",
        default=HDRI_NONE
    )
    
    bpy.types.Scene.html_viewer_hdri_path = bpy.props.StringProperty(
        name="HDRI Path",
        subtype='FILE_PATH',
        description="Path to custom HDRI file",
        default="//hdri.hdr"
    )

    bpy.types.Scene.html_viewer_copy_transform = bpy.props.BoolProperty(
        name="Copy Transform",
        default=True,
        description="Copy transform from Blender to viewer"
    )

    bpy.types.Scene.html_viewer_exposure = bpy.props.FloatProperty(
        name="Exposure",
        min=0.1,
        max=2.0,
        default=0.75,
        description="Exposure value for the environment"
    )

    bpy.types.Scene.html_viewer_show_hdri = bpy.props.BoolProperty(
        name="Show HDRI Settings",
        default=True,
        description="Show HDRI settings"
    )

    bpy.types.Scene.html_viewer_show_access = bpy.props.BoolProperty(
        name="Show Access Information",
        default=False,
        description="Show access information for other devices"
    )

def unregister():
    safe_unregister_class(HTML_OT_ApplyHDRI)
    safe_unregister_class(HTML_OT_CopyURL)
    safe_unregister_class(HTML_PT_ViewerPanel)
    safe_unregister_class(VIEW3D_PT_ServerPanel)
    safe_unregister_class(HTML_Properties)

    # Unregister properties
    try:
        if hasattr(bpy.types.Scene, 'html_props'):
            del bpy.types.Scene.html_props
    except Exception as e:
        print(f"Error unregistering html_props: {e}")

    try:
        if hasattr(bpy.types.Scene, 'html_viewer_hdri_type'):
            del bpy.types.Scene.html_viewer_hdri_type
    except Exception as e:
        print(f"Error unregistering html_viewer_hdri_type: {e}")

    try:
        if hasattr(bpy.types.Scene, 'html_viewer_hdri_path'):
            del bpy.types.Scene.html_viewer_hdri_path
    except Exception as e:
        print(f"Error unregistering html_viewer_hdri_path: {e}")

    try:
        if hasattr(bpy.types.Scene, 'html_viewer_copy_transform'):
            del bpy.types.Scene.html_viewer_copy_transform
    except Exception as e:
        print(f"Error unregistering html_viewer_copy_transform: {e}")

    try:
        if hasattr(bpy.types.Scene, 'html_viewer_exposure'):
            del bpy.types.Scene.html_viewer_exposure
    except Exception as e:
        print(f"Error unregistering html_viewer_exposure: {e}")

    try:
        if hasattr(bpy.types.Scene, 'html_viewer_show_hdri'):
            del bpy.types.Scene.html_viewer_show_hdri
    except Exception as e:
        print(f"Error unregistering html_viewer_show_hdri: {e}")

    try:
        if hasattr(bpy.types.Scene, 'html_viewer_show_access'):
            del bpy.types.Scene.html_viewer_show_access
    except Exception as e:
        print(f"Error unregistering html_viewer_show_access: {e}")

    # Clear registered classes
    _REGISTERED_CLASSES.clear()
