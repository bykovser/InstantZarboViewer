"""Схлопывание материалов для USDZ (UsdPreviewSurface / iOS Quick Look).

UsdPreviewSurface не умеет transmission, IOR, specular tint/level и прочие каналы
KHR_materials_*: на iPhone стекло и металл превращаются в серый пластик. Нод-группы
TtoA (стекло) и PBRtoUSDz (металл/диэлектрик) загоняют эти каналы в базовый PBR.

Портировано из EzExport (ez_export/adaptation.py), который взял это из MaxConverter.
Отличие: там адаптация применяется к сцене Blender перед экспортом, у нас — в воркере
USDZ, к материалам, восстановленным glTF-импортёром из session GLB, в отдельном процессе.

Группы лежат в addon/assets/usdz_nodes.blend — вырезаны из
EzExport/ez_export/assets/library.blend (22 МБ -> 616 КБ, только эти две группы).
"""
from pathlib import Path

import bpy

LIBRARY = Path(__file__).resolve().parent.parent / "assets" / "usdz_nodes.blend"

# Что забираем у Principled BSDF в группу и что возвращаем обратно.
TTOA_INPUTS = ['Base Color', 'Metallic', 'Roughness', 'IOR', 'Transmission Weight']
TTOA_OUTPUT_MAP = {
    'Base color': 'Base Color', 'Metallic': 'Metallic',
    'Roughness': 'Roughness', 'Alpha': 'Alpha',
}
TTOA_NEUTRALIZE = {'IOR': 1.5, 'Transmission Weight': 0.0}

PBR_INPUTS = [
    'Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha',
    'Specular IOR Level', 'Specular Tint',
    'Emission Color', 'Emission Strength',
]
PBR_OUTPUT_MAP = {
    'Base Color': 'Base Color', 'Metallic': 'Metallic',
    'Roughness': 'Roughness',
    'Emission Color': 'Emission Color', 'Emission Strength': 'Emission Strength',
}
# Alpha для PBRtoUSDz намеренно НЕ возвращаем: линк на BSDF переводит материал в blend,
# и полностью непрозрачные модели становятся полупрозрачными.
PBR_NEUTRALIZE = {
    'IOR': 1.5, 'Specular IOR Level': 0.5,
    'Specular Tint': (1.0, 1.0, 1.0, 1.0),
}


def find_bsdf(mat):
    """Principled BSDF, который реально кормит Material Output."""
    tree = getattr(mat, "node_tree", None)
    if tree is None:
        return None
    out = next((n for n in tree.nodes if n.bl_idname == "ShaderNodeOutputMaterial"), None)
    if out is not None:
        link = next((l for l in tree.links if l.to_node is out and l.to_socket.name == "Surface"), None)
        if link is not None and link.from_node.bl_idname == "ShaderNodeBsdfPrincipled":
            return link.from_node
    return next((n for n in tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)


def detect_adaptation_group(bsdf) -> str:
    """Стекло -> TtoA, иначе металл/диэлектрик с нестандартным IOR -> PBRtoUSDz.

    Ровно та эвристика, что в EzExport/MaxConverter: Transmission Weight (связан или
    > 0.01) — стекло; иначе IOR (связан или > 2.0) — металл; Blender-овский дефолт 1.5
    не трогаем совсем.
    """
    trans = bsdf.inputs.get('Transmission Weight')
    if trans and (trans.is_linked or trans.default_value > 0.01):
        return 'TtoA'
    ior = bsdf.inputs.get('IOR')
    if ior and (ior.is_linked or ior.default_value > 2.0):
        return 'PBRtoUSDz'
    return 'NONE'


def _find_node_group(name, library=LIBRARY):
    ng = bpy.data.node_groups.get(name)
    if ng is not None:
        return ng
    if not Path(library).is_file():
        return None
    with bpy.data.libraries.load(str(library), link=False) as (data_from, data_to):
        # В разных версиях Blender эта коллекция отдаёт то имена, то сами датаблоки.
        if name in {getattr(g, "name", g) for g in data_from.node_groups}:
            data_to.node_groups = [name]
    ng = bpy.data.node_groups.get(name)
    if ng is not None:
        ng.use_fake_user = True   # библиотеку читаем один раз на процесс
    return ng


def _insert_adaptation_group(mat, bsdf, group, input_names, output_map, neutralize):
    """Вставить группу между тем, что кормит входы BSDF, и самим BSDF."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    group_node = nodes.new('ShaderNodeGroup')
    group_node.node_tree = group
    group_node.label = group.name
    group_node.location = (bsdf.location.x - 300, bsdf.location.y)

    for name in input_names:
        bsdf_in = bsdf.inputs.get(name)
        group_in = group_node.inputs.get(name)
        if bsdf_in is None or group_in is None:
            continue
        if bsdf_in.is_linked:
            links.new(bsdf_in.links[0].from_socket, group_in)
        else:
            group_in.default_value = bsdf_in.default_value

    for out_name, bsdf_name in output_map.items():
        group_out = group_node.outputs.get(out_name)
        bsdf_in = bsdf.inputs.get(bsdf_name)
        if group_out is None or bsdf_in is None:
            continue
        if bsdf_in.is_linked:
            links.remove(bsdf_in.links[0])
        links.new(group_out, bsdf_in)

    for bsdf_name, value in neutralize.items():
        bsdf_in = bsdf.inputs.get(bsdf_name)
        if bsdf_in is None:
            continue
        if bsdf_in.is_linked:
            links.remove(bsdf_in.links[0])
        bsdf_in.default_value = value

    return group_node


def apply_usdz_adaptation(objects=None, library=LIBRARY) -> dict:
    """Схлопнуть все подходящие материалы. Возвращает счётчики по группам."""
    if objects is None:
        objects = bpy.context.scene.objects
    if not Path(library).is_file():
        print(f"[IZV] USDZ: {library} не найден, адаптация материалов пропущена")
        return {}

    groups = {}
    seen = set()
    counts = {'TtoA': 0, 'PBRtoUSDz': 0, 'skipped': 0}

    for obj in objects:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            bsdf = find_bsdf(mat)
            if bsdf is None:
                continue
            name = detect_adaptation_group(bsdf)
            if name == 'NONE':
                counts['skipped'] += 1
                continue
            if name not in groups:
                groups[name] = _find_node_group(name, library)
            group = groups[name]
            if group is None:
                print(f"[IZV] USDZ: группа {name} не найдена в {library}, {mat.name} пропущен")
                counts['skipped'] += 1
                continue
            table = (TTOA_INPUTS, TTOA_OUTPUT_MAP, TTOA_NEUTRALIZE) if name == 'TtoA' \
                else (PBR_INPUTS, PBR_OUTPUT_MAP, PBR_NEUTRALIZE)
            _insert_adaptation_group(mat, bsdf, group, *table)
            counts[name] += 1

    print("[IZV] USDZ material adaptation: " + str(counts))
    return counts
