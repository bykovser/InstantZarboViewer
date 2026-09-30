"""USDZ in a background Blender: imports the session GLB and writes an ARKit-compliant USDZ.

A separate process keeps the user's scene untouched. By default it's this same Blender
(5.2 output opens on iOS once sanitized, see usdz_worker.py); the preference can point to another one.
"""
import json
import os
import subprocess
from pathlib import Path

import bpy

WORKER = Path(__file__).with_name("usdz_worker.py")


class UsdzError(RuntimeError):
    pass


def usdz_blender(pref_path: str) -> Path | None:
    path = Path(bpy.path.abspath(pref_path)) if pref_path else Path(bpy.app.binary_path)
    return path if path.is_file() else None


def export_usdz(glb: Path, blender: Path, texture_size: str, animation: bool,
                flatten: bool = True, timeout: float = 600) -> Path:
    dst = glb.with_suffix(".usdz")
    max_size = "0" if texture_size == 'KEEP' else texture_size
    # Older iOS can't read newer crate files (Blender 4.5 wrote 0.9.0).
    env = {**os.environ, "USD_WRITE_NEW_USDC_FILES_AS_VERSION": "0.8.0"}
    proc = subprocess.run(
        [str(blender), "-b", "--factory-startup", "--python", str(WORKER), "--",
         str(glb), str(dst), max_size, "1" if animation else "0", "1" if flatten else "0"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, env=env,
    )
    line = next((l for l in proc.stdout.splitlines() if l.startswith("IZV_RESULT ")), None)
    if line is None:
        tail = (proc.stderr or proc.stdout).strip().splitlines()[-5:]
        raise UsdzError("USDZ export failed:\n" + "\n".join(tail))
    problems = json.loads(line[len("IZV_RESULT "):])["arkit"]
    if problems:
        print("[IZV] ARKit compliance:", *problems, sep="\n  ")
    return dst
