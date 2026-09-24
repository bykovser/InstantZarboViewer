import { DoubleSide, FrontSide } from 'three';

// Live patch from Blender: glTF-level factors only, keyed by material name.
// Returns names of properties the material can't take without a re-export
// (e.g. transmission on a MeshStandardMaterial — the loader picks the class by glTF extensions).

const PHYSICAL = ['ior', 'transmission', 'clearcoat', 'clearcoatRoughness', 'sheenColor', 'sheenRoughness'];

function setAlphaMode(m, mode) {
  const blend = mode === 'BLEND';
  Object.assign(m, {
    transparent: blend,
    depthWrite: !blend,
    alphaTest: mode === 'MASK' ? 0.5 : 0,
  });
  // Transparency strategies restore from this snapshot; keep it in sync with Blender.
  m.userData.izvOriginal = { transparent: m.transparent, depthWrite: m.depthWrite, alphaHash: false };
}

export function patchMaterial(m, p) {
  const skipped = [];
  if (p.baseColor) m.color.setRGB(...p.baseColor);
  if (p.alpha !== undefined) m.opacity = p.alpha;
  if (p.alphaMode) setAlphaMode(m, p.alphaMode);
  if (p.doubleSided !== undefined) m.side = p.doubleSided ? DoubleSide : FrontSide;
  if (p.metallic !== undefined) m.metalness = p.metallic;
  if (p.roughness !== undefined) m.roughness = p.roughness;
  if (p.emissive) m.emissive.setRGB(...p.emissive);
  if (p.emissiveStrength !== undefined) m.emissiveIntensity = p.emissiveStrength;

  for (const key of PHYSICAL) {
    if (p[key] === undefined) continue;
    if (!m.isMeshPhysicalMaterial) {
      skipped.push(key);
      continue;
    }
    if (key === 'sheenColor') {
      m.sheenColor.setRGB(...p.sheenColor);
      m.sheen = p.sheenColor.some((c) => c > 0) ? 1 : 0;
    } else {
      m[key] = p[key];
    }
  }
  m.needsUpdate = true;
  return skipped;
}

export function materialsByName(root) {
  const map = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (!map.has(m.name)) map.set(m.name, []);
      if (!map.get(m.name).includes(m)) map.get(m.name).push(m);
    }
  });
  return map;
}
