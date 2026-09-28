"""Instant Zarbo Viewer — Blender Extension. Здесь только версия, register и unregister."""
import re
from pathlib import Path

import bpy


def _read_version() -> str:
    """Версия из манифеста: одно место правды, оно же попадает в имя зипки."""
    try:
        text = (Path(__file__).parent / "blender_manifest.toml").read_text(encoding="utf-8")
        found = re.search(r'^\s*version\s*=\s*"([^"]+)"', text, re.M)
        return found.group(1) if found else "?"
    except OSError:
        return "?"


__version__ = _read_version()

from . import live, operators, panels, preferences, properties  # noqa: E402
from .server import http  # noqa: E402

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
