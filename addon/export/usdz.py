"""USDZ via a legacy Blender (4.1) subprocess: USDZ from 4.2+/5.x doesn't open on iOS Quick Look.

The current Blender exports GLB; the legacy one imports it and writes an ARKit-compliant USDZ.
"""
import json
import subprocess
from pathlib import Path

WORKER = Path(__file__).with_name("usdz_legacy_worker.py")
DEFAULT_LEGACY_BLENDER = Path("C:/Program Files/Blender Foundation/Blender 4.1/blender.exe")


class UsdzError(RuntimeError):
    pass


def legacy_blender(pref_path: str) -> Path | None:
    path = Path(pref_path) if pref_path else DEFAULT_LEGACY_BLENDER
    return path if path.is_file() else None


def export_usdz(glb: Path, blender: Path, texture_size: str, animation: bool, timeout: float = 600) -> Path:
    dst = glb.with_suffix(".usdz")
    max_size = "0" if texture_size == 'KEEP' else texture_size
    proc = subprocess.run(
        [str(blender), "-b", "--factory-startup", "--python", str(WORKER), "--",
         str(glb), str(dst), max_size, "1" if animation else "0"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    line = next((l for l in proc.stdout.splitlines() if l.startswith("IZV_RESULT ")), None)
    if line is None:
        tail = (proc.stderr or proc.stdout).strip().splitlines()[-5:]
        raise UsdzError("USDZ export failed:\n" + "\n".join(tail))
    problems = json.loads(line[len("IZV_RESULT "):])["arkit"]
    if problems:
        print("[IZV] ARKit compliance:", *problems, sep="\n  ")
    return dst
