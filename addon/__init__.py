import bpy

from . import live, operators, panels, preferences, properties
from .server import http

CLASSES = (
    *preferences.CLASSES,
    *properties.CLASSES,
    *operators.CLASSES,
    *panels.CLASSES,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    properties.attach()
    preferences.push_zarbo(preferences.get())
    live.register()


def unregister():
    live.unregister()
    http.stop()
    properties.detach()
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
