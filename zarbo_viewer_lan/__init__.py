import sys
import os

# Debug: Print current module information
print(f"DEBUG: __init__.py loaded, __name__ = {__name__}")
print(f"DEBUG: __file__ = {__file__}")
print(f"DEBUG: Current working directory = {os.getcwd()}")
print(f"DEBUG: Python path includes: {[p for p in sys.path if 'zarbo' in p.lower() or '2.3' in p]}")

bl_info = {
    "name": "Zarbo Viewer LAN",
    "author": "BykovSer",
    "version": (2, 4, 0),
    "blender": (4, 5, 0),
    "location": "View3D > Sidebar > Zarbo",
    "description": "Local network viewer for 3D models with Blender integration",
    "category": "3D View",
    "doc_url": "",
    "tracker_url": "",
    "support": "COMMUNITY"
}

def register():
    print(f"DEBUG: register() called, __name__ = {__name__}")
    from . import viewer, LANserver, UI
    # Register in reverse order
    UI.register()
    LANserver.register()
    viewer.register()

def unregister():
    from . import viewer, LANserver, UI
    # Unregister in reverse order
    viewer.unregister()
    LANserver.unregister()
    UI.unregister()

if __name__ == "__main__":
    register()
